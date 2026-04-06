/**
 * /worldmap-ban — Manage the hall-of-shame ban list from Discord.
 *
 * Subcommands:
 *   list   [type] — View current bans (optionally filtered by type)
 *   add    <type> <name> <reason> — Add a ban entry
 *   remove <name> — Remove all entries matching a name
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { getCachedBanList } from '../../hall-of-shame/ban-list-cache';
import { BanEntry, fetchBanListFromGitHub, commitBanList } from '../../hall-of-shame/github';

const BAN_TYPES = ['character', 'guild', 'discord', 'ip'] as const;

const TYPE_LABELS: Record<BanEntry['type'], string> = {
  character: 'Character',
  guild: 'Guild',
  discord: 'Discord',
  ip: 'IP',
};

export const worldmapBanCommand = {
  data: new SlashCommandBuilder()
    .setName('worldmap-ban')
    .setDescription('Manage worldmap bans (hall of shame)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View current worldmap bans')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Filter by ban type')
            .setRequired(false)
            .addChoices(
              { name: 'Character', value: 'character' },
              { name: 'Guild', value: 'guild' },
              { name: 'Discord', value: 'discord' },
              { name: 'IP', value: 'ip' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a worldmap ban')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Ban type')
            .setRequired(true)
            .addChoices(
              { name: 'Character', value: 'character' },
              { name: 'Guild', value: 'guild' },
              { name: 'Discord', value: 'discord' },
              { name: 'IP', value: 'ip' }
            )
        )
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Name / ID / IP to ban').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('reason').setDescription('Reason for the ban').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a worldmap ban (all entries matching the name)')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Name / ID / IP to unban (case-insensitive)')
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'list':
        await handleList(interaction);
        break;
      case 'add':
        await handleAdd(interaction);
        break;
      case 'remove':
        await handleRemove(interaction);
        break;
    }
  },
};

// =============================================================================
// list
// =============================================================================

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const banList = await getCachedBanList();
    const filterType = interaction.options.getString('type') as BanEntry['type'] | null;

    const entries = filterType
      ? banList.entries.filter((e) => e.type === filterType)
      : banList.entries;

    if (entries.length === 0) {
      const suffix = filterType ? ` of type \`${filterType}\`` : '';
      await interaction.editReply(`No bans found${suffix}.`);
      return;
    }

    // Group by type for readability
    const grouped = new Map<string, BanEntry[]>();
    for (const e of entries) {
      const group = grouped.get(e.type) ?? [];
      group.push(e);
      grouped.set(e.type, group);
    }

    let description = '';
    for (const type of BAN_TYPES) {
      const group = grouped.get(type);
      if (!group) continue;

      description += `### ${TYPE_LABELS[type]} (${group.length})\n`;
      for (const e of group) {
        const name = e.type === 'ip' ? `\`${e.name}\`` : `**${e.name}**`;
        description += `${name} — ${e.reason} *(${e.added})*\n`;
      }
      description += '\n';
    }

    // Truncate if needed (Discord embed limit is 4096)
    if (description.length > 4000) {
      description = description.slice(0, 3950) + '\n\n*...truncated*';
    }

    const embed = new EmbedBuilder()
      .setTitle('Worldmap Ban List')
      .setColor(0xef4444)
      .setDescription(description)
      .setFooter({ text: `${entries.length} entries` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[WorldmapBan] List failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// =============================================================================
// add
// =============================================================================

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const type = interaction.options.getString('type', true) as BanEntry['type'];
  const name = interaction.options.getString('name', true).trim();
  const reason = interaction.options.getString('reason', true).trim();

  try {
    const { banList, sha } = await fetchBanListFromGitHub();

    // Duplicate check
    const isDuplicate = banList.entries.some((e) => {
      if (e.type !== type) return false;
      if (type === 'ip') return e.name === name;
      return e.name.toLowerCase() === name.toLowerCase();
    });

    if (isDuplicate) {
      await interaction.editReply(`\`${name}\` (${type}) is already banned.`);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    banList.entries.push({ type, name, reason, added: today });

    await commitBanList(banList, sha, `ban: add ${type}:${name}`);

    const embed = new EmbedBuilder()
      .setTitle('Worldmap Ban Added')
      .setColor(0x992d22)
      .addFields(
        { name: TYPE_LABELS[type], value: type === 'ip' ? `\`${name}\`` : name, inline: true },
        { name: 'Reason', value: reason, inline: true },
        { name: 'Added by', value: interaction.user.tag, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`[WorldmapBan] ${interaction.user.tag} added ban: ${type}:${name}`);
  } catch (err) {
    console.error('[WorldmapBan] Add failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// =============================================================================
// remove
// =============================================================================

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString('name', true).trim();

  try {
    const { banList, sha } = await fetchBanListFromGitHub();
    const nameLower = name.toLowerCase();

    const removed = banList.entries.filter(
      (e) => e.name.toLowerCase() === nameLower || (e.type === 'ip' && e.name === name)
    );

    if (removed.length === 0) {
      await interaction.editReply(`No ban entries found matching \`${name}\`.`);
      return;
    }

    banList.entries = banList.entries.filter(
      (e) => e.name.toLowerCase() !== nameLower && !(e.type === 'ip' && e.name === name)
    );

    await commitBanList(banList, sha, `unban: remove ${name}`);

    const removedList = removed.map((e) => `${TYPE_LABELS[e.type]}: **${e.name}**`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('Worldmap Ban Removed')
      .setColor(0x2ecc71)
      .setDescription(removedList)
      .addFields({ name: 'Removed by', value: interaction.user.tag, inline: true })
      .setFooter({ text: `${removed.length} entry/entries removed` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(
      `[WorldmapBan] ${interaction.user.tag} removed ${removed.length} ban(s) matching: ${name}`
    );
  } catch (err) {
    console.error('[WorldmapBan] Remove failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
