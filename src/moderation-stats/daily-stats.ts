/**
 * Daily Stats Aggregator
 *
 * Computes a 24-hour rollup of worldmap + RavenHUD app activity from the
 * submissions log, to be posted to #moderation-log by the daily scheduler.
 *
 * All data comes from Corvid's existing JSON stores (submissions.json,
 * hall-of-shame.json, ip-identities.json). No new persistence required.
 */

import { getAllSubmissions } from '../submissions';
import { getCachedBanList, type BanEntry } from '../hall-of-shame/ban-list-cache';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IDailyStats {
  windowStart: Date;
  windowEnd: Date;
  // Traffic
  totalSubmissions: number;
  uniqueIps: number;
  uniqueFingerprints: number;
  // New visitors (first-seen-ever in the window)
  newFingerprints: number;
  newCharacters: number;
  newDiscordIds: number;
  // Bans
  currentBanListSize: number;
  bansAddedInWindow: number;
  // Suspicious
  ipsWithMultipleNames: number;
  ipsWith3PlusNames: number;
  fingerprintsFromMultipleIps: number;
  // Top 5s
  topCharacters: Array<{ name: string; count: number }>;
  topFingerprints: Array<{ fp: string; count: number }>;
  topIps: Array<{ ip: string; count: number }>;
}

export function computeDailyStats(now: Date = new Date()): IDailyStats {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - DAY_MS);
  const startMs = windowStart.getTime();

  const allSubs = getAllSubmissions();
  const inWindow = allSubs.filter((s) => new Date(s.ts).getTime() >= startMs);
  const beforeWindow = allSubs.filter((s) => new Date(s.ts).getTime() < startMs);

  // Traffic
  const uniqueIps = new Set<string>();
  const uniqueFingerprints = new Set<string>();
  for (const s of inWindow) {
    if (s.ip) uniqueIps.add(s.ip);
    if (s.fingerprint) uniqueFingerprints.add(s.fingerprint);
  }

  // Pre-window sets so we can detect "first seen in window"
  const priorFingerprints = new Set<string>();
  const priorCharacters = new Set<string>();
  const priorDiscordIds = new Set<string>();
  for (const s of beforeWindow) {
    if (s.fingerprint) priorFingerprints.add(s.fingerprint);
    if (s.characterName) priorCharacters.add(s.characterName.trim().toLowerCase());
    if (s.discordId) priorDiscordIds.add(s.discordId);
  }

  const newFps = new Set<string>();
  const newChars = new Set<string>();
  const newDids = new Set<string>();
  for (const s of inWindow) {
    if (s.fingerprint && !priorFingerprints.has(s.fingerprint)) newFps.add(s.fingerprint);
    if (s.characterName) {
      const n = s.characterName.trim().toLowerCase();
      if (n && !priorCharacters.has(n)) newChars.add(n);
    }
    if (s.discordId && !priorDiscordIds.has(s.discordId)) newDids.add(s.discordId);
  }

  // Suspicious: IP→distinct characters, fingerprint→distinct IPs (in window)
  const ipToChars = new Map<string, Set<string>>();
  const fpToIps = new Map<string, Set<string>>();
  for (const s of inWindow) {
    if (s.ip && s.characterName) {
      const n = s.characterName.trim().toLowerCase();
      if (!n) continue;
      const set = ipToChars.get(s.ip) || new Set<string>();
      set.add(n);
      ipToChars.set(s.ip, set);
    }
    if (s.fingerprint && s.ip) {
      const set = fpToIps.get(s.fingerprint) || new Set<string>();
      set.add(s.ip);
      fpToIps.set(s.fingerprint, set);
    }
  }
  let ipsWithMultipleNames = 0;
  let ipsWith3PlusNames = 0;
  for (const [, chars] of ipToChars) {
    if (chars.size >= 2) ipsWithMultipleNames++;
    if (chars.size >= 3) ipsWith3PlusNames++;
  }
  let fingerprintsFromMultipleIps = 0;
  for (const [, ips] of fpToIps) {
    if (ips.size >= 2) fingerprintsFromMultipleIps++;
  }

  // Top-N helpers
  const countByField = <T>(
    arr: T[],
    getKey: (x: T) => string | undefined | null
  ): Array<{ name: string; count: number }> => {
    const counts = new Map<string, number>();
    for (const x of arr) {
      const k = getKey(x);
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };
  const topChars = countByField(inWindow, (s) =>
    s.characterName ? s.characterName.trim() : null
  ).map((x) => ({ name: x.name, count: x.count }));
  const topFps = countByField(inWindow, (s) => s.fingerprint || null).map((x) => ({
    fp: x.name,
    count: x.count,
  }));
  const topIps = countByField(inWindow, (s) => s.ip).map((x) => ({
    ip: x.name,
    count: x.count,
  }));

  return {
    windowStart,
    windowEnd,
    totalSubmissions: inWindow.length,
    uniqueIps: uniqueIps.size,
    uniqueFingerprints: uniqueFingerprints.size,
    newFingerprints: newFps.size,
    newCharacters: newChars.size,
    newDiscordIds: newDids.size,
    currentBanListSize: 0, // filled below
    bansAddedInWindow: 0, // filled below
    ipsWithMultipleNames,
    ipsWith3PlusNames,
    fingerprintsFromMultipleIps,
    topCharacters: topChars,
    topFingerprints: topFps,
    topIps: topIps,
  };
}

/**
 * Augments stats with ban-list info (async because it reads the cached list).
 */
export async function computeDailyStatsWithBans(now: Date = new Date()): Promise<IDailyStats> {
  const stats = computeDailyStats(now);
  const banList = await getCachedBanList();
  stats.currentBanListSize = banList.entries.length;

  const startIso = stats.windowStart.toISOString().slice(0, 10);
  const endIso = stats.windowEnd.toISOString().slice(0, 10);
  stats.bansAddedInWindow = banList.entries.filter(
    (e: BanEntry) => e.added >= startIso && e.added <= endIso
  ).length;

  return stats;
}
