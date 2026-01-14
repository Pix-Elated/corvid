import fs from 'fs';
import path from 'path';
import os from 'os';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const STATE_FILE = path.join(DATA_DIR, 'server-state.json');

export interface ServerState {
  guildId: string;
  // Maps name -> Discord ID
  categories: Record<string, string>;
  channels: Record<string, string>;
  roles: Record<string, string>;
  // Track special message IDs (verify panel, ticket panel, etc.)
  messages: Record<string, { channelId: string; messageId: string }>;
  lastSetup: string | null;
  lastPopulate: string | null;
}

const defaultState: ServerState = {
  guildId: '',
  categories: {},
  channels: {},
  roles: {},
  messages: {},
  lastSetup: null,
  lastPopulate: null,
};

let currentState: ServerState = { ...defaultState };

/**
 * Atomically write data to a file
 */
function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    os.tmpdir(),
    `server-state-${Date.now()}-${Math.random().toString(36)}.tmp`
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
 * Load server state from file
 */
export function loadServerState(): ServerState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      currentState = { ...defaultState, ...parsed };
      const channelCount = Object.keys(currentState.channels).length;
      const roleCount = Object.keys(currentState.roles).length;
      console.log(`[ServerState] Loaded state: ${channelCount} channels, ${roleCount} roles`);
    } else {
      console.log('[ServerState] No state file found, using default state');
    }
  } catch (error) {
    console.error('[ServerState] Error loading state file:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

/**
 * Save current state to file
 */
function saveState(): void {
  try {
    atomicWriteSync(STATE_FILE, JSON.stringify(currentState, null, 2));
  } catch (error) {
    console.error('[ServerState] Error saving state file:', error);
  }
}

/**
 * Set the guild ID
 */
export function setGuildId(guildId: string): void {
  currentState.guildId = guildId;
  saveState();
}

/**
 * Get the tracked guild ID
 */
export function getGuildId(): string {
  return currentState.guildId;
}

/**
 * Track a category
 */
export function trackCategory(name: string, id: string): void {
  currentState.categories[name] = id;
  saveState();
}

/**
 * Get a tracked category ID by name
 */
export function getCategoryId(name: string): string | undefined {
  return currentState.categories[name];
}

/**
 * Track a channel
 */
export function trackChannel(name: string, id: string): void {
  currentState.channels[name] = id;
  saveState();
}

/**
 * Get a tracked channel ID by name
 */
export function getChannelId(name: string): string | undefined {
  return currentState.channels[name];
}

/**
 * Untrack a channel
 */
export function untrackChannel(name: string): void {
  delete currentState.channels[name];
  saveState();
}

/**
 * Track a role
 */
export function trackRole(name: string, id: string): void {
  currentState.roles[name] = id;
  saveState();
}

/**
 * Get a tracked role ID by name
 */
export function getRoleId(name: string): string | undefined {
  return currentState.roles[name];
}

/**
 * Track a message (panels, embeds, etc.)
 */
export function trackMessage(key: string, channelId: string, messageId: string): void {
  currentState.messages[key] = { channelId, messageId };
  saveState();
}

/**
 * Get a tracked message
 */
export function getTrackedMessage(key: string): { channelId: string; messageId: string } | undefined {
  return currentState.messages[key];
}

/**
 * Untrack a message
 */
export function untrackMessage(key: string): void {
  delete currentState.messages[key];
  saveState();
}

/**
 * Record setup timestamp
 */
export function recordSetup(): void {
  currentState.lastSetup = new Date().toISOString();
  saveState();
}

/**
 * Record populate timestamp
 */
export function recordPopulate(): void {
  currentState.lastPopulate = new Date().toISOString();
  saveState();
}

/**
 * Get all tracked data
 */
export function getServerState(): ServerState {
  return { ...currentState };
}

/**
 * Get summary for status display
 */
export function getServerStateSummary(): {
  categories: number;
  channels: number;
  roles: number;
  messages: number;
  lastSetup: string | null;
  lastPopulate: string | null;
} {
  return {
    categories: Object.keys(currentState.categories).length,
    channels: Object.keys(currentState.channels).length,
    roles: Object.keys(currentState.roles).length,
    messages: Object.keys(currentState.messages).length,
    lastSetup: currentState.lastSetup,
    lastPopulate: currentState.lastPopulate,
  };
}

/**
 * Clear all tracked data (for reset)
 */
export function clearServerState(): void {
  currentState = { ...defaultState };
  saveState();
  console.log('[ServerState] State cleared');
}

/**
 * Check if a channel exists in Discord by its tracked ID
 */
export function getTrackedChannels(): Record<string, string> {
  return { ...currentState.channels };
}

/**
 * Check if a category exists in Discord by its tracked ID
 */
export function getTrackedCategories(): Record<string, string> {
  return { ...currentState.categories };
}

/**
 * Check if a role exists in Discord by its tracked ID
 */
export function getTrackedRoles(): Record<string, string> {
  return { ...currentState.roles };
}
