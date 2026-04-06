import fs from 'fs';
import path from 'path';
import { StatusState, ServerStatus, MaintenanceInfo } from '../types';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const STATE_FILE = path.join(DATA_DIR, 'status.json');

// Default state when no file exists
const defaultState: StatusState = {
  status: 'offline',
  lastUpdated: new Date().toISOString(),
  maintenance: null,
};

let currentState: StatusState = { ...defaultState };

/**
 * Atomically write data to a file (write to temp, then rename)
 */
function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    // Same dir as target to avoid EXDEV on mounted volumes
    path.dirname(filePath),
    `.state-${Date.now()}-${Math.random().toString(36)}.tmp`
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
function isValidStatusState(data: unknown): data is StatusState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.status === 'string' &&
    ['online', 'maintenance', 'offline'].includes(obj.status) &&
    typeof obj.lastUpdated === 'string'
  );
}

/**
 * Load state from status.json file
 */
export function loadState(): StatusState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (isValidStatusState(parsed)) {
        currentState = parsed;
        console.log('[State] Loaded state from file:', currentState.status);
      } else {
        console.warn('[State] Invalid state file format, using default state');
        currentState = { ...defaultState };
      }
    } else {
      console.log('[State] No state file found, using default state');
      currentState = { ...defaultState };
    }
  } catch (error) {
    console.error('[State] Error loading state file:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

/**
 * Save current state to status.json file (atomic write)
 */
export function saveState(): void {
  try {
    atomicWriteSync(STATE_FILE, JSON.stringify(currentState, null, 2));
    console.log('[State] State saved to file');
  } catch (error) {
    console.error('[State] Error saving state file:', error);
  }
}

/**
 * Get current status state
 */
export function getState(): StatusState {
  return { ...currentState };
}

/**
 * Update server status
 */
export function updateStatus(status: ServerStatus): void {
  currentState.status = status;
  currentState.lastUpdated = new Date().toISOString();
  if (status !== 'maintenance') {
    currentState.maintenance = null;
  }
  saveState();
  console.log('[State] Status updated to:', status);
}

/**
 * Update maintenance information
 */
export function updateMaintenance(maintenance: MaintenanceInfo): void {
  currentState.status = 'maintenance';
  currentState.lastUpdated = new Date().toISOString();
  currentState.maintenance = maintenance;
  saveState();
  console.log('[State] Maintenance info updated:', maintenance);
}

/**
 * Clear maintenance information
 */
export function clearMaintenance(): void {
  currentState.maintenance = null;
  saveState();
  console.log('[State] Maintenance cleared');
}
