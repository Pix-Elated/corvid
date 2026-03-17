/**
 * Hall of Shame — Discord Ban Button + Modal
 *
 * Adds a "Ban" button to identity log embeds in #ravenhud-logs.
 * Clicking shows a modal to choose: ban character, guild, or both + reason.
 * On submit: commits new entries to hall-of-shame.json via GitHub API.
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

const GITHUB_API = 'https://api.github.com';
const REPO = 'Pix-Elated/ravenhud';
const BAN_FILE_PATH = 'data/hall-of-shame.json';

interface BanEntry {
  type: 'character' | 'guild' | 'discord';
  name: string;
  reason: string;
  added: string;
}

interface BanList {
  version: number;
  entries: BanEntry[];
}

/**
 * Handle the "Ban" button click on an identity log embed.
 * Shows a modal asking for ban type selection and reason.
 */
export async function handleBanButton(interaction: ButtonInteraction): Promise<void> {
  // Extract character name, guild tag, and IP from the embed
  const embed = interaction.message.embeds[0];
  if (!embed) {
    await interaction.reply({ content: 'Could not read embed data.', ephemeral: true });
    return;
  }

  const charField = embed.fields.find((f) => f.name === 'Character');
  const guildField = embed.fields.find((f) => f.name === 'Guild');
  const ipField = embed.fields.find((f) => f.name === 'IP');

  const charName = charField?.value || '';
  const guildTag = guildField?.value || '';

  // Build modal
  const modal = new ModalBuilder()
    .setCustomId(`ban_modal_${interaction.message.id}`)
    .setTitle('Ban User from Worldmap');

  const charInput = new TextInputBuilder()
    .setCustomId('ban_character')
    .setLabel('Character Name (leave blank to skip)')
    .setStyle(TextInputStyle.Short)
    .setValue(charName !== 'N/A' ? charName : '')
    .setRequired(false)
    .setMaxLength(30);

  const guildInput = new TextInputBuilder()
    .setCustomId('ban_guild')
    .setLabel('Guild Tag (leave blank to skip)')
    .setStyle(TextInputStyle.Short)
    .setValue(guildTag !== 'none' ? guildTag : '')
    .setRequired(false)
    .setMaxLength(30);

  const reasonInput = new TextInputBuilder()
    .setCustomId('ban_reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Short)
    .setValue('Community abuse')
    .setRequired(true)
    .setMaxLength(100);

  const ipInput = new TextInputBuilder()
    .setCustomId('ban_ip')
    .setLabel('IP (auto-filled, for reference)')
    .setStyle(TextInputStyle.Short)
    .setValue(ipField?.value?.replace(/`/g, '') || '')
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(charInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(guildInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(ipInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handle the ban modal submission. Commits new entries to hall-of-shame.json.
 */
export async function handleBanModal(interaction: ModalSubmitInteraction): Promise<void> {
  const charName = interaction.fields.getTextInputValue('ban_character').trim();
  const guildTag = interaction.fields.getTextInputValue('ban_guild').trim();
  const reason = interaction.fields.getTextInputValue('ban_reason').trim();
  const ip = interaction.fields.getTextInputValue('ban_ip').trim();

  if (!charName && !guildTag) {
    await interaction.reply({
      content: 'You must provide at least a character name or guild tag to ban.',
      ephemeral: true,
    });
    return;
  }

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

    const today = new Date().toISOString().split('T')[0];
    const newEntries: BanEntry[] = [];

    if (charName) {
      // Check for duplicate
      const exists = banList.entries.some(
        (e) => e.type === 'character' && e.name.toLowerCase() === charName.toLowerCase()
      );
      if (!exists) {
        newEntries.push({ type: 'character', name: charName, reason, added: today });
      }
    }

    if (guildTag) {
      const exists = banList.entries.some(
        (e) => e.type === 'guild' && e.name.toLowerCase() === guildTag.toLowerCase()
      );
      if (!exists) {
        newEntries.push({ type: 'guild', name: guildTag, reason, added: today });
      }
    }

    if (newEntries.length === 0) {
      await interaction.editReply('All specified names/guilds are already banned.');
      return;
    }

    banList.entries.push(...newEntries);

    // Commit updated ban list
    const updatedContent = Buffer.from(JSON.stringify(banList, null, 2) + '\n').toString('base64');

    const entryNames = newEntries.map((e) => `${e.type}:${e.name}`).join(', ');

    const commitRes = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${BAN_FILE_PATH}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `ban: add ${entryNames}`,
        content: updatedContent,
        sha: fileData.sha,
      }),
    });

    if (!commitRes.ok) {
      const err = await commitRes.text();
      await interaction.editReply(`Failed to commit ban: HTTP ${commitRes.status} — ${err}`);
      return;
    }

    // Success — update the original embed to show it's been actioned
    const confirmEmbed = new EmbedBuilder()
      .setTitle('User Banned from Worldmap')
      .setColor(0x992d22)
      .addFields(
        ...newEntries.map((e) => ({
          name: e.type === 'character' ? 'Character' : 'Guild',
          value: e.name,
          inline: true,
        })),
        { name: 'Reason', value: reason, inline: true },
        { name: 'Banned by', value: interaction.user.tag, inline: true }
      )
      .setTimestamp();

    if (ip) {
      confirmEmbed.addFields({ name: 'IP', value: `\`${ip}\``, inline: true });
    }

    await interaction.editReply({
      content: `Banned ${entryNames}. Committed to hall-of-shame.json.`,
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
