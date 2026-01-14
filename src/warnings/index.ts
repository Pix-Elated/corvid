import fs from 'fs';
import path from 'path';
import os from 'os';

const WARNINGS_FILE = path.join(process.cwd(), 'warnings.json');

export interface Warning {
  moderatorId: string;
  reason: string;
  timestamp: string;
}

interface WarningsState {
  // Key format: "guildId-userId"
  warnings: Record<string, Warning[]>;
}

const defaultState: WarningsState = {
  warnings: {},
};

let currentState: WarningsState = { ...defaultState };

/**
 * Atomically write data to a file (write to temp, then rename)
 */
function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    os.tmpdir(),
    `warnings-${Date.now()}-${Math.random().toString(36)}.tmp`
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
function isValidWarningsState(data: unknown): data is WarningsState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.warnings !== 'object' || obj.warnings === null) return false;
  return true;
}

/**
 * Load warnings state from file
 */
export function loadWarningsState(): WarningsState {
  try {
    if (fs.existsSync(WARNINGS_FILE)) {
      const data = fs.readFileSync(WARNINGS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (isValidWarningsState(parsed)) {
        currentState = parsed;
        const totalWarnings = Object.values(currentState.warnings).reduce(
          (sum, arr) => sum + arr.length,
          0
        );
        console.log(`[Warnings] Loaded ${totalWarnings} warnings from file`);
      } else {
        console.warn('[Warnings] Invalid warnings file format, using default state');
        currentState = { ...defaultState };
      }
    } else {
      console.log('[Warnings] No warnings file found, using default state');
      currentState = { ...defaultState };
    }
  } catch (error) {
    console.error('[Warnings] Error loading warnings file:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

/**
 * Save current warnings state to file (atomic write)
 */
function saveWarningsState(): void {
  try {
    atomicWriteSync(WARNINGS_FILE, JSON.stringify(currentState, null, 2));
    console.log('[Warnings] Warnings state saved to file');
  } catch (error) {
    console.error('[Warnings] Error saving warnings file:', error);
  }
}

/**
 * Get warnings for a specific user in a guild
 */
export function getWarnings(guildId: string, userId: string): Warning[] {
  const key = `${guildId}-${userId}`;
  return currentState.warnings[key] || [];
}

/**
 * Add a warning for a user
 */
export function addWarning(
  guildId: string,
  userId: string,
  moderatorId: string,
  reason: string
): Warning[] {
  const key = `${guildId}-${userId}`;
  if (!currentState.warnings[key]) {
    currentState.warnings[key] = [];
  }

  const warning: Warning = {
    moderatorId,
    reason,
    timestamp: new Date().toISOString(),
  };

  currentState.warnings[key].push(warning);
  saveWarningsState();

  console.log(`[Warnings] Added warning for ${userId} in guild ${guildId}`);
  return currentState.warnings[key];
}

/**
 * Clear all warnings for a user
 */
export function clearWarnings(guildId: string, userId: string): number {
  const key = `${guildId}-${userId}`;
  const previousCount = currentState.warnings[key]?.length || 0;

  if (previousCount > 0) {
    delete currentState.warnings[key];
    saveWarningsState();
    console.log(`[Warnings] Cleared ${previousCount} warnings for ${userId} in guild ${guildId}`);
  }

  return previousCount;
}
