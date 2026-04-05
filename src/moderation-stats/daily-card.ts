/**
 * Daily Stats Card — posts a 24h digest to #moderation-log.
 *
 * Runs on a setTimeout/setInterval chain aligned to 13:00 UTC (RavenQuest
 * daily server reset). A new card is posted each day; the channel becomes
 * a scrollable history.
 */

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { computeDailyStatsWithBans, type IDailyStats } from './daily-stats';

const MOD_LOG_CHANNEL = 'moderation-log';
const POST_HOUR_UTC = 13;
const DAY_MS = 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let discordClient: Client | null = null;

export function startDailyStatsCard(client: Client): void {
  discordClient = client;
  scheduleNext();
  console.log('[ModerationStats] Daily stats card scheduled for 13:00 UTC');
}

export function stopDailyStatsCard(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext(): void {
  const delay = msUntilNextPost();
  timer = setTimeout(() => {
    void postDailyCard().catch((err) => {
      console.error('[ModerationStats] Failed to post daily card:', err);
    });
    // Chain the next tick — use interval-style recursion so drift self-corrects.
    scheduleNext();
  }, delay);
}

function msUntilNextPost(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(POST_HOUR_UTC, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + DAY_MS);
  }
  return next.getTime() - now.getTime();
}

async function postDailyCard(): Promise<void> {
  if (!discordClient) return;

  const guild = discordClient.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find(
    (ch) => ch.name === MOD_LOG_CHANNEL && ch instanceof TextChannel
  ) as TextChannel | undefined;
  if (!channel) {
    console.warn('[ModerationStats] #moderation-log channel not found');
    return;
  }

  const stats = await computeDailyStatsWithBans();
  const embed = buildEmbed(stats);
  await channel.send({ embeds: [embed] });
  console.log(
    `[ModerationStats] Posted daily card: ${stats.totalSubmissions} submissions, ${stats.newFingerprints} new FPs`
  );
}

function buildEmbed(s: IDailyStats): EmbedBuilder {
  const dateStr = s.windowStart.toISOString().slice(0, 10);

  const topCharsList =
    s.topCharacters.length > 0
      ? s.topCharacters.map((c, i) => `${i + 1}. **${c.name}** — ${c.count}`).join('\n')
      : '_no submissions_';
  const topIpsList =
    s.topIps.length > 0
      ? s.topIps.map((x, i) => `${i + 1}. \`${x.ip}\` — ${x.count}`).join('\n')
      : '_no submissions_';

  return new EmbedBuilder()
    .setTitle('\uD83D\uDCCA Daily Stats Digest')
    .setDescription(
      `24h window ending ${s.windowEnd.toISOString().replace('T', ' ').slice(0, 16)} UTC`
    )
    .setColor(0x5865f2)
    .addFields(
      // Row 1: traffic
      { name: 'Submissions', value: String(s.totalSubmissions), inline: true },
      { name: 'Unique IPs', value: String(s.uniqueIps), inline: true },
      { name: 'Unique Fingerprints', value: String(s.uniqueFingerprints), inline: true },
      // Row 2: new visitors
      { name: 'New Fingerprints', value: String(s.newFingerprints), inline: true },
      { name: 'New Characters', value: String(s.newCharacters), inline: true },
      { name: 'New Discord Users', value: String(s.newDiscordIds), inline: true },
      // Row 3: bans
      { name: 'Ban List Size', value: String(s.currentBanListSize), inline: true },
      { name: 'Bans Added (24h)', value: String(s.bansAddedInWindow), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      // Row 4: suspicious
      { name: 'IPs w/ 2+ Names', value: String(s.ipsWithMultipleNames), inline: true },
      { name: 'IPs w/ 3+ Names', value: String(s.ipsWith3PlusNames), inline: true },
      { name: 'FPs from 2+ IPs', value: String(s.fingerprintsFromMultipleIps), inline: true },
      // Top-N
      { name: 'Top Characters', value: topCharsList, inline: true },
      { name: 'Top IPs', value: topIpsList, inline: true }
    )
    .setFooter({ text: `RavenHUD \u2022 Daily digest \u2022 ${dateStr}` })
    .setTimestamp();
}
