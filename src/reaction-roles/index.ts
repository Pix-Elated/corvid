import fs from 'fs';
import path from 'path';
import os from 'os';
import { ReactionRolesState, RolePanel, RoleOption } from '../types';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const ROLES_FILE = path.join(DATA_DIR, 'reaction-roles.json');

const defaultState: ReactionRolesState = {
  panels: [],
  nextId: 1,
};

let currentState: ReactionRolesState = { ...defaultState };

/**
 * Atomically write data to a file (write to temp, then rename)
 */
function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    os.tmpdir(),
    `reaction-roles-${Date.now()}-${Math.random().toString(36)}.tmp`
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
function isValidState(data: unknown): data is ReactionRolesState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.panels)) return false;
  if (typeof obj.nextId !== 'number') return false;
  return true;
}

/**
 * Load reaction roles state from file
 */
export function loadReactionRolesState(): ReactionRolesState {
  try {
    if (fs.existsSync(ROLES_FILE)) {
      const data = fs.readFileSync(ROLES_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (isValidState(parsed)) {
        currentState = parsed;
        console.log(`[ReactionRoles] Loaded ${currentState.panels.length} role panels from file`);
      } else {
        console.warn('[ReactionRoles] Invalid state file format, using default state');
        currentState = { ...defaultState };
      }
    } else {
      console.log('[ReactionRoles] No state file found, using default state');
      currentState = { ...defaultState };
    }
  } catch (error) {
    console.error('[ReactionRoles] Error loading state file:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

/**
 * Save current state to file (atomic write)
 */
function saveState(): void {
  try {
    atomicWriteSync(ROLES_FILE, JSON.stringify(currentState, null, 2));
    console.log('[ReactionRoles] State saved to file');
  } catch (error) {
    console.error('[ReactionRoles] Error saving state file:', error);
  }
}

/**
 * Create a new role panel
 */
export function createPanel(
  guildId: string,
  channelId: string,
  messageId: string,
  title: string,
  roles: RoleOption[],
  createdBy: string,
  description?: string
): RolePanel {
  const id = `panel-${String(currentState.nextId).padStart(4, '0')}`;
  currentState.nextId++;

  const panel: RolePanel = {
    id,
    messageId,
    channelId,
    guildId,
    title,
    description,
    roles,
    createdAt: new Date().toISOString(),
    createdBy,
  };

  currentState.panels.push(panel);
  saveState();

  console.log(`[ReactionRoles] Created panel ${id} with ${roles.length} roles`);
  return panel;
}

/**
 * Get a panel by its ID
 */
export function getPanel(panelId: string): RolePanel | undefined {
  return currentState.panels.find((p) => p.id === panelId);
}

/**
 * Get a panel by its message ID
 */
export function getPanelByMessageId(messageId: string): RolePanel | undefined {
  return currentState.panels.find((p) => p.messageId === messageId);
}

/**
 * Get all panels for a guild
 */
export function getPanelsForGuild(guildId: string): RolePanel[] {
  return currentState.panels.filter((p) => p.guildId === guildId);
}

/**
 * Remove a panel
 */
export function removePanel(panelId: string): boolean {
  const index = currentState.panels.findIndex((p) => p.id === panelId);
  if (index === -1) return false;

  currentState.panels.splice(index, 1);
  saveState();

  console.log(`[ReactionRoles] Removed panel ${panelId}`);
  return true;
}

/**
 * Update a panel's message ID (if message was re-sent)
 */
export function updatePanelMessageId(panelId: string, newMessageId: string): boolean {
  const panel = currentState.panels.find((p) => p.id === panelId);
  if (!panel) return false;

  panel.messageId = newMessageId;
  saveState();

  console.log(`[ReactionRoles] Updated panel ${panelId} message ID`);
  return true;
}
