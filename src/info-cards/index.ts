import fs from 'fs';
import path from 'path';
import os from 'os';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const CARDS_FILE = path.join(DATA_DIR, 'info-cards.json');

export interface InfoCardState {
  // channelName -> messageId
  cards: Record<string, string>;
}

const defaultState: InfoCardState = {
  cards: {},
};

let currentState: InfoCardState = { ...defaultState };

/**
 * Atomically write data to a file
 */
function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    os.tmpdir(),
    `info-cards-${Date.now()}-${Math.random().toString(36)}.tmp`
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
 * Load info cards state from file
 */
export function loadInfoCardsState(): InfoCardState {
  try {
    if (fs.existsSync(CARDS_FILE)) {
      const data = fs.readFileSync(CARDS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed.cards === 'object') {
        currentState = parsed;
        console.log(`[InfoCards] Loaded ${Object.keys(currentState.cards).length} card references`);
      }
    } else {
      console.log('[InfoCards] No state file found, using default state');
    }
  } catch (error) {
    console.error('[InfoCards] Error loading state file:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

/**
 * Save current state to file
 */
function saveState(): void {
  try {
    atomicWriteSync(CARDS_FILE, JSON.stringify(currentState, null, 2));
  } catch (error) {
    console.error('[InfoCards] Error saving state file:', error);
  }
}

/**
 * Get the message ID for a channel's info card
 */
export function getCardMessageId(channelName: string): string | undefined {
  return currentState.cards[channelName];
}

/**
 * Set the message ID for a channel's info card
 */
export function setCardMessageId(channelName: string, messageId: string): void {
  currentState.cards[channelName] = messageId;
  saveState();
}

/**
 * Remove a card reference
 */
export function removeCardReference(channelName: string): void {
  delete currentState.cards[channelName];
  saveState();
}

/**
 * Get all tracked cards
 */
export function getAllCards(): Record<string, string> {
  return { ...currentState.cards };
}
