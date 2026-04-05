/**
 * /cluster — Query the UEBA identity graph.
 *
 * Given any identifier (fingerprint, IP, character name, guild tag, or
 * Discord ID), walks the submission log and returns every other identity
 * that's been seen sharing the same fingerprint / IP / etc.
 *
 * Phase 1 (passive): admins use this to investigate before banning.
 * Phase 3 will add automated rules that run the same graph walk server-side.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { getCluster } from '../../submissions';

const MAX_LIST_ITEMS = 15;

export const clusterCommand = {
  data: new SlashCommandBuilder()
    .setName('cluster')
    .setDescription(
      'Show all identities linked to a fingerprint / IP / character / guild / discord id'
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('seed')
        .setDescription('Any identifier: fingerprint, IP, character name, guild tag, or Discord ID')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const seed = interaction.options.getString('seed', true).trim();

    try {
      const cluster = getCluster(seed);
      if (!cluster) {
        await interaction.editReply(`No submissions found for \`${seed}\`.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Identity Cluster: ${seed}`)
        .setColor(0x3498db)
        .addFields(
          { name: 'Submissions', value: String(cluster.hits), inline: true },
          { name: 'First seen', value: cluster.firstSeen || 'n/a', inline: true },
          { name: 'Last seen', value: cluster.lastSeen || 'n/a', inline: true },
          {
            name: `Fingerprints (${cluster.fingerprints.size})`,
            value: formatSet(cluster.fingerprints),
            inline: false,
          },
          {
            name: `IPs (${cluster.ips.size})`,
            value: formatSet(cluster.ips, (v) => `\`${v}\``),
            inline: false,
          },
          {
            name: `Characters (${cluster.characters.size})`,
            value: formatSet(cluster.characters),
            inline: false,
          },
          {
            name: `Guilds (${cluster.guilds.size})`,
            value: formatSet(cluster.guilds),
            inline: false,
          },
          {
            name: `Discord IDs (${cluster.discords.size})`,
            value: formatSet(cluster.discords, (v) => `<@${v}>`),
            inline: false,
          }
        )
        .setFooter({ text: 'Use /worldmap-ban to take action' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[Cluster] Query failed:', err);
      await interaction.editReply(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

function formatSet(set: Set<string>, transform: (v: string) => string = (v) => v): string {
  if (set.size === 0) return '_none_';
  const arr = Array.from(set).slice(0, MAX_LIST_ITEMS).map(transform);
  const suffix = set.size > MAX_LIST_ITEMS ? `\n_...and ${set.size - MAX_LIST_ITEMS} more_` : '';
  return arr.join(', ') + suffix;
}
