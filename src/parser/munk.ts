import { Message } from 'discord.js';
import { parse, isValid } from 'date-fns';
import { ServerStatus, MaintenanceInfo } from '../types';

// Regex patterns for parsing Munk messages
const SERVER_STATUS_TITLE = /\[Global\]\s*Server\s*Status/i;
const SERVER_MAINTENANCE_TITLE = /\[Global\]\s*Server\s*Maintenance/i;

// Status patterns
const ONLINE_PATTERN = /server\s+is\s+(back\s+)?online/i;
const OFFLINE_PATTERN = /server\s+is\s+(going\s+)?offline|server\s+is\s+down/i;

// Maintenance time patterns
// Matches: "January 8, 2026 at 6:00 AM" or similar formats
const DATE_TIME_PATTERN = /([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/gi;
const DURATION_PATTERN = /(\d+)[-\s]?minute/i;

export type ParseResult =
  | { type: 'status'; status: ServerStatus }
  | { type: 'maintenance'; maintenance: MaintenanceInfo }
  | null;

/**
 * Parse a date string like "January 8, 2026 at 6:00 AM"
 */
function parseDateTimeString(dateStr: string, timeStr: string): Date | null {
  // Try multiple formats
  const formats = [
    'MMMM d, yyyy h:mm a', // January 8, 2026 6:00 AM
    'MMMM d yyyy h:mm a', // January 8 2026 6:00 AM
    'MMMM dd, yyyy h:mm a', // January 08, 2026 6:00 AM
    'MMMM dd yyyy h:mm a', // January 08 2026 6:00 AM
  ];

  const combined = `${dateStr} ${timeStr}`.replace(/,/g, '').replace(/\s+/g, ' ').trim();

  for (const format of formats) {
    const parsed = parse(combined, format, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Extract all date-time pairs from a string
 */
function extractDateTimes(text: string): Date[] {
  const dates: Date[] = [];
  let match;

  // Reset regex state
  DATE_TIME_PATTERN.lastIndex = 0;

  while ((match = DATE_TIME_PATTERN.exec(text)) !== null) {
    const dateStr = match[1];
    const timeStr = match[2];
    const parsed = parseDateTimeString(dateStr, timeStr);
    if (parsed) {
      dates.push(parsed);
    }
  }

  return dates;
}

/**
 * Extract duration in minutes from text
 */
function extractDuration(text: string): number | null {
  const match = DURATION_PATTERN.exec(text);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Parse server status from embed description
 */
function parseServerStatus(description: string): ServerStatus | null {
  if (ONLINE_PATTERN.test(description)) {
    return 'online';
  }
  if (OFFLINE_PATTERN.test(description)) {
    return 'offline';
  }
  return null;
}

/**
 * Parse maintenance information from embed description
 */
function parseMaintenanceInfo(description: string): MaintenanceInfo | null {
  const dates = extractDateTimes(description);
  const duration = extractDuration(description);

  // We need at least a start time
  if (dates.length === 0) {
    console.log('[Parser] No dates found in maintenance message');
    return null;
  }

  const startTime = dates[0];
  let endTime: Date;
  let durationMinutes: number;

  if (dates.length >= 2) {
    // Both start and end times provided
    endTime = dates[1];
    durationMinutes = duration ?? Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  } else if (duration) {
    // Only start time and duration provided
    durationMinutes = duration;
    endTime = new Date(startTime.getTime() + duration * 60000);
  } else {
    // Only start time - assume 60 minute default
    console.log('[Parser] No end time or duration found, using 60 minute default');
    durationMinutes = 60;
    endTime = new Date(startTime.getTime() + 60 * 60000);
  }

  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMinutes,
    message: description,
  };
}

/**
 * Parse a Munk bot message and extract status or maintenance info
 */
export function parseMunkMessage(message: Message): ParseResult {
  // Check if message has embeds
  if (message.embeds.length === 0) {
    console.log('[Parser] Message has no embeds');
    return null;
  }

  const embed = message.embeds[0];
  const title = embed.title || '';
  const description = embed.description || '';

  console.log(`[Parser] Parsing embed with title: "${title}"`);

  // Check for server status message
  if (SERVER_STATUS_TITLE.test(title)) {
    const status = parseServerStatus(description);
    if (status) {
      return { type: 'status', status };
    }
    // If we can't determine online/offline, assume it's about maintenance ending
    return { type: 'status', status: 'online' };
  }

  // Check for server maintenance message
  if (SERVER_MAINTENANCE_TITLE.test(title)) {
    const maintenance = parseMaintenanceInfo(description);
    if (maintenance) {
      return { type: 'maintenance', maintenance };
    }
    // Couldn't parse maintenance details but it's clearly a maintenance message
    return { type: 'status', status: 'maintenance' };
  }

  console.log('[Parser] Embed title does not match expected patterns');
  return null;
}
