/**
 * Persistent state for the QUEST tracker module.
 * Tracks watchlist, channel config, and sync timestamps.
 */
import fs from 'fs';
import path from 'path';

const DATA_PATH = process.env.DATA_PATH || process.cwd();
const STATE_FILE = path.join(DATA_PATH, 'quest-tracker.json');

export interface WatchedWallet {
  address: string;
  label: string;
  addedBy: string; // Discord user ID
  addedAt: string; // ISO
}

export interface TrackerState {
  /** Discord channel ID for auto-posting */
  channelId: string | null;
  /** Wallets being watched for activity */
  watchlist: WatchedWallet[];
  /** Last sync timestamp (ISO) for incremental polling */
  lastSyncAt: string | null;
  /** Minimum QUEST amount to flag as "interesting" in auto-posts */
  whaleThreshold: number;
}

const defaultState: TrackerState = {
  channelId: null,
  watchlist: [],
  lastSyncAt: null,
  whaleThreshold: 10_000,
};

let currentState: TrackerState = { ...defaultState };

function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    path.dirname(filePath),
    `.quest-tracker-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  );
  try {
    fs.writeFileSync(tempFile, data, 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
    throw error;
  }
}

function saveState(): void {
  try {
    atomicWriteSync(STATE_FILE, JSON.stringify(currentState, null, 2));
  } catch (error) {
    console.error('[QuestTracker] Error saving state:', error);
  }
}

export function loadTrackerState(): TrackerState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        currentState = {
          channelId: parsed.channelId || null,
          watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
          lastSyncAt: parsed.lastSyncAt || null,
          whaleThreshold: parsed.whaleThreshold || 10_000,
        };
      }
    }
  } catch (error) {
    console.error('[QuestTracker] Error loading state:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

export function getTrackerState(): TrackerState {
  return currentState;
}

export function setChannel(channelId: string): void {
  currentState.channelId = channelId;
  saveState();
}

export function setLastSync(timestamp: string): void {
  currentState.lastSyncAt = timestamp;
  saveState();
}

export function setWhaleThreshold(amount: number): void {
  currentState.whaleThreshold = amount;
  saveState();
}

export function addWatchedWallet(address: string, label: string, addedBy: string): boolean {
  const normalized = address.toLowerCase();
  if (currentState.watchlist.some((w) => w.address.toLowerCase() === normalized)) {
    return false; // Already watched
  }
  currentState.watchlist.push({
    address: normalized,
    label,
    addedBy,
    addedAt: new Date().toISOString(),
  });
  saveState();
  return true;
}

export function removeWatchedWallet(address: string): boolean {
  const normalized = address.toLowerCase();
  const before = currentState.watchlist.length;
  currentState.watchlist = currentState.watchlist.filter(
    (w) => w.address.toLowerCase() !== normalized
  );
  if (currentState.watchlist.length < before) {
    saveState();
    return true;
  }
  return false;
}

export function getWatchlist(): WatchedWallet[] {
  return currentState.watchlist;
}
