import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  Guild,
  GuildChannel,
  OverwriteResolvable,
} from 'discord.js';
import {
  getAdoptedChannels,
  getAdoptedChannelById,
  isAdoptedChannel,
  adoptChannel,
  unadoptChannel,
  type AccessFlag,
} from '../../adopted-channels';
import { ACCESS_FLAG_PRESETS, ACCESS_FLAG_LABELS } from '../../adopted-channels/presets';
import { defaultServerStructure } from '../../config/server-structure';
import { permissionsToBits } from '../../bootstrap/categories';

/**
 * Check if a channel name exists in the hardcoded server structure.
 * These channels are already managed by /setup and don't need adoption.
 */
function isHardcodedChannel(channelName: string): boolean {
  const lowerName = channelName.toLowerCase();
  for (const cat of defaultServerStructure.categories) {
    for (const ch of cat.channels) {
      if (ch.name.toLowerCase() === lowerName) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a channel name matches a ticket channel pattern (ticket-XXXX-username)
 */
function isTicketChannel(channelName: string): boolean {
  return /^ticket-\d{4}-/.test(channelName);
}

/**
 * Apply permission overwrites to a channel based on an access flag preset.
 * Resolves role names to guild roles and builds Discord permission overwrites.
 */
async function applyAccessFlag(
  guild: Guild,
  channel: GuildChannel,
  accessFlag: AccessFlag
): Promise<void> {
  const preset = ACCESS_FLAG_PRESETS[accessFlag];
  const overwrites: OverwriteResolvable[] = [];

  for (const overwrite of preset) {
    let targetId: string;

    if (overwrite.role === '@everyone') {
      targetId = guild.id;
    } else {
      const role = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === overwrite.role.toLowerCase()
      );
      if (!role) {
        console.warn(`[Scan] Role "${overwrite.role}" not found in guild, skipping overwrite`);
        continue;
      }
      targetId = role.id;
    }

    overwrites.push({
      id: targetId,
      allow: overwrite.allow ? permissionsToBits(overwrite.allow) : BigInt(0),
      deny: overwrite.deny ? permissionsToBits(overwrite.deny) : BigInt(0),
    });
  }

  // Replace all permission overwrites on the channel
  await channel.permissionOverwrites.set(overwrites, `Adopted with preset: ${accessFlag}`);
}

// SCAN COMMAND - Adopt, unadopt, and list manually-created channels
export const scanCommand = {
  data: new SlashCommandBuilder()
    .setName('scan')
    .setDescription('Manage manually-created channels (adopt, unadopt, list)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('adopt')
        .setDescription('Bring a channel under bot management with a permission preset')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('The channel to adopt')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
        )
        .addStringOption((opt) =>
          opt
            .setName('access')
            .setDescription('Permission preset to apply')
            .setRequired(true)
            .addChoices(
              {
                name: 'community-readonly  (verified sees, staff types)',
                value: 'community-readonly',
              },
              {
                name: 'community-standard  (verified sees and types)',
                value: 'community-standard',
              },
              { name: 'staff-readonly  (staff sees, admin types)', value: 'staff-readonly' },
              { name: 'staff-full  (staff sees and types)', value: 'staff-full' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('unadopt')
        .setDescription('Remove a channel from bot management (does not delete the channel)')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('The channel to unadopt')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List adopted channels and untracked channels')
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'adopt':
        await handleAdopt(interaction);
        break;
      case 'unadopt':
        await handleUnadopt(interaction);
        break;
      case 'list':
        await handleList(interaction);
        break;
    }
  },
};

/**
 * /scan adopt — Adopt a channel with a permission preset
 */
async function handleAdopt(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('This command can only be used in a server.');
    return;
  }

  const channel = interaction.options.getChannel('channel', true);
  const accessFlag = interaction.options.getString('access', true) as AccessFlag;

  // Fetch the full channel object (the option gives us a partial)
  const guildChannel = await guild.channels.fetch(channel.id);
  if (!guildChannel) {
    await interaction.editReply('Channel not found in this server.');
    return;
  }

  // Validate: must be a text or voice channel (not a category or thread)
  if (guildChannel.type !== ChannelType.GuildText && guildChannel.type !== ChannelType.GuildVoice) {
    await interaction.editReply('Only text and voice channels can be adopted.');
    return;
  }

  // Validate: not in the hardcoded structure
  if (isHardcodedChannel(guildChannel.name)) {
    await interaction.editReply(
      `**#${guildChannel.name}** is already managed by the bot's server structure. No need to adopt it.`
    );
    return;
  }

  // Validate: not a ticket channel
  if (isTicketChannel(guildChannel.name)) {
    await interaction.editReply(
      'Ticket channels are managed by the ticket system and cannot be adopted.'
    );
    return;
  }

  // Check if already adopted (we update in-place)
  const existing = getAdoptedChannelById(guildChannel.id);
  const isUpdate = !!existing;

  // Get parent category info
  const categoryId = guildChannel.parentId || null;
  const categoryName = guildChannel.parent?.name || null;

  // Apply permission overwrites
  try {
    await applyAccessFlag(guild, guildChannel, accessFlag);
  } catch (error) {
    console.error(`[Scan] Failed to apply permissions to #${guildChannel.name}:`, error);
    await interaction.editReply(
      `Failed to apply permissions to **#${guildChannel.name}**. Check that the bot has Manage Channels permission and its role is positioned above the target roles.`
    );
    return;
  }

  // Persist to state
  adoptChannel(
    guildChannel.id,
    guildChannel.name,
    categoryId,
    categoryName,
    accessFlag,
    interaction.user.id
  );

  // Build response embed
  const embed = new EmbedBuilder()
    .setTitle(isUpdate ? 'Channel Updated' : 'Channel Adopted')
    .setColor(isUpdate ? 0xf59e0b : 0x10b981) // Warning yellow for update, green for new
    .addFields(
      { name: 'Channel', value: `<#${guildChannel.id}>`, inline: true },
      { name: 'Access', value: ACCESS_FLAG_LABELS[accessFlag], inline: true }
    )
    .setTimestamp();

  if (categoryName) {
    embed.addFields({ name: 'Category', value: categoryName, inline: true });
  }

  if (isUpdate) {
    embed.setDescription(
      `Permission preset updated from **${existing.accessFlag}** to **${accessFlag}**.`
    );
  } else {
    embed.setDescription(
      'This channel is now protected from `/setup` cleanup and has its permissions set.'
    );
  }

  await interaction.editReply({ embeds: [embed] });

  console.log(
    `[Scan] ${interaction.user.tag} ${isUpdate ? 'updated' : 'adopted'} #${guildChannel.name} with ${accessFlag}`
  );
}

/**
 * /scan unadopt — Remove a channel from bot management
 */
async function handleUnadopt(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('This command can only be used in a server.');
    return;
  }

  const channel = interaction.options.getChannel('channel', true);

  // Check if it's actually adopted
  const adopted = getAdoptedChannelById(channel.id);
  if (!adopted) {
    await interaction.editReply(
      `**<#${channel.id}>** is not an adopted channel. Use \`/scan list\` to see adopted channels.`
    );
    return;
  }

  // Remove from state (does NOT delete the channel or reset permissions)
  unadoptChannel(channel.id);

  const embed = new EmbedBuilder()
    .setTitle('Channel Unadopted')
    .setColor(0xef4444) // Red
    .addFields(
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Previous Access', value: ACCESS_FLAG_LABELS[adopted.accessFlag], inline: true }
    )
    .setDescription(
      'This channel is no longer protected by the bot. Its permissions have been left as-is.\n\n' +
        '**Warning:** This channel may be deleted on the next `/setup` run since it is no longer in the managed structure.'
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  console.log(`[Scan] ${interaction.user.tag} unadopted #${adopted.channelName}`);
}

/**
 * /scan list — Show adopted channels and untracked channels
 */
async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('This command can only be used in a server.');
    return;
  }

  // Refresh channel cache
  await guild.channels.fetch();

  const adoptedChannels = getAdoptedChannels();

  // Find untracked channels (not hardcoded, not adopted, not tickets, not categories)
  const untrackedChannels: { id: string; name: string; categoryName: string | null }[] = [];
  for (const [, ch] of guild.channels.cache) {
    // Skip categories
    if (ch.type === ChannelType.GuildCategory) continue;
    // Skip ticket channels
    if (isTicketChannel(ch.name)) continue;
    // Skip hardcoded channels
    if (isHardcodedChannel(ch.name)) continue;
    // Skip already adopted
    if (isAdoptedChannel(ch.id)) continue;

    untrackedChannels.push({
      id: ch.id,
      name: ch.name,
      categoryName: ch.parent?.name || null,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Channel Scan Results')
    .setColor(0x6b46c1) // Purple to match the server theme
    .setTimestamp();

  // Section 1: Adopted channels
  if (adoptedChannels.length > 0) {
    const adoptedLines = adoptedChannels.map((ch) => {
      // Check if the channel still exists in Discord
      const exists = guild.channels.cache.has(ch.channelId);
      const channelRef = exists ? `<#${ch.channelId}>` : `~~${ch.channelName}~~ (deleted)`;
      return `${channelRef} — \`${ch.accessFlag}\``;
    });
    embed.addFields({
      name: `Adopted Channels (${adoptedChannels.length})`,
      value: adoptedLines.join('\n') || 'None',
    });
  } else {
    embed.addFields({
      name: 'Adopted Channels',
      value: 'No channels have been adopted yet.',
    });
  }

  // Section 2: Untracked channels
  if (untrackedChannels.length > 0) {
    // Limit to 15 to stay within embed field limits
    const displayChannels = untrackedChannels.slice(0, 15);
    const untrackedLines = displayChannels.map((ch) => {
      const catLabel = ch.categoryName ? ` (${ch.categoryName})` : ' (no category)';
      return `<#${ch.id}>${catLabel}`;
    });
    if (untrackedChannels.length > 15) {
      untrackedLines.push(`...and ${untrackedChannels.length - 15} more`);
    }
    embed.addFields({
      name: `Untracked Channels (${untrackedChannels.length})`,
      value: untrackedLines.join('\n'),
    });
    embed.setFooter({
      text: 'Use /scan adopt to bring untracked channels under management',
    });
  } else {
    embed.addFields({
      name: 'Untracked Channels',
      value: 'All channels are accounted for.',
    });
  }

  await interaction.editReply({ embeds: [embed] });

  console.log(
    `[Scan] ${interaction.user.tag} listed channels: ${adoptedChannels.length} adopted, ${untrackedChannels.length} untracked`
  );
}
