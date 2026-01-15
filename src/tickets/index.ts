import fs from 'fs';
import path from 'path';
import os from 'os';
import { Ticket, TicketState, TicketType } from '../types';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');

// Default state when no file exists
const defaultState: TicketState = {
  tickets: [],
  nextId: 1,
};

let currentState: TicketState = { ...defaultState };

/**
 * Atomically write data to a file (write to temp, then rename)
 */
function atomicWriteSync(filePath: string, data: string): void {
  const tempFile = path.join(
    os.tmpdir(),
    `tickets-${Date.now()}-${Math.random().toString(36)}.tmp`
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
function isValidTicketState(data: unknown): data is TicketState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return Array.isArray(obj.tickets) && typeof obj.nextId === 'number';
}

/**
 * Load ticket state from tickets.json file
 */
export function loadTicketState(): TicketState {
  try {
    if (fs.existsSync(TICKETS_FILE)) {
      const data = fs.readFileSync(TICKETS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (isValidTicketState(parsed)) {
        currentState = parsed;
        console.log(`[Tickets] Loaded ${currentState.tickets.length} tickets from file`);
      } else {
        console.warn('[Tickets] Invalid tickets file format, using default state');
        currentState = { ...defaultState };
      }
    } else {
      console.log('[Tickets] No tickets file found, using default state');
      currentState = { ...defaultState };
    }
  } catch (error) {
    console.error('[Tickets] Error loading tickets file:', error);
    currentState = { ...defaultState };
  }
  return currentState;
}

/**
 * Save current ticket state to tickets.json file (atomic write)
 */
function saveTicketState(): void {
  try {
    atomicWriteSync(TICKETS_FILE, JSON.stringify(currentState, null, 2));
    console.log('[Tickets] Ticket state saved to file');
  } catch (error) {
    console.error('[Tickets] Error saving tickets file:', error);
  }
}

/**
 * Get all active tickets
 */
export function getTickets(): Ticket[] {
  return [...currentState.tickets];
}

/**
 * Get a ticket by its channel ID
 */
export function getTicketByChannelId(channelId: string): Ticket | undefined {
  return currentState.tickets.find((t) => t.channelId === channelId);
}

/**
 * Get a ticket by its ID
 */
export function getTicketById(ticketId: string): Ticket | undefined {
  return currentState.tickets.find((t) => t.id === ticketId);
}

/**
 * Create a new ticket
 */
export function createTicket(
  channelId: string,
  creatorId: string,
  type: TicketType,
  subject: string,
  description: string,
  priority?: 'low' | 'medium' | 'high' | 'critical'
): Ticket {
  const id = `ticket-${String(currentState.nextId).padStart(4, '0')}`;
  const now = new Date().toISOString();

  const ticket: Ticket = {
    id,
    channelId,
    creatorId,
    type,
    subject,
    description,
    priority,
    createdAt: now,
    lastActivity: now,
  };

  currentState.tickets.push(ticket);
  currentState.nextId++;
  saveTicketState();

  console.log(`[Tickets] Created ticket ${id} for user ${creatorId}`);
  return ticket;
}

/**
 * Update ticket's last activity timestamp
 */
export function updateTicketActivity(channelId: string): void {
  const ticket = currentState.tickets.find((t) => t.channelId === channelId);
  if (ticket) {
    ticket.lastActivity = new Date().toISOString();
    ticket.warnedAt = undefined; // Clear warning if there was new activity
    saveTicketState();
  }
}

/**
 * Mark a ticket as warned for auto-close
 */
export function markTicketWarned(channelId: string): void {
  const ticket = currentState.tickets.find((t) => t.channelId === channelId);
  if (ticket) {
    ticket.warnedAt = new Date().toISOString();
    saveTicketState();
  }
}

/**
 * Remove a ticket from state (when closed)
 */
export function removeTicket(channelId: string): Ticket | undefined {
  const index = currentState.tickets.findIndex((t) => t.channelId === channelId);
  if (index !== -1) {
    const [removed] = currentState.tickets.splice(index, 1);
    saveTicketState();
    console.log(`[Tickets] Removed ticket ${removed.id}`);
    return removed;
  }
  return undefined;
}

/**
 * Get tickets that are inactive (no activity for specified hours)
 */
export function getInactiveTickets(hours: number): Ticket[] {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return currentState.tickets.filter((t) => t.lastActivity < cutoff);
}

/**
 * Get tickets that have been warned and are past the grace period
 */
export function getExpiredWarnings(gracePeriodHours: number): Ticket[] {
  const cutoff = new Date(Date.now() - gracePeriodHours * 60 * 60 * 1000).toISOString();
  return currentState.tickets.filter((t) => t.warnedAt && t.warnedAt < cutoff);
}

/**
 * Get ticket statistics
 */
export function getTicketStats(): { active: number; total: number } {
  return {
    active: currentState.tickets.length,
    total: currentState.nextId - 1,
  };
}
