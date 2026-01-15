import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { bootstrapServer } from '../../bootstrap';
import { setGuildId, recordSetup } from '../../server-state';

export const setupCommand = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Bootstrap the server with roles, categories, and channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer reply as bootstrap can take a while
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;

    if (!guild) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }

    console.log(`[Setup] User ${interaction.user.tag} initiated server bootstrap`);

    // Track the guild ID
    setGuildId(guild.id);

    try {
      const result = await bootstrapServer(guild);

      // Record setup completion
      recordSetup();

      // Build response message
      const lines: string[] = [];

      if (result.success) {
        lines.push('**Server Bootstrap Complete**\n');
      } else {
        lines.push('**Server Bootstrap Completed with Errors**\n');
      }

      // Roles summary
      lines.push('**Roles:**');
      if (result.rolesCreated.length > 0) {
        lines.push(`  Created: ${result.rolesCreated.join(', ')}`);
      }
      if (result.rolesSkipped.length > 0) {
        lines.push(`  Skipped (already exist): ${result.rolesSkipped.join(', ')}`);
      }

      // Categories summary
      lines.push('\n**Categories:**');
      if (result.categoriesCreated.length > 0) {
        lines.push(`  Created: ${result.categoriesCreated.join(', ')}`);
      }
      if (result.categoriesSkipped.length > 0) {
        lines.push(`  Skipped (already exist): ${result.categoriesSkipped.join(', ')}`);
      }

      // Channels summary
      lines.push('\n**Channels:**');
      if (result.channelsCreated.length > 0) {
        lines.push(`  Created: ${result.channelsCreated.length} channels`);
      }
      if (result.channelsSkipped.length > 0) {
        lines.push(`  Skipped (already exist): ${result.channelsSkipped.length} channels`);
      }

      // Cleanup summary
      if (result.channelsDeleted.length > 0 || result.categoriesDeleted.length > 0) {
        lines.push('\n**Cleanup:**');
        if (result.channelsDeleted.length > 0) {
          lines.push(`  Deleted channels: ${result.channelsDeleted.join(', ')}`);
        }
        if (result.categoriesDeleted.length > 0) {
          lines.push(`  Deleted categories: ${result.categoriesDeleted.join(', ')}`);
        }
      }

      // Errors
      if (result.errors.length > 0) {
        lines.push('\n**Errors:**');
        result.errors.slice(0, 5).forEach((err) => {
          lines.push(`  - ${err}`);
        });
        if (result.errors.length > 5) {
          lines.push(`  ... and ${result.errors.length - 5} more errors (check logs)`);
        }
      }

      // Important note
      lines.push(
        '\n**Note:** Make sure to position the bot role above the created roles in Server Settings > Roles for proper permission management.'
      );

      await interaction.editReply(lines.join('\n'));
    } catch (error) {
      console.error('[Setup] Error during bootstrap:', error);
      await interaction.editReply(
        'An error occurred during server bootstrap. Please check the bot logs for details.'
      );
    }
  },
};
