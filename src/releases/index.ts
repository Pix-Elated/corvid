import fs from 'fs';
import path from 'path';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const RELEASES_FILE = path.join(DATA_DIR, 'releases.json');

export interface PendingRelease {
  id: string;
  version: string;
  changelog: string;
  releaseUrl: string;
  receivedAt: string;
  notificationMessageId?: string;
  notificationChannelId?: string;
}

export interface ReleaseState {
  pending: PendingRelease | null;
  lastPublished?: {
    version: string;
    publishedAt: string;
    publishedBy: string;
  };
}

const defaultState: ReleaseState = {
  pending: null,
};

let currentState: ReleaseState = { ...defaultState };

/**
 * Atomically write data to a file (write to temp, then rename)
 */
function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    // Same dir as target to avoid EXDEV on mounted volumes
    path.dirname(filePath),
    `.releases-${Date.now()}-${Math.random().toString(36)}.tmp`
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

/**
 * Validate that loaded data matches expected schema
 */
function isValidReleaseState(data: unknown): data is ReleaseState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  // pending can be null or an object with required fields
  if (obj.pending !== null) {
    if (typeof obj.pending !== 'object') return false;
    const pending = obj.pending as Record<string, unknown>;
    if (
      typeof pending.id !== 'string' ||
      typeof pending.version !== 'string' ||
      typeof pending.changelog !== 'string' ||
      typeof pending.releaseUrl !== 'string' ||
      typeof pending.receivedAt !== 'string'
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Load state from releases.json file
 */
export function loadReleaseState(): ReleaseState {
  try {
    if (fs.existsSync(RELEASES_FILE)) {
      const data = fs.readFileSync(RELEASES_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (isValidReleaseState(parsed)) {
        currentState = parsed;
        console.log('[Releases] Loaded state from file');
      } else {
        console.warn('[Releases] Invalid state file format, using default state');
        currentState = { ...defaultState };
      }
    } else {
      console.log('[Releases] No state file found, using default state');
      currentState = { ...defaultState };
    }
  } catch (error) {
    console.error('[Releases] Error loading state file:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

/**
 * Save current state to releases.json file (atomic write)
 */
export function saveReleaseState(): void {
  try {
    atomicWriteSync(RELEASES_FILE, JSON.stringify(currentState, null, 2));
    console.log('[Releases] State saved to file');
  } catch (error) {
    console.error('[Releases] Error saving state file:', error);
  }
}

/**
 * Generate a unique release ID
 */
function generateReleaseId(): string {
  return `release-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Set a pending release
 */
export function setPendingRelease(
  version: string,
  changelog: string,
  releaseUrl: string
): PendingRelease {
  const release: PendingRelease = {
    id: generateReleaseId(),
    version,
    changelog,
    releaseUrl,
    receivedAt: new Date().toISOString(),
  };
  currentState.pending = release;
  saveReleaseState();
  console.log(`[Releases] Set pending release: ${version}`);
  return release;
}

/**
 * Get the current pending release
 */
export function getPendingRelease(): PendingRelease | null {
  return currentState.pending;
}

/**
 * Update the notification message ID for the pending release
 */
export function updatePendingNotification(messageId: string, channelId: string): void {
  if (currentState.pending) {
    currentState.pending.notificationMessageId = messageId;
    currentState.pending.notificationChannelId = channelId;
    saveReleaseState();
  }
}

/**
 * Clear the pending release and record it as published
 */
export function publishRelease(publishedBy: string): PendingRelease | null {
  const release = currentState.pending;
  if (!release) return null;

  currentState.lastPublished = {
    version: release.version,
    publishedAt: new Date().toISOString(),
    publishedBy,
  };
  currentState.pending = null;
  saveReleaseState();
  console.log(`[Releases] Published release ${release.version} by ${publishedBy}`);
  return release;
}

/**
 * Discard the pending release without publishing
 */
export function discardRelease(): PendingRelease | null {
  const release = currentState.pending;
  if (!release) return null;

  currentState.pending = null;
  saveReleaseState();
  console.log(`[Releases] Discarded release ${release.version}`);
  return release;
}

/**
 * Get the last published release info
 */
export function getLastPublished(): ReleaseState['lastPublished'] {
  return currentState.lastPublished;
}
