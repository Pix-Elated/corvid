/**
 * Realtime Suspicious-Activity Alerts.
 *
 * Evaluates incoming submissions against pattern detectors and posts to
 * #moderation-log when a threshold is crossed. Each detector has its own
 * debounce window to prevent alert spam.
 *
 * Detectors:
 *  - VPN cycling:        fingerprint seen from 3+ distinct IPs in 1h
 *  - IP spam:            IP with 5+ distinct character names in 24h
 *  - Visitor burst:      20+ new fingerprints (first-seen-ever) in 1h
 *  - Guild evasion:      banned guild tag appearing under a not-yet-banned character
 */

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { getAllSubmissions, type ISubmission } from '../submissions';
import { getCachedBanList } from '../hall-of-shame/ban-list-cache';

const MOD_LOG_CHANNEL = 'moderation-log';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Thresholds
const VPN_CYCLE_IP_THRESHOLD = 3;
const IP_SPAM_NAME_THRESHOLD = 5;
const VISITOR_BURST_THRESHOLD = 20;

// Debounce: don't re-alert for the same key within this window
const ALERT_DEBOUNCE_MS = 30 * 60 * 1000; // 30 min
const lastAlertByKey = new Map<string, number>();

// Visitor-burst fires once per window, not per-new-FP
let lastBurstAlertTs = 0;

let discordClient: Client | null = null;

export function setAlertClient(client: Client): void {
  discordClient = client;
}

/**
 * Called after every submission is recorded. Fans out to all detectors.
 */
export async function evaluateAlerts(latest: ISubmission): Promise<void> {
  try {
    const allSubs = getAllSubmissions();
    await Promise.all([
      detectVpnCycling(latest, allSubs),
      detectIpSpam(latest, allSubs),
      detectVisitorBurst(allSubs),
      detectGuildEvasion(latest),
    ]);
  } catch (err) {
    console.error('[Alerts] evaluateAlerts failed:', err);
  }
}

// -----------------------------------------------------------------------------
// Detectors
// -----------------------------------------------------------------------------

async function detectVpnCycling(latest: ISubmission, all: ISubmission[]): Promise<void> {
  if (!latest.fingerprint) return;

  const windowStart = Date.now() - HOUR_MS;
  const ips = new Set<string>();
  for (const s of all) {
    if (s.fingerprint !== latest.fingerprint) continue;
    if (new Date(s.ts).getTime() < windowStart) continue;
    if (s.ip) ips.add(s.ip);
  }

  if (ips.size >= VPN_CYCLE_IP_THRESHOLD) {
    const key = `vpn:${latest.fingerprint}`;
    if (isDebounced(key)) return;
    markAlerted(key);
    await postAlert({
      title: '\uD83D\uDD04 VPN/Proxy Cycling Detected',
      color: 0xf59e0b,
      fields: [
        { name: 'Fingerprint', value: `\`${latest.fingerprint.slice(0, 32)}...\``, inline: false },
        { name: 'Distinct IPs (1h)', value: String(ips.size), inline: true },
        { name: 'Latest IP', value: `\`${latest.ip}\``, inline: true },
        {
          name: 'Recent IPs',
          value: Array.from(ips)
            .slice(0, 5)
            .map((ip) => `\u2022 \`${ip}\``)
            .join('\n'),
          inline: false,
        },
      ],
      footer: `Review with /cluster seed:${latest.fingerprint.slice(0, 24)}...`,
    });
  }
}

async function detectIpSpam(latest: ISubmission, all: ISubmission[]): Promise<void> {
  if (!latest.ip) return;

  const windowStart = Date.now() - DAY_MS;
  const names = new Set<string>();
  for (const s of all) {
    if (s.ip !== latest.ip) continue;
    if (new Date(s.ts).getTime() < windowStart) continue;
    if (s.characterName) names.add(s.characterName.trim().toLowerCase());
  }

  if (names.size >= IP_SPAM_NAME_THRESHOLD) {
    const key = `ipspam:${latest.ip}`;
    if (isDebounced(key)) return;
    markAlerted(key);
    await postAlert({
      title: '\uD83D\uDCE3 IP Spam Attack',
      color: 0xef4444,
      fields: [
        { name: 'IP', value: `\`${latest.ip}\``, inline: true },
        { name: 'Distinct Names (24h)', value: String(names.size), inline: true },
        {
          name: 'Names',
          value: Array.from(names)
            .slice(0, 8)
            .map((n) => `\u2022 ${n}`)
            .join('\n'),
          inline: false,
        },
      ],
      footer: `Review with /cluster seed:${latest.ip}`,
    });
  }
}

