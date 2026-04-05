/**
 * In-memory cache for the hall-of-shame ban list.
 *
 * Fetches from GitHub raw URL and caches for 5 minutes to avoid
 * hammering GitHub on every identity-log / ip-check request.
 * Invalidated immediately when Corvid commits a new ban entry.
 *
 * Emits 'changed' events on invalidation so SSE consumers can push
 * refreshes to connected clients (worldmap browser, RavenHUD app).
 */

import { EventEmitter } from 'events';

const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/Pix-Elated/ravenhud/master/data/hall-of-shame.json';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 5000;

export interface BanEntry {
  type: 'character' | 'guild' | 'discord' | 'ip';
  name: string;
  reason: string;
  added: string;
}

export interface BanList {
  version: number;
  entries: BanEntry[];
}

let cachedBanList: BanList | null = null;
let cacheTimestamp = 0;

/**
 * Event emitter for ban list changes. SSE route subscribes to 'changed'
 * to push invalidation events to connected clients in real time.
 */
export const banListEvents = new EventEmitter();

/**
 * Get the ban list, using cache if fresh enough.
 * Returns empty entries array on fetch failure (fail-open).
 */
export async function getCachedBanList(): Promise<BanList> {
  if (cachedBanList && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedBanList;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(GITHUB_RAW_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as BanList;
      if (data && Array.isArray(data.entries)) {
        cachedBanList = data;
        cacheTimestamp = Date.now();
        return data;
      }
    }
    console.warn(`[BanListCache] GitHub returned ${res.status}, using stale cache or empty list`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[BanListCache] Fetch failed: ${msg}`);
  }

  // Return stale cache if available, otherwise empty
  return cachedBanList || { version: 2, entries: [] };
}

/**
 * Check if an IP address is banned.
 */
export async function checkIpBan(ip: string): Promise<BanEntry | null> {
  const banList = await getCachedBanList();
  return banList.entries.find((e) => e.type === 'ip' && e.name === ip) || null;
}

/**
 * Invalidate the cache. Called after Corvid commits a new ban entry
 * so the next check picks up the new ban immediately.
 * Emits a 'changed' event so SSE clients can refresh their copies.
 */
export function invalidateBanListCache(): void {
  cachedBanList = null;
  cacheTimestamp = 0;
  banListEvents.emit('changed');
}
