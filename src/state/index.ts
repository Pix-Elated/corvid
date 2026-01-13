import fs from 'fs';
import path from 'path';
import { StatusState, ServerStatus, MaintenanceInfo } from '../types';

const STATE_FILE = path.join(process.cwd(), 'status.json');

// Default state when no file exists
const defaultState: StatusState = {
  status: 'offline',
  lastUpdated: new Date().toISOString(),
  maintenance: null,
};

let currentState: StatusState = { ...defaultState };

/**
 * Load state from status.json file
 */
export function loadState(): StatusState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      currentState = JSON.parse(data) as StatusState;
      console.log('[State] Loaded state from file:', currentState.status);
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
 * Save current state to status.json file
 */
export function saveState(): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(currentState, null, 2), 'utf-8');
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