async function detectVisitorBurst(all: ISubmission[]): Promise<void> {
  const windowStart = Date.now() - HOUR_MS;

  // First-seen-ever means NOT in any submission before windowStart.
  const seenBefore = new Set<string>();
  const seenInWindow = new Set<string>();
  for (const s of all) {
    if (!s.fingerprint) continue;
    const ts = new Date(s.ts).getTime();
    if (ts < windowStart) {
      seenBefore.add(s.fingerprint);
    } else {
      seenInWindow.add(s.fingerprint);
    }
  }
  let newInWindow = 0;
  for (const fp of seenInWindow) {
    if (!seenBefore.has(fp)) newInWindow++;
  }

  if (newInWindow >= VISITOR_BURST_THRESHOLD) {
    // One burst alert per hour max
    if (Date.now() - lastBurstAlertTs < HOUR_MS) return;
    lastBurstAlertTs = Date.now();
    await postAlert({
      title: '\uD83D\uDCC8 New Visitor Burst',
      color: 0x3b82f6,
      fields: [
        { name: 'New Fingerprints (1h)', value: String(newInWindow), inline: true },
        { name: 'Threshold', value: String(VISITOR_BURST_THRESHOLD), inline: true },
      ],
      footer: 'Could indicate brigading, viral traffic, or a bot campaign',
    });
  }
}

async function detectGuildEvasion(latest: ISubmission): Promise<void> {
  if (!latest.guildTag || !latest.characterName) return;
  const guildLower = latest.guildTag.trim().toLowerCase();
  if (!guildLower) return;

  const banList = await getCachedBanList();
  const guildIsBanned = banList.entries.some(
    (e) => e.type === 'guild' && e.name.trim().toLowerCase() === guildLower
  );
  if (!guildIsBanned) return;

  // Don't alert if the character itself is already banned (it'll get auto-kicked)
  const charLower = latest.characterName.trim().toLowerCase();
  const charBanned = banList.entries.some(
    (e) => e.type === 'character' && e.name.trim().toLowerCase() === charLower
  );
  if (charBanned) return;

  const key = `guildevade:${charLower}`;
  if (isDebounced(key)) return;
  markAlerted(key);

  await postAlert({
    title: '\uD83C\uDFF0 Guild Ban Evasion Attempt',
    color: 0x991b1b,
    fields: [
      { name: 'Character', value: `**${latest.characterName}**`, inline: true },
      { name: 'Guild Tag (BANNED)', value: `\`${latest.guildTag}\``, inline: true },
      { name: 'IP', value: `\`${latest.ip}\``, inline: true },
    ],
    footer: `User from banned guild submitted new character name \u2014 /worldmap-ban add character ${latest.characterName}`,
  });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function isDebounced(key: string): boolean {
  const last = lastAlertByKey.get(key);
  return last ? Date.now() - last < ALERT_DEBOUNCE_MS : false;
}

function markAlerted(key: string): void {
  lastAlertByKey.set(key, Date.now());
  // Opportunistically GC keys older than the debounce window
  if (lastAlertByKey.size > 1000) {
    const cutoff = Date.now() - ALERT_DEBOUNCE_MS;
    for (const [k, ts] of lastAlertByKey) {
      if (ts < cutoff) lastAlertByKey.delete(k);
    }
  }
}

interface IAlertPayload {
  title: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  footer: string;
}

async function postAlert(payload: IAlertPayload): Promise<void> {
  if (!discordClient) return;
  const guild = discordClient.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find(
    (ch) => ch.name === MOD_LOG_CHANNEL && ch instanceof TextChannel
  ) as TextChannel | undefined;
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(payload.title)
    .setColor(payload.color)
    .addFields(payload.fields)
    .setFooter({ text: payload.footer })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}
