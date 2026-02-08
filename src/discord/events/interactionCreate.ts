import { Interaction, ButtonInteraction, GuildMember, EmbedBuilder } from 'discord.js';
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

/**
 * Handle button interactions for verification
 * Note: We use @everyone permission restrictions so new members can only see #verify-here
 * This button just adds the Verified role to grant access to other channels
 */
async function handleVerifyButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: 'This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member as GuildMember;

  // Check if already verified
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
    await interaction.reply({
      content: 'You are already verified!',
      ephemeral: true,
    });
    return;
  }

  try {
    // Add Verified role - this grants access to other channels
    await member.roles.add(verifiedRole, 'User verified via button');

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Verification Complete')
      .setDescription(
        `Welcome to **${interaction.guild.name}**!\n\n` +
          'You now have access to the server channels.\n' +
          'Make sure to check out the rules and announcements!'
      )
      .setColor(0x2ecc71) // Green
      .setTimestamp();

    await interaction.reply({
      embeds: [successEmbed],
      ephemeral: true,
    });

    console.log(`[Verify] User ${member.user.tag} verified successfully`);
  } catch (error) {
    console.error('[Verify] Error verifying user:', error);
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
