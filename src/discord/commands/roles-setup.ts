import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  Role,
  parseEmoji,
} from 'discord.js';
import { createPanel } from '../../reaction-roles';
import { RoleOption } from '../../types';

/**
 * Validate and normalize emoji input for Discord buttons
 * Returns the emoji string if valid, or an error message if invalid
 */
function validateEmoji(
  input: string,
  guildEmojis: Map<string, { id: string; name: string; animated: boolean }>
): { valid: true; emoji: string } | { valid: false; error: string } {
  const trimmed = input.trim();

  // Try parsing as Discord emoji format
  const parsed = parseEmoji(trimmed);

  if (parsed) {
    // Custom emoji - verify bot can use it
    if (parsed.id) {
      const guildEmoji = guildEmojis.get(parsed.id);
      if (!guildEmoji) {
        return {
          valid: false,
          error: `Custom emoji not found in this server. Use a server emoji or Unicode emoji.`,
        };
      }
      return { valid: true, emoji: trimmed };
    }
    // Unicode emoji
    return { valid: true, emoji: parsed.name };
  }

  // Check if it looks like a shortcode (common mistake)
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
    return {
      valid: false,
      error: `"${trimmed}" looks like a shortcode. Use the actual emoji (Win+. on Windows) or custom emoji format <:name:id>`,
    };
  }

  // Check if it's just an ID (for custom emojis)
  if (/^\d{17,20}$/.test(trimmed)) {
    const guildEmoji = guildEmojis.get(trimmed);
    if (guildEmoji) {
      const prefix = guildEmoji.animated ? '<a:' : '<:';
      return { valid: true, emoji: `${prefix}${guildEmoji.name}:${trimmed}>` };
    }
    return {
      valid: false,
      error: `Emoji ID "${trimmed}" not found in this server.`,
    };
  }

  // Assume it's a Unicode emoji - Discord will validate on button creation
  return { valid: true, emoji: trimmed };
}

