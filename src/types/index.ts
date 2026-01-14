import { PermissionFlagsBits, ChannelType } from 'discord.js';

// Server Status Types
export type ServerStatus = 'online' | 'maintenance' | 'offline';

export interface MaintenanceInfo {
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  durationMinutes: number;
  message: string;
}

export interface StatusState {
  status: ServerStatus;
  lastUpdated: string; // ISO 8601
  maintenance: MaintenanceInfo | null;
}

// API Response Types
export interface StatusResponse {
  status: ServerStatus;
  lastUpdated: string;
  maintenance: MaintenanceInfo | null;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

// Server Structure Types
export type PermissionString = keyof typeof PermissionFlagsBits;

export interface RolePermissions {
  allow?: PermissionString[];
  deny?: PermissionString[];
}

export interface RoleConfig {
  name: string;
  color?: number;
  hoist?: boolean;
  mentionable?: boolean;
  permissions: bigint;
}

export interface ChannelPermissionOverwrite {
  role: string; // Role name to reference
  allow?: PermissionString[];
  deny?: PermissionString[];
}

export interface ChannelConfig {
  name: string;
  type: ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildAnnouncement;
  topic?: string;
  permissionOverwrites?: ChannelPermissionOverwrite[];
}

export interface CategoryConfig {
  name: string;
  permissionOverwrites?: ChannelPermissionOverwrite[];
  channels: ChannelConfig[];
}

export interface ServerStructure {
  roles: RoleConfig[];
  categories: CategoryConfig[];
}

// Configuration Types
export interface Config {
  discordBotToken: string;
  guildId: string;
  sourceChannelId: string;
  port: number;
  timezone: string;
}

// Bootstrap Types
export interface BootstrapResult {
  success: boolean;
  rolesCreated: string[];
  rolesSkipped: string[];
  categoriesCreated: string[];
  categoriesSkipped: string[];
  channelsCreated: string[];
  channelsSkipped: string[];
  errors: string[];
}

// Ticket System Types
export type TicketType = 'feature' | 'bug' | 'support';

export interface Ticket {
  id: string; // Unique ID (e.g., "ticket-0001")
  channelId: string; // Discord channel ID
  creatorId: string; // User who opened ticket
  type: TicketType;
  subject: string; // From modal
  description: string; // From modal
  priority?: 'low' | 'medium' | 'high' | 'critical'; // For bug reports
  createdAt: string; // ISO timestamp
  lastActivity: string; // ISO timestamp (updated on each message)
  warnedAt?: string; // ISO timestamp when auto-close warning was sent
}

export interface TicketState {
  tickets: Ticket[];
  nextId: number;
}
