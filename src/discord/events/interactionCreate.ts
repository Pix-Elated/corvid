import { Interaction, ButtonInteraction, GuildMember, EmbedBuilder } from 'discord.js';
import { setupCommand } from '../commands/setup';
import { verifyCommand } from '../commands/verify';
import { populateCommand } from '../commands/populate';
import {
  banCommand,
  kickCommand,
  muteCommand,
  unmuteCommand,
  warnCommand,
  warningsCommand,
  clearWarningsCommand,
} from '../commands/moderation';

const VERIFIED_ROLE_NAME = 'Verified';

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
    if (interaction.customId === 'verify_button') {
      await handleVerifyButton(interaction);
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
