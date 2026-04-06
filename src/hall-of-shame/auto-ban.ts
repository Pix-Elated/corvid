/**
 * Auto-Ban: Evasion Detection
 *
 * When a new identity submission arrives, walks the identity graph from its
 * fingerprint (primary, ~30-40 bits entropy) or IP (fallback) and checks
 * whether the cluster already contains another character name. If yes, the
 * NEW character name gets auto-banned as a ban-evasion attempt — the SSE
 * stream then kicks the user within ~2 seconds.
 *
 * Safeguards:
 * - Grace period (2 min): don't ban if the cluster is brand new (typo window)
 * - Min name length (2 chars): skip empty / single-char submissions
 * - Skip if IP already has any ban: no stacking
 * - Skip if name already banned: no duplicates
 * - Per-seed cooldown (15 min): prevent commit spam from a flailing attacker
 */

import { getCluster, type ISubmission } from '../submissions';
import { getCachedBanList, invalidateBanListCache } from './ban-list-cache';
import { fetchBanListFromGitHub, commitBanList } from './github';

const GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes
const MIN_NAME_LENGTH = 2;
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between autobans per seed

// In-flight locks to prevent duplicate commits when submissions arrive near-simultaneously.
const processingLocks = new Set<string>();
// Per-seed cooldown so one attacker can't trigger multiple GitHub commits per minute.
const seedCooldowns = new Map<string, number>();

export interface IAutoBanResult {
  banned: boolean;
  name?: string;
  previousNames?: string[];
  seed?: string;
  reason?: string;
}

/**
 * Check a submission for ban-evasion and auto-ban if evasion is detected.
 * Returns the result so callers can log it; does NOT throw on failure.
 */
export async function checkAndAutoBan(submission: ISubmission): Promise<IAutoBanResult> {
  const name = (submission.characterName || '').trim();
  if (name.length < MIN_NAME_LENGTH) return { banned: false };

  // Prefer fingerprint (stronger signal, survives VPN/proxy), fall back to IP.
  const seed = submission.fingerprint || submission.ip;
  if (!seed) return { banned: false };

  // Cooldown check — avoid commit spam
  const lastBanTime = seedCooldowns.get(seed);
  if (lastBanTime && Date.now() - lastBanTime < COOLDOWN_MS) {
    return { banned: false };
  }

  // Lock check — another handler is already processing this seed
  if (processingLocks.has(seed)) return { banned: false };
  processingLocks.add(seed);

  try {
    const cluster = getCluster(seed);
    if (!cluster) return { banned: false };

    // Find other names in the cluster (excluding the one we just submitted)
    const thisNameLower = name.toLowerCase();
    const otherNames = Array.from(cluster.characters).filter((n) => n !== thisNameLower);
    if (otherNames.length === 0) return { banned: false };

    // Grace period: if the cluster is brand new, don't ban (typo correction)
    if (cluster.firstSeen) {
      const firstSeenMs = new Date(cluster.firstSeen).getTime();
      if (Date.now() - firstSeenMs < GRACE_PERIOD_MS) {
        return { banned: false };
      }
    }

    // Check existing bans — skip if already banned (by name OR by any linked IP)
    const existingBans = await getCachedBanList();
    const alreadyNameBanned = existingBans.entries.some(
      (e) => e.type === 'character' && e.name.trim().toLowerCase() === thisNameLower
    );
    if (alreadyNameBanned) return { banned: false };

    const anyLinkedIpBanned = existingBans.entries.some(
      (e) => e.type === 'ip' && cluster.ips.has(e.name)
    );
    if (anyLinkedIpBanned) return { banned: false };

    // Commit the auto-ban
    const previousList = otherNames.slice(0, 3).join(', ');
    const reason = `Auto-ban: ban evasion. Previously used: ${previousList}`;
    const today = new Date().toISOString().split('T')[0];

    const { banList, sha } = await fetchBanListFromGitHub();
    // Race check: re-verify not already banned after fresh fetch
    const stillNotBanned = !banList.entries.some(
      (e) => e.type === 'character' && e.name.trim().toLowerCase() === thisNameLower
    );
    if (!stillNotBanned) return { banned: false };

    banList.entries.push({ type: 'character', name, reason, added: today });
    await commitBanList(banList, sha, `auto-ban: ${name} (evasion)`);

    // commitBanList invalidates the cache which fires the SSE event,
    // but call it again explicitly for safety in case of race.
    invalidateBanListCache();

    seedCooldowns.set(seed, Date.now());
    console.log(
      `[AutoBan] Banned "${name}" — evasion on seed ${seed.slice(0, 24)}... (previous: ${previousList})`
    );
    return { banned: true, name, previousNames: otherNames, seed, reason };
  } catch (err) {
    console.error('[AutoBan] Failed to process:', err);
    return { banned: false };
  } finally {
    processingLocks.delete(seed);
  }
}
