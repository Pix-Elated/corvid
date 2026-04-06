/**
 * Submission Logger + Identity Graph (UEBA Phase 1)
 *
 * Records every worldmap identity-log submission with the client fingerprint,
 * then derives cross-reference indexes so an admin can ask "show me every
 * identity that's ever touched this fingerprint / IP / character / Discord".
 *
 * Persistence follows the existing pattern: single JSON file in DATA_PATH
 * with atomic write-and-rename. Submissions are a bounded append-only log
 * (keep the most recent MAX_SUBMISSIONS) to prevent unbounded file growth.
 *
 * This is Phase 1 — passive collection only. No autobans. Admins query the
 * graph manually via /cluster to decide whether to ban.
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_PATH || process.cwd();
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

const MAX_SUBMISSIONS = 10_000;

// =============================================================================
// Types
// =============================================================================

export interface ISubmission {
  ts: string;
  fingerprint: string;
  ip: string;
  ipCountry?: string;
  discordId?: string;
  characterName?: string;
  guildTag?: string;
  ua?: string;
  kind: 'identity_log' | 'marker_submit' | 'ban_check';
  wasBlocked: boolean;
}

interface ISubmissionsState {
  submissions: ISubmission[];
}

export interface IClusterEntry {
  fingerprints: Set<string>;
  ips: Set<string>;
  characters: Set<string>;
  guilds: Set<string>;
  discords: Set<string>;
  firstSeen: string;
  lastSeen: string;
  hits: number;
}

// =============================================================================
// State
// =============================================================================

const defaultState: ISubmissionsState = { submissions: [] };
let currentState: ISubmissionsState = { submissions: [] };

function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    path.dirname(filePath),
    `.submissions-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  );
  try {
    fs.writeFileSync(tempFile, data, 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

function isValidState(data: unknown): data is ISubmissionsState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return Array.isArray(obj.submissions);
}

export function loadSubmissionsState(): void {
  try {
    if (fs.existsSync(SUBMISSIONS_FILE)) {
      const raw = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (isValidState(parsed)) {
        currentState = parsed;
        console.log(
          `[Submissions] Loaded ${currentState.submissions.length} submissions from file`
        );
      } else {
        console.warn('[Submissions] Invalid file format, using default state');
        currentState = { ...defaultState, submissions: [] };
      }
    } else {
      console.log('[Submissions] No state file found, starting fresh');
      currentState = { ...defaultState, submissions: [] };
    }
  } catch (error) {
    console.error('[Submissions] Error loading state:', error);
    currentState = { ...defaultState, submissions: [] };
  }
}

function saveState(): void {
  try {
    atomicWriteSync(SUBMISSIONS_FILE, JSON.stringify(currentState, null, 2));
  } catch (error) {
    console.error('[Submissions] Error saving state:', error);
  }
}

// =============================================================================
// Writer
// =============================================================================

/**
 * Append a submission to the log. Rotates out the oldest entry once we hit
 * MAX_SUBMISSIONS to keep the file bounded.
 */
export function recordSubmission(sub: ISubmission): void {
  currentState.submissions.push(sub);
  if (currentState.submissions.length > MAX_SUBMISSIONS) {
    // Drop oldest 10% at a time to amortize the cost of the slice.
    currentState.submissions.splice(0, Math.floor(MAX_SUBMISSIONS * 0.1));
  }
  saveState();
}

/**
 * Read-only snapshot of all currently-held submissions. Used by the stats
 * aggregator and the realtime alert detectors. Returns a shallow copy so
 * callers can sort/filter without mutating shared state.
 */
export function getAllSubmissions(): ISubmission[] {
  return currentState.submissions.slice();
}

// =============================================================================
// Reader / Query
// =============================================================================

/**
 * Walk the submission log starting from every submission that mentions the
 * seed identifier, then transitively follow shared fingerprints/IPs/identities
 * until the cluster stops growing. Returns the set of identities connected
 * to the seed.
 *
 * Seed can be any: fingerprint, ip, character name (case-insensitive),
 * guild tag (case-insensitive), or discord id.
 */
export function getCluster(seed: string): IClusterEntry | null {
  if (!seed) return null;
  const seedLower = seed.trim().toLowerCase();

  const cluster: IClusterEntry = {
    fingerprints: new Set(),
    ips: new Set(),
    characters: new Set(),
    guilds: new Set(),
    discords: new Set(),
    firstSeen: '',
    lastSeen: '',
    hits: 0,
  };

  // Iteratively grow the cluster. Each pass walks all submissions and adds
  // anything connected to what we've already got. Stops when no new members
  // were added in the previous pass.
  let grew = true;
  const matched = new Set<number>();
  while (grew) {
    grew = false;
    for (let i = 0; i < currentState.submissions.length; i++) {
      if (matched.has(i)) continue;
      const sub = currentState.submissions[i];
      if (matchesCluster(sub, cluster, seedLower)) {
        matched.add(i);
        addToCluster(cluster, sub);
        grew = true;
      }
    }
  }

  if (matched.size === 0) return null;
  cluster.hits = matched.size;
  return cluster;
}

function matchesCluster(sub: ISubmission, cluster: IClusterEntry, seed: string): boolean {
  if (sub.fingerprint && cluster.fingerprints.has(sub.fingerprint)) return true;
  if (cluster.ips.has(sub.ip)) return true;
  if (sub.discordId && cluster.discords.has(sub.discordId)) return true;
  if (sub.characterName && cluster.characters.has(sub.characterName.trim().toLowerCase())) {
    return true;
  }
  if (sub.guildTag && cluster.guilds.has(sub.guildTag.trim().toLowerCase())) {
    return true;
  }

  // First-pass seed match (cluster still empty) — check the seed against every
  // field so admins can paste whichever identifier they have.
  if (cluster.fingerprints.size === 0 && cluster.ips.size === 0) {
    if (sub.fingerprint === seed) return true;
    if (sub.ip === seed) return true;
    if (sub.discordId === seed) return true;
    if (sub.characterName && sub.characterName.trim().toLowerCase() === seed) return true;
    if (sub.guildTag && sub.guildTag.trim().toLowerCase() === seed) return true;
  }
  return false;
}

function addToCluster(cluster: IClusterEntry, sub: ISubmission): void {
  if (sub.fingerprint) cluster.fingerprints.add(sub.fingerprint);
  if (sub.ip) cluster.ips.add(sub.ip);
  if (sub.characterName) cluster.characters.add(sub.characterName.trim().toLowerCase());
  if (sub.guildTag) cluster.guilds.add(sub.guildTag.trim().toLowerCase());
  if (sub.discordId) cluster.discords.add(sub.discordId);

  if (!cluster.firstSeen || sub.ts < cluster.firstSeen) cluster.firstSeen = sub.ts;
  if (!cluster.lastSeen || sub.ts > cluster.lastSeen) cluster.lastSeen = sub.ts;
}
