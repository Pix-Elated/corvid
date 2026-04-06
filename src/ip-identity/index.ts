import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_PATH || process.cwd();
const IP_IDENTITY_FILE = path.join(DATA_DIR, 'ip-identities.json');

interface IpEntry {
  characterName: string;
  guildTag: string;
  firstSeen: string;
  lastSeen: string;
}

interface IpIdentityState {
  // Key: IP address -> array of identities seen from that IP
  ips: Record<string, IpEntry[]>;
}

const defaultState: IpIdentityState = { ips: {} };
let currentState: IpIdentityState = { ...defaultState };

function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    path.dirname(filePath),
    `.ip-identities-${Date.now()}-${Math.random().toString(36)}.tmp`
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

function isValidState(data: unknown): data is IpIdentityState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.ips !== 'object' || obj.ips === null) return false;
  return true;
}

export function loadIpIdentityState(): void {
  try {
    if (fs.existsSync(IP_IDENTITY_FILE)) {
      const data = fs.readFileSync(IP_IDENTITY_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (isValidState(parsed)) {
        currentState = parsed;
        const totalIps = Object.keys(currentState.ips).length;
        console.log(`[IpIdentity] Loaded ${totalIps} tracked IPs from file`);
      } else {
        console.warn('[IpIdentity] Invalid file format, using default state');
        currentState = { ...defaultState };
      }
    } else {
      console.log('[IpIdentity] No state file found, starting fresh');
      currentState = { ...defaultState };
    }
  } catch (error) {
    console.error('[IpIdentity] Error loading state:', error);
    currentState = { ...defaultState };
  }
}

function saveState(): void {
  try {
    atomicWriteSync(IP_IDENTITY_FILE, JSON.stringify(currentState, null, 2));
  } catch (error) {
    console.error('[IpIdentity] Error saving state:', error);
  }
}

/**
 * Record an identity for an IP. Returns the list of OTHER character names
 * previously seen on this IP (empty if this is the first or same name).
 */
export function recordIpIdentity(ip: string, characterName: string, guildTag: string): string[] {
  const nameLower = characterName.trim().toLowerCase();
  if (!nameLower) return [];

  const entries = currentState.ips[ip] || [];
  const now = new Date().toISOString();

  // Check if this exact character name already exists for this IP
  const existing = entries.find((e) => e.characterName.trim().toLowerCase() === nameLower);

  if (existing) {
    existing.lastSeen = now;
    existing.guildTag = guildTag;
    saveState();
    return [];
  }

  // New character name for this IP — record it
  entries.push({
    characterName: characterName.trim(),
    guildTag: guildTag || '',
    firstSeen: now,
    lastSeen: now,
  });
  currentState.ips[ip] = entries;
  saveState();

  // Return all OTHER names on this IP (excluding the one just added)
  return entries
    .filter((e) => e.characterName.trim().toLowerCase() !== nameLower)
    .map((e) => {
      const tag = e.guildTag ? ` [${e.guildTag}]` : '';
      return `${e.characterName}${tag}`;
    });
}
