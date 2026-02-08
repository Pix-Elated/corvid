import fs from 'fs';
import path from 'path';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const ADOPTED_FILE = path.join(DATA_DIR, 'adopted-channels.json');

// The access flag determines which permission preset is applied to the channel
export type AccessFlag =
  | 'community-readonly'
  | 'community-standard'
  | 'staff-readonly'
  | 'staff-full';

export interface AdoptedChannel {
  channelId: string; // Discord snowflake (primary key)
  channelName: string; // For display (may go stale if renamed in Discord)
  categoryId: string | null; // Parent category ID at adoption time
  categoryName: string | null; // Parent category name for display
  accessFlag: AccessFlag;
  adoptedBy: string; // Admin user ID who adopted it
  adoptedAt: string; // ISO timestamp
}

interface AdoptedChannelsState {
  channels: AdoptedChannel[];
}

const defaultState: AdoptedChannelsState = {
  channels: [],
};

let currentState: AdoptedChannelsState = { ...defaultState };

/**
 * Atomically write data to a file (write to temp, then rename)
 */
function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    // Same dir as target to avoid EXDEV on mounted volumes
    path.dirname(filePath),
    `.adopted-channels-${Date.now()}-${Math.random().toString(36)}.tmp`
  );
  try {
    fs.writeFileSync(tempFile, data, 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    // Clean up temp file if rename failed
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Validate that loaded data matches expected schema
 */
function isValidState(data: unknown): data is AdoptedChannelsState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.channels)) return false;
  // Validate each channel entry has required fields
  for (const ch of obj.channels) {
    if (typeof ch !== 'object' || ch === null) return false;
    const entry = ch as Record<string, unknown>;
    if (typeof entry.channelId !== 'string') return false;
    if (typeof entry.channelName !== 'string') return false;
    if (typeof entry.accessFlag !== 'string') return false;
  }
  return true;
}

/**
 * Save current state to file (atomic write)
 */
function saveState(): void {
  try {
    atomicWriteSync(ADOPTED_FILE, JSON.stringify(currentState, null, 2));
  } catch (error) {
    console.error('[AdoptedChannels] Error saving state file:', error);
  }
}

/**
 * Load adopted channels state from file
 */
export function loadAdoptedChannelsState(): AdoptedChannelsState {
  try {
    if (fs.existsSync(ADOPTED_FILE)) {
      const data = fs.readFileSync(ADOPTED_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (isValidState(parsed)) {
        currentState = parsed;
        console.log(`[AdoptedChannels] Loaded ${currentState.channels.length} adopted channels`);
      } else {
        console.warn('[AdoptedChannels] Invalid state file format, using default state');
        currentState = { ...defaultState };
      }
    } else {
      console.log('[AdoptedChannels] No state file found, using default state');
      currentState = { ...defaultState };
    }
  } catch (error) {
    console.error('[AdoptedChannels] Error loading state file:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

/**
 * Get all adopted channels
 */
export function getAdoptedChannels(): AdoptedChannel[] {
  return [...currentState.channels];
}

/**
 * Get an adopted channel by its Discord ID
 */
export function getAdoptedChannelById(channelId: string): AdoptedChannel | undefined {
  return currentState.channels.find((ch) => ch.channelId === channelId);
}

/**
 * Check if a channel is adopted (fast lookup)
 */
export function isAdoptedChannel(channelId: string): boolean {
  return currentState.channels.some((ch) => ch.channelId === channelId);
}

/**
 * Get a Set of all adopted channel IDs for O(1) lookups in cleanup
 */
export function getAdoptedChannelIds(): Set<string> {
  return new Set(currentState.channels.map((ch) => ch.channelId));
}

/**
 * Adopt a channel (or update its access flag if already adopted)
 */
export function adoptChannel(
  channelId: string,
  channelName: string,
  categoryId: string | null,
  categoryName: string | null,
  accessFlag: AccessFlag,
  adoptedBy: string
): AdoptedChannel {
  // Check if already adopted — update in-place
  const existing = currentState.channels.find((ch) => ch.channelId === channelId);
  if (existing) {
    existing.channelName = channelName;
    existing.categoryId = categoryId;
    existing.categoryName = categoryName;
    existing.accessFlag = accessFlag;
    console.log(
      `[AdoptedChannels] Updated adopted channel "${channelName}" (${channelId}) to ${accessFlag}`
    );
    saveState();
    return existing;
  }

  // New adoption
  const adopted: AdoptedChannel = {
    channelId,
    channelName,
    categoryId,
    categoryName,
    accessFlag,
    adoptedBy,
    adoptedAt: new Date().toISOString(),
  };

  currentState.channels.push(adopted);
  saveState();

  console.log(
    `[AdoptedChannels] Adopted channel "${channelName}" (${channelId}) with ${accessFlag}`
  );
  return adopted;
}

/**
 * Remove a channel from adopted management
 * Returns the removed record, or undefined if not found
 */
export function unadoptChannel(channelId: string): AdoptedChannel | undefined {
  const index = currentState.channels.findIndex((ch) => ch.channelId === channelId);
  if (index === -1) return undefined;

  const [removed] = currentState.channels.splice(index, 1);
  saveState();

  console.log(
    `[AdoptedChannels] Unadopted channel "${removed.channelName}" (${removed.channelId})`
  );
  return removed;
}

/**
 * Remove adopted channels whose IDs are no longer present in the guild
 * Returns the names of pruned channels
 */
export function pruneDeletedChannels(validChannelIds: Set<string>): string[] {
  const pruned: string[] = [];

  currentState.channels = currentState.channels.filter((ch) => {
    if (validChannelIds.has(ch.channelId)) return true;
    pruned.push(ch.channelName);
    return false;
  });

  if (pruned.length > 0) {
    saveState();
    console.log(`[AdoptedChannels] Pruned ${pruned.length} deleted channels: ${pruned.join(', ')}`);
  }

  return pruned;
}
