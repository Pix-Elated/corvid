import {
  Interaction,
  ButtonInteraction,
  GuildMember,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';
import { setupCommand } from '../commands/setup';
import { verifyCommand } from '../commands/verify';
import { populateCommand } from '../commands/populate';
import { ticketSetupCommand } from '../commands/ticket-setup';
import { rolesSetupCommand } from '../commands/roles-setup';
import { statusCommand } from '../commands/status';
import { postInfoCardsCommand } from '../commands/post-info-cards';
import { handleRoleButton } from './rolePickerHandler';
import {
  banCommand,
  kickCommand,
  muteCommand,
  unmuteCommand,
  warnCommand,
  warningsCommand,
  clearWarningsCommand,
} from '../commands/moderation';
import { scanCommand } from '../commands/scan';
import {
  handleTicketButton,
  handleTicketModal,
  handleCloseButton,
  handleCloseConfirm,
  handleCloseCancel,
  handleConvertToTicket,
  handleConvertModal,
} from './ticketHandler';
import { handlePublishButton, handlePublishModal, handleDiscardButton } from './releaseHandler';
import {
  handleBanUserButton,
  handleBanGuildButton,
  handleBanIPButton,
  handleBanUserModal,
  handleBanGuildModal,
  handleBanIPModal,
} from '../../hall-of-shame/ban-button';

const VERIFIED_ROLE_NAME = 'Verified';
const UPDATES_ROLE_NAME = 'Updates';

/**
 * Handle toggle updates role button
 */
async function handleToggleUpdatesRole(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: 'This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member as GuildMember;
  const updatesRole = interaction.guild.roles.cache.find(
    (r) => r.name.toLowerCase() === UPDATES_ROLE_NAME.toLowerCase()
  );

  if (!updatesRole) {
    await interaction.reply({
      content: 'Updates role not found. Please contact an administrator.',
      ephemeral: true,
    });
    console.error('[Roles] Updates role not found in guild');
    return;
  }

  try {
    if (member.roles.cache.has(updatesRole.id)) {
      // Remove role
      await member.roles.remove(updatesRole, 'User toggled updates role off');
      await interaction.reply({
        content: '🔕 You will no longer be notified about updates.',
        ephemeral: true,
      });
      console.log(`[Roles] Removed Updates role from ${member.user.tag}`);
    } else {
      // Add role
      await member.roles.add(updatesRole, 'User toggled updates role on');
      await interaction.reply({
        content: '🔔 You will now be notified about updates in #announcements!',
        ephemeral: true,
      });
      console.log(`[Roles] Added Updates role to ${member.user.tag}`);
    }
  } catch (error) {
    console.error('[Roles] Error toggling updates role:', error);
    await interaction.reply({
      content: 'Failed to update your role. Please contact an administrator.',
      ephemeral: true,
    });
  }
}

function generateCaptcha(): { question: string; answer: number } {
  const ops = ['+', '-', '*'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number;
  if (op === '+') {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 20) + 10;
    b = Math.floor(Math.random() * 9) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 8) + 2;
    b = Math.floor(Math.random() * 8) + 2;
    answer = a * b;
  }
  return { question: `What is ${a} ${op} ${b}?`, answer };
}

/**
 * Handle the initial verify button click — shows a math captcha modal
 */
async function handleVerifyButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: 'This can only be used in a server.', ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  const verifiedRole = interaction.guild.roles.cache.find(
    (r) => r.name.toLowerCase() === VERIFIED_ROLE_NAME.toLowerCase()
  );

  if (!verifiedRole) {
    await interaction.reply({
      content: 'Verification role not found. Please contact an administrator.',
      ephemeral: true,
    });
    console.error('[Verify] Verified role not found in guild');
    return;
  }

  if (member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply({ content: 'You are already verified!', ephemeral: true });
    return;
  }

  const { question, answer } = generateCaptcha();

  const modal = new ModalBuilder()
    .setCustomId(`verify_captcha_${answer}`)
    .setTitle('Human Verification');

  const input = new TextInputBuilder()
    .setCustomId('captcha_answer')
    .setLabel(question)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Type your answer here')
    .setRequired(true)
    .setMaxLength(6);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

/**
 * Handle captcha modal submission — verify the answer and grant the Verified role
 */
