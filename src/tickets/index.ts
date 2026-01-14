import fs from 'fs';
import path from 'path';
import { Ticket, TicketState, TicketType } from '../types';

const TICKETS_FILE = path.join(process.cwd(), 'tickets.json');

// Default state when no file exists
const defaultState: TicketState = {
  tickets: [],
  nextId: 1,
};

let currentState: TicketState = { ...defaultState };

/**
 * Load ticket state from tickets.json file
 */
export function loadTicketState(): TicketState {
  try {
    if (fs.existsSync(TICKETS_FILE)) {
      const data = fs.readFileSync(TICKETS_FILE, 'utf-8');
      currentState = JSON.parse(data) as TicketState;
      console.log(`[Tickets] Loaded ${currentState.tickets.length} tickets from file`);
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
 * Save current ticket state to tickets.json file
 */
function saveTicketState(): void {
  try {
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(currentState, null, 2), 'utf-8');
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