export const rolesSetupCommand = {
  data: new SlashCommandBuilder()
    .setName('roles-setup')
    .setDescription('Create a role picker panel with buttons')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option.setName('title').setDescription('Panel title').setRequired(true)
    )
    .addRoleOption((option) =>
      option.setName('role1').setDescription('First role to add').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('emoji1').setDescription('Emoji for first role').setRequired(true)
    )
    .addRoleOption((option) =>
      option.setName('role2').setDescription('Second role to add').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('emoji2').setDescription('Emoji for second role').setRequired(false)
    )
    .addRoleOption((option) =>
      option.setName('role3').setDescription('Third role to add').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('emoji3').setDescription('Emoji for third role').setRequired(false)
    )
    .addRoleOption((option) =>
      option.setName('role4').setDescription('Fourth role to add').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('emoji4').setDescription('Emoji for fourth role').setRequired(false)
    )
    .addRoleOption((option) =>
      option.setName('role5').setDescription('Fifth role to add').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('emoji5').setDescription('Emoji for fifth role').setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to post panel (defaults to current)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('description').setDescription('Panel description').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetChannel =
      (interaction.options.getChannel('channel') as TextChannel) ||
      (interaction.channel as TextChannel);

    if (!targetChannel || !targetChannel.isTextBased()) {
      await interaction.reply({
        content: 'Invalid channel specified.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const title = interaction.options.getString('title', true);
      const description = interaction.options.getString('description') || undefined;

      // Build guild emoji map for validation
      const guildEmojis = new Map<string, { id: string; name: string; animated: boolean }>();
      interaction.guild.emojis.cache.forEach((emoji) => {
        if (emoji.id) {
          guildEmojis.set(emoji.id, {
            id: emoji.id,
            name: emoji.name || 'emoji',
            animated: emoji.animated || false,
          });
        }
      });

      // Collect roles and emojis
      const roleOptions: RoleOption[] = [];
      const botMember = interaction.guild.members.me;
      const botHighestRole = botMember?.roles.highest;

      for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`) as Role | null;
        const emojiInput = interaction.options.getString(`emoji${i}`);

        if (role && emojiInput) {
          // Validate role is assignable
          if (role.managed) {
            await interaction.editReply({
              content: `Cannot add **${role.name}** - it's managed by an integration.`,
            });
            return;
          }

          if (botHighestRole && role.position >= botHighestRole.position) {
            await interaction.editReply({
              content: `Cannot add **${role.name}** - it's higher than or equal to my highest role.`,
            });
            return;
          }

          // Don't allow dangerous roles
          if (role.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.editReply({
              content: `Cannot add **${role.name}** - it has Administrator permission.`,
            });
            return;
          }

          // Validate emoji
          const emojiResult = validateEmoji(emojiInput, guildEmojis);
          if (!emojiResult.valid) {
            await interaction.editReply({
              content: `Invalid emoji for **${role.name}**: ${emojiResult.error}`,
            });
            return;
          }

          roleOptions.push({
            roleId: role.id,
            roleName: role.name,
            emoji: emojiResult.emoji,
          });
        }
      }

      if (roleOptions.length === 0) {
        await interaction.editReply({
          content: 'You must specify at least one role with an emoji.',
        });
        return;
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x9b59b6) // Purple for roles
        .setTimestamp();

      if (description) {
        embed.setDescription(description);
      } else {
        embed.setDescription('Click a button below to toggle a role on or off.');
      }

      // Add role list to embed
      const roleList = roleOptions.map((r) => `${r.emoji} **${r.roleName}**`).join('\n');
      embed.addFields({ name: 'Available Roles', value: roleList });

      // Build buttons (max 5 per row)
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      let currentRow = new ActionRowBuilder<ButtonBuilder>();

      for (let i = 0; i < roleOptions.length; i++) {
        const role = roleOptions[i];
        const button = new ButtonBuilder()
          .setCustomId(`role_toggle_PENDING_${role.roleId}`)
          .setLabel(role.roleName)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(role.emoji);

        currentRow.addComponents(button);

        // Start new row every 5 buttons
        if ((i + 1) % 5 === 0 || i === roleOptions.length - 1) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder<ButtonBuilder>();
        }
      }

      // Send the panel
      const message = await targetChannel.send({
        embeds: [embed],
        components: rows,
      });

      // Create panel in state
      const panel = createPanel(
        interaction.guild.id,
        targetChannel.id,
        message.id,
        title,
        roleOptions,
        interaction.user.id,
        description
      );

      // Update buttons with actual panel ID
      const updatedRows: ActionRowBuilder<ButtonBuilder>[] = [];
      let updatedCurrentRow = new ActionRowBuilder<ButtonBuilder>();

      for (let i = 0; i < roleOptions.length; i++) {
        const role = roleOptions[i];
        const button = new ButtonBuilder()
          .setCustomId(`role_toggle_${panel.id}_${role.roleId}`)
          .setLabel(role.roleName)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(role.emoji);

        updatedCurrentRow.addComponents(button);

        if ((i + 1) % 5 === 0 || i === roleOptions.length - 1) {
          updatedRows.push(updatedCurrentRow);
          updatedCurrentRow = new ActionRowBuilder<ButtonBuilder>();
        }
      }

      await message.edit({ components: updatedRows });

      await interaction.editReply({
        content: `Role picker panel **${panel.id}** created in ${targetChannel} with ${roleOptions.length} role(s).`,
      });

      console.log(
        `[RolesSetup] Panel ${panel.id} created in #${targetChannel.name} by ${interaction.user.tag}`
      );
    } catch (error) {
      console.error('[RolesSetup] Error creating role panel:', error);

      // Try to give a more helpful error message
      let errorMessage = 'Failed to create role panel.';
      if (error instanceof Error) {
        if (error.message.includes('emoji')) {
          errorMessage = `Invalid emoji format. Use actual emoji characters (Win+. on Windows) or custom emoji format <:name:id>`;
        } else if (error.message.includes('Missing Permissions')) {
          errorMessage = 'Missing permissions. Make sure I can send messages in that channel.';
        } else if (error.message.includes('Missing Access')) {
          errorMessage = "I don't have access to that channel.";
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }

      await interaction.editReply({ content: errorMessage });
    }
  },
};
