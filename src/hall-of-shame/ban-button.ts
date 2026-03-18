/**
 * Hall of Shame — Discord Ban Buttons + Modals
 *
 * Three buttons on identity log embeds: Ban User, Ban Guild, Ban IP.
 * Each opens a focused modal. On submit: commits new entry to hall-of-shame.json
 * via GitHub API.
 */

import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
} from 'discord.js';
import { invalidateBanListCache } from './ban-list-cache';

const GITHUB_API = 'https://api.github.com';
const REPO = 'Pix-Elated/ravenhud';
const BAN_FILE_PATH = 'data/hall-of-shame.json';

interface BanEntry {
  type: 'character' | 'guild' | 'discord' | 'ip';
  name: string;
  reason: string;
  added: string;
}

interface BanList {
  version: number;
  entries: BanEntry[];
}

// =============================================================================
// Embed field extraction helpers
// =============================================================================

function extractEmbedFields(
  interaction: ButtonInteraction
): { charName: string; guildTag: string; ip: string } | null {
  const embed = interaction.message.embeds[0];
  if (!embed) return null;

  const charField = embed.fields.find((f) => f.name === 'Character');
  const guildField = embed.fields.find((f) => f.name === 'Guild');
  const ipField = embed.fields.find((f) => f.name === 'IP');

  return {
    charName: charField?.value !== 'N/A' ? charField?.value || '' : '',
    guildTag: guildField?.value !== 'none' ? guildField?.value || '' : '',
    ip: ipField?.value?.replace(/`/g, '') || '',
  };
}

// =============================================================================
// Button handlers — show type-specific modals
// =============================================================================

export async function handleBanUserButton(interaction: ButtonInteraction): Promise<void> {
  const fields = extractEmbedFields(interaction);
  if (!fields) {
    await interaction.reply({ content: 'Could not read embed data.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`ban_user_modal_${interaction.message.id}`)
    .setTitle('Ban Character from Worldmap');

  const charInput = new TextInputBuilder()
    .setCustomId('ban_character')
    .setLabel('Character Name')
    .setStyle(TextInputStyle.Short)
    .setValue(fields.charName)
    .setRequired(true)
    .setMaxLength(30);

  const reasonInput = new TextInputBuilder()
    .setCustomId('ban_reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Short)
    .setValue('Community abuse')
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(charInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

export async function handleBanGuildButton(interaction: ButtonInteraction): Promise<void> {
  const fields = extractEmbedFields(interaction);
  if (!fields) {
    await interaction.reply({ content: 'Could not read embed data.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`ban_guild_modal_${interaction.message.id}`)
    .setTitle('Ban Guild from Worldmap');

  const guildInput = new TextInputBuilder()
    .setCustomId('ban_guild')
    .setLabel('Guild Tag')
    .setStyle(TextInputStyle.Short)
    .setValue(fields.guildTag)
    .setRequired(true)
    .setMaxLength(30);

  const reasonInput = new TextInputBuilder()
    .setCustomId('ban_reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Short)
    .setValue('Community abuse')
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(guildInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

export async function handleBanIPButton(interaction: ButtonInteraction): Promise<void> {
  const fields = extractEmbedFields(interaction);
  if (!fields) {
    await interaction.reply({ content: 'Could not read embed data.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`ban_ip_modal_${interaction.message.id}`)
    .setTitle('Ban IP from Worldmap');

  const ipInput = new TextInputBuilder()
    .setCustomId('ban_ip')
    .setLabel('IP Address')
    .setStyle(TextInputStyle.Short)
    .setValue(fields.ip)
    .setRequired(true)
    .setMaxLength(45);

  const reasonInput = new TextInputBuilder()
    .setCustomId('ban_reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Short)
    .setValue('Community abuse')
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(ipInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

// =============================================================================
// Modal handlers — commit ban entry to GitHub
// =============================================================================

export async function handleBanUserModal(interaction: ModalSubmitInteraction): Promise<void> {
  const charName = interaction.fields.getTextInputValue('ban_character').trim();
  const reason = interaction.fields.getTextInputValue('ban_reason').trim();

  if (!charName) {
    await interaction.reply({ content: 'Character name is required.', ephemeral: true });
    return;
  }

  await commitBanEntry({ type: 'character', name: charName, reason }, interaction);
}

export async function handleBanGuildModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guildTag = interaction.fields.getTextInputValue('ban_guild').trim();
  const reason = interaction.fields.getTextInputValue('ban_reason').trim();

  if (!guildTag) {
    await interaction.reply({ content: 'Guild tag is required.', ephemeral: true });
    return;
  }

  await commitBanEntry({ type: 'guild', name: guildTag, reason }, interaction);
}

export async function handleBanIPModal(interaction: ModalSubmitInteraction): Promise<void> {
  const ip = interaction.fields.getTextInputValue('ban_ip').trim();
  const reason = interaction.fields.getTextInputValue('ban_reason').trim();

  if (!ip) {
    await interaction.reply({ content: 'IP address is required.', ephemeral: true });
    return;
  }

  await commitBanEntry({ type: 'ip', name: ip, reason }, interaction);
}

// =============================================================================
// Shared commit logic
// =============================================================================

async function commitBanEntry(
  entry: { type: BanEntry['type']; name: string; reason: string },
  interaction: ModalSubmitInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const githubPat = process.env['github-pat'];
  if (!githubPat) {
    await interaction.editReply('github-pat secret not configured — cannot update ban list.');
    return;
  }

  try {
    // Fetch current ban list from GitHub
    const fileRes = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${BAN_FILE_PATH}`, {
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!fileRes.ok) {
      await interaction.editReply(`Failed to fetch ban list: HTTP ${fileRes.status}`);
      return;
    }

    const fileData = (await fileRes.json()) as { content: string; sha: string };
    const banList: BanList = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));

    // Check for duplicate (case-insensitive for names, exact for IPs)
    const isDuplicate = banList.entries.some((e) => {
      if (e.type !== entry.type) return false;
      if (entry.type === 'ip') return e.name === entry.name;
      return e.name.toLowerCase() === entry.name.toLowerCase();
    });

    if (isDuplicate) {
      await interaction.editReply(`\`${entry.name}\` (${entry.type}) is already banned.`);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newEntry: BanEntry = {
      type: entry.type,
      name: entry.name,
      reason: entry.reason,
      added: today,
    };
    banList.entries.push(newEntry);

    // Commit updated ban list
    const updatedContent = Buffer.from(JSON.stringify(banList, null, 2) + '\n').toString('base64');
    const entryLabel = `${entry.type}:${entry.name}`;

    const commitRes = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${BAN_FILE_PATH}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `ban: add ${entryLabel}`,
        content: updatedContent,
        sha: fileData.sha,
      }),
    });

    if (!commitRes.ok) {
      const err = await commitRes.text();
      await interaction.editReply(`Failed to commit ban: HTTP ${commitRes.status} — ${err}`);
      return;
    }

    // Invalidate cached ban list so IP checks pick up new bans immediately
    invalidateBanListCache();

    // Build confirmation embed
    const typeLabels: Record<BanEntry['type'], string> = {
      character: 'Character',
      guild: 'Guild',
      discord: 'Discord',
      ip: 'IP',
    };

    const confirmEmbed = new EmbedBuilder()
      .setTitle('User Banned from Worldmap')
      .setColor(0x992d22)
      .addFields(
        {
          name: typeLabels[entry.type],
          value: entry.type === 'ip' ? `\`${entry.name}\`` : entry.name,
          inline: true,
        },
        { name: 'Reason', value: entry.reason, inline: true },
        { name: 'Banned by', value: interaction.user.tag, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({
      content: `Banned ${entryLabel}. Committed to hall-of-shame.json.`,
    });

    // Post confirmation to the channel
    const channel = interaction.channel;
    if (channel && 'send' in channel) {
      await channel.send({ embeds: [confirmEmbed] });
    }
  } catch (err) {
    console.error('[HallOfShame] Ban commit failed:', err);
    await interaction.editReply(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