async function handleVerifyCaptchaModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: 'This can only be used in a server.', ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  const expectedAnswer = parseInt(interaction.customId.split('_')[2], 10);
  const userInput = parseInt(interaction.fields.getTextInputValue('captcha_answer').trim(), 10);

  if (isNaN(userInput) || userInput !== expectedAnswer) {
    await interaction.reply({
      content: '❌ Incorrect answer. Click **Verify** again to get a new challenge.',
      ephemeral: true,
    });
    return;
  }

  const verifiedRole = interaction.guild.roles.cache.find(
    (r) => r.name.toLowerCase() === VERIFIED_ROLE_NAME.toLowerCase()
  );

  if (!verifiedRole) {
    await interaction.reply({
      content: 'Verification role not found. Please contact an administrator.',
      ephemeral: true,
    });
    console.error('[Verify] Verified role not found in guild');
    return;
  }

  if (member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply({ content: 'You are already verified!', ephemeral: true });
    return;
  }

  try {
    await member.roles.add(verifiedRole, 'User passed captcha verification');

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Verification Complete')
      .setDescription(
        `Welcome to **${interaction.guild.name}**!\n\n` +
          'You now have access to the server channels.\n' +
          'Make sure to check out the rules and announcements!'
      )
      .setColor(0x2ecc71)
      .setTimestamp();

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
    console.log(`[Verify] User ${member.user.tag} passed captcha and was verified`);
  } catch (error) {
    console.error('[Verify] Error granting Verified role:', error);
    await interaction.reply({
      content: 'Failed to verify. Please contact an administrator.',
      ephemeral: true,
    });
  }
}

/**
 * Handle all interactions (commands and buttons)
 */
export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  // Handle button interactions
  if (interaction.isButton()) {
    const buttonId = interaction.customId;

    // Verification button
    if (buttonId === 'verify_button') {
      await handleVerifyButton(interaction);
      return;
    }

    // Ticket creation buttons
    if (buttonId.startsWith('ticket_') && !buttonId.includes('close')) {
      await handleTicketButton(interaction);
      return;
    }

    // Ticket close buttons
    if (buttonId === 'ticket_close') {
      await handleCloseButton(interaction);
      return;
    }
    if (buttonId === 'ticket_close_confirm') {
      await handleCloseConfirm(interaction);
      return;
    }
    if (buttonId === 'ticket_close_cancel') {
      await handleCloseCancel(interaction);
      return;
    }

    // Convert to ticket button (staff only)
    if (buttonId.startsWith('convert_to_ticket_')) {
      await handleConvertToTicket(interaction);
      return;
    }

    // Updates role toggle (from #roles channel)
    if (buttonId === 'toggle_updates_role') {
      await handleToggleUpdatesRole(interaction);
      return;
    }

    // Role picker buttons (from /roles-setup command panels)
    if (buttonId.startsWith('role_toggle_')) {
      await handleRoleButton(interaction);
      return;
    }

    // Worldmap ban buttons (from #ravenhud-logs identity cards)
    if (buttonId.startsWith('ban_user_')) {
      await handleBanUserButton(interaction);
      return;
    }
    if (buttonId.startsWith('ban_guild_')) {
      await handleBanGuildButton(interaction);
      return;
    }
    if (buttonId.startsWith('ban_ip_')) {
      await handleBanIPButton(interaction);
      return;
    }

    // Release announcement buttons
    if (buttonId === 'release_publish') {
      await handlePublishButton(interaction);
      return;
    }
    if (buttonId === 'release_discard') {
      await handleDiscardButton(interaction);
      return;
    }

    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('ticket_modal_')) {
      await handleTicketModal(interaction);
      return;
    }
    if (interaction.customId.startsWith('convert_modal_')) {
      await handleConvertModal(interaction);
      return;
    }
    if (interaction.customId === 'release_modal') {
      await handlePublishModal(interaction);
      return;
    }
    if (interaction.customId.startsWith('ban_user_modal_')) {
      await handleBanUserModal(interaction);
      return;
    }
    if (interaction.customId.startsWith('ban_guild_modal_')) {
      await handleBanGuildModal(interaction);
      return;
    }
    if (interaction.customId.startsWith('ban_ip_modal_')) {
      await handleBanIPModal(interaction);
      return;
    }
    if (interaction.customId.startsWith('verify_captcha_')) {
      await handleVerifyCaptchaModal(interaction);
      return;
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'setup':
        await setupCommand.execute(interaction);
        break;
      case 'verify':
        await verifyCommand.execute(interaction);
        break;
      case 'populate':
        await populateCommand.execute(interaction);
        break;
      case 'ticket-setup':
        await ticketSetupCommand.execute(interaction);
        break;
      case 'roles-setup':
        await rolesSetupCommand.execute(interaction);
        break;
      case 'status':
        await statusCommand.execute(interaction);
        break;
      case 'info-cards':
        await postInfoCardsCommand.execute(interaction);
        break;
      case 'ban':
        await banCommand.execute(interaction);
        break;
      case 'kick':
        await kickCommand.execute(interaction);
        break;
      case 'mute':
        await muteCommand.execute(interaction);
        break;
      case 'unmute':
        await unmuteCommand.execute(interaction);
        break;
      case 'warn':
        await warnCommand.execute(interaction);
        break;
      case 'warnings':
        await warningsCommand.execute(interaction);
        break;
      case 'clearwarnings':
        await clearWarningsCommand.execute(interaction);
        break;
      case 'scan':
        await scanCommand.execute(interaction);
        break;
      default:
        console.warn(`[InteractionCreate] Unknown command: ${commandName}`);
    }
  } catch (error) {
    console.error(`[InteractionCreate] Error executing command ${commandName}:`, error);

    const errorMessage = 'An error occurred while executing this command.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}
