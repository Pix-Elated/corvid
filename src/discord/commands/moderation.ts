import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  User,
} from 'discord.js';
import { getWarnings, addWarning, clearWarnings } from '../../warnings';

// Helper to format duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

// Helper to create mod log embed
function createModLogEmbed(
  action: string,
  target: User,
  moderator: User,
  reason: string,
  duration?: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${action}`)
    .setColor(action.includes('Ban') ? 0xe74c3c : action.includes('Kick') ? 0xe67e22 : 0xf1c40f)
    .addFields(
      { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
      { name: 'Moderator', value: `${moderator.tag}`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided' }
    )
    .setThumbnail(target.displayAvatarURL())
    .setTimestamp();

  if (duration) {
    embed.addFields({ name: 'Duration', value: formatDuration(duration), inline: true });
  }

  return embed;
}

// BAN COMMAND
export const banCommand = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to ban').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the ban').setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Days of messages to delete (0-7)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    // Check if target is bannable
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (targetMember) {
      if (!targetMember.bannable) {
        await interaction.reply({
          content: 'I cannot ban this user. They may have higher permissions than me.',
          ephemeral: true,
        });
        return;
      }
      if (
        targetMember.roles.highest.position >=
        (interaction.member as GuildMember).roles.highest.position
      ) {
        await interaction.reply({
          content: 'You cannot ban someone with equal or higher role than you.',
          ephemeral: true,
        });
        return;
      }
    }

    try {
      await interaction.guild.members.ban(targetUser.id, {
        reason: `${reason} | Banned by ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      });

      const embed = createModLogEmbed('User Banned', targetUser, interaction.user, reason);
      await interaction.reply({ embeds: [embed] });

      console.log(`[Mod] ${interaction.user.tag} banned ${targetUser.tag}: ${reason}`);
    } catch (error) {
      console.error('[Mod] Ban failed:', error);
      await interaction.reply({ content: 'Failed to ban user.', ephemeral: true });
    }
  },
};

// KICK COMMAND
export const kickCommand = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to kick').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the kick').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ content: 'User not found in this server.', ephemeral: true });
      return;
    }

    if (!targetMember.kickable) {
      await interaction.reply({
        content: 'I cannot kick this user. They may have higher permissions than me.',
        ephemeral: true,
      });
      return;
    }

    if (
      targetMember.roles.highest.position >=
      (interaction.member as GuildMember).roles.highest.position
    ) {
      await interaction.reply({
        content: 'You cannot kick someone with equal or higher role than you.',
        ephemeral: true,
      });
      return;
    }

    try {
      await targetMember.kick(`${reason} | Kicked by ${interaction.user.tag}`);

      const embed = createModLogEmbed('User Kicked', targetUser, interaction.user, reason);
      await interaction.reply({ embeds: [embed] });

      console.log(`[Mod] ${interaction.user.tag} kicked ${targetUser.tag}: ${reason}`);
    } catch (error) {
      console.error('[Mod] Kick failed:', error);
      await interaction.reply({ content: 'Failed to kick user.', ephemeral: true });
    }
  },
};

// MUTE (TIMEOUT) COMMAND
export const muteCommand = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a user (prevents them from chatting)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to mute').setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true)
        .addChoices(
          { name: '5 minutes', value: 5 },
          { name: '10 minutes', value: 10 },
          { name: '30 minutes', value: 30 },
          { name: '1 hour', value: 60 },
          { name: '6 hours', value: 360 },
          { name: '12 hours', value: 720 },
          { name: '1 day', value: 1440 },
          { name: '1 week', value: 10080 }
        )
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the mute').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const duration = interaction.options.getInteger('duration', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ content: 'User not found in this server.', ephemeral: true });
      return;
    }

    if (!targetMember.moderatable) {
      await interaction.reply({
        content: 'I cannot timeout this user. They may have higher permissions than me.',
        ephemeral: true,
      });
      return;
    }

    if (
      targetMember.roles.highest.position >=
      (interaction.member as GuildMember).roles.highest.position
    ) {
      await interaction.reply({
        content: 'You cannot mute someone with equal or higher role than you.',
        ephemeral: true,
      });
      return;
    }

    const durationMs = duration * 60 * 1000;

    try {
      await targetMember.timeout(durationMs, `${reason} | Muted by ${interaction.user.tag}`);

      const embed = createModLogEmbed(
        'User Muted',
        targetUser,
        interaction.user,
        reason,
        durationMs
      );
      await interaction.reply({ embeds: [embed] });

      console.log(
        `[Mod] ${interaction.user.tag} muted ${targetUser.tag} for ${duration} minutes: ${reason}`
      );
    } catch (error) {
      console.error('[Mod] Mute failed:', error);
      await interaction.reply({ content: 'Failed to mute user.', ephemeral: true });
    }
  },
};

// UNMUTE COMMAND
export const unmuteCommand = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove timeout from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to unmute').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for unmuting').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ content: 'User not found in this server.', ephemeral: true });
      return;
    }

    if (!targetMember.isCommunicationDisabled()) {
      await interaction.reply({ content: 'This user is not muted.', ephemeral: true });
      return;
    }

    try {
      await targetMember.timeout(null, `${reason} | Unmuted by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setTitle('User Unmuted')
        .setColor(0x2ecc71)
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      console.log(`[Mod] ${interaction.user.tag} unmuted ${targetUser.tag}: ${reason}`);
    } catch (error) {
      console.error('[Mod] Unmute failed:', error);
      await interaction.reply({ content: 'Failed to unmute user.', ephemeral: true });
    }
  },
};

// WARN COMMAND
export const warnCommand = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to warn').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the warning').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    // Store warning (persisted to file)
    const userWarnings = addWarning(
      interaction.guild.id,
      targetUser.id,
      interaction.user.id,
      reason
    );

    const embed = new EmbedBuilder()
      .setTitle('Warning Issued')
      .setColor(0xf1c40f)
      .addFields(
        { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Total Warnings', value: `${userWarnings.length}`, inline: true }
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Try to DM the user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Warning from ${interaction.guild.name}`)
        .setDescription(`You have been warned by a moderator.`)
        .setColor(0xf1c40f)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Total Warnings', value: `${userWarnings.length}` }
        )
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      // User has DMs disabled, ignore
    }

    console.log(
      `[Mod] ${interaction.user.tag} warned ${targetUser.tag}: ${reason} (total: ${userWarnings.length})`
    );
  },
};

// WARNINGS COMMAND - View warnings for a user
export const warningsCommand = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("View a user's warnings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to check').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const userWarnings = getWarnings(interaction.guild.id, targetUser.id);

    if (userWarnings.length === 0) {
      await interaction.reply({ content: `${targetUser.tag} has no warnings.`, ephemeral: true });
      return;
    }

    const warningList = userWarnings
      .slice(-10) // Show last 10 warnings
      .map(
        (w, i) =>
          `**${i + 1}.** ${w.reason} - <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:R>`
      )
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`Warnings for ${targetUser.tag}`)
      .setColor(0xf1c40f)
      .setDescription(warningList)
      .addFields({ name: 'Total Warnings', value: `${userWarnings.length}`, inline: true })
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// CLEAR WARNINGS COMMAND
export const clearWarningsCommand = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription("Clear a user's warnings")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to clear warnings for').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const previousCount = clearWarnings(interaction.guild.id, targetUser.id);

    await interaction.reply({
      content: `Cleared ${previousCount} warning(s) for ${targetUser.tag}.`,
      ephemeral: true,
    });

    console.log(
      `[Mod] ${interaction.user.tag} cleared ${previousCount} warnings for ${targetUser.tag}`
    );
  },
};
