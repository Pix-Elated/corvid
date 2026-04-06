import { ChannelPermissionOverwrite } from '../types';
import type { AccessFlag } from './index';

/**
 * Permission overwrite presets for adopted channels.
 *
 * Each preset defines channel-level permission overwrites per role.
 * These mirror the existing category patterns in server-structure.ts:
 *   - community-readonly  → like INFORMATION (verified can see, only staff can type)
 *   - community-standard  → like COMMUNITY (verified can see and type)
 *   - staff-readonly      → like BOT (only staff can see, only admin can type)
 *   - staff-full          → like STAFF ONLY (only staff can see and type)
 *
 * Muted and Quarantine are always restricted. Admin always gets ManageMessages.
 */
export const ACCESS_FLAG_PRESETS: Record<AccessFlag, ChannelPermissionOverwrite[]> = {
  'community-readonly': [
    { role: '@everyone', deny: ['ViewChannel'] },
    {
      role: 'Verified',
      allow: ['ViewChannel', 'ReadMessageHistory'],
      deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads'],
    },
    { role: 'Support Team', allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
    {
      role: 'Moderator',
      allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
    },
    {
      role: 'Admin',
      allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
    },
    { role: 'Quarantine', deny: ['ViewChannel'] },
    { role: 'Muted', deny: ['SendMessages', 'AddReactions'] },
  ],

  'community-standard': [
    { role: '@everyone', deny: ['ViewChannel'] },
    {
      role: 'Verified',
      allow: ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'ReadMessageHistory'],
    },
    {
      role: 'Support Team',
      allow: ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'ReadMessageHistory'],
    },
    {
      role: 'Moderator',
      allow: [
        'ViewChannel',
        'SendMessages',
        'SendMessagesInThreads',
        'ReadMessageHistory',
        'ManageMessages',
      ],
    },
    {
      role: 'Admin',
      allow: [
        'ViewChannel',
        'SendMessages',
        'SendMessagesInThreads',
        'ReadMessageHistory',
        'ManageMessages',
      ],
    },
    { role: 'Quarantine', deny: ['ViewChannel'] },
    { role: 'Muted', deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads'] },
  ],

  'staff-readonly': [
    { role: '@everyone', deny: ['ViewChannel'] },
    { role: 'Verified', deny: ['ViewChannel'] },
    {
      role: 'Support Team',
      allow: ['ViewChannel', 'ReadMessageHistory'],
      deny: ['SendMessages'],
    },
    {
      role: 'Moderator',
      allow: ['ViewChannel', 'ReadMessageHistory'],
      deny: ['SendMessages'],
    },
    {
      role: 'Admin',
      allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
    },
    { role: 'Quarantine', deny: ['ViewChannel'] },
  ],

  'staff-full': [
    { role: '@everyone', deny: ['ViewChannel'] },
    { role: 'Verified', deny: ['ViewChannel'] },
    { role: 'Support Team', allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
    {
      role: 'Moderator',
      allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
    },
    {
      role: 'Admin',
      allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
    },
    { role: 'Quarantine', deny: ['ViewChannel'] },
  ],
};

/**
 * Human-readable descriptions for each access flag (used in command responses)
 */
export const ACCESS_FLAG_LABELS: Record<AccessFlag, string> = {
  'community-readonly': 'Community Read-Only (verified can see, staff can type)',
  'community-standard': 'Community Standard (verified can see and type)',
  'staff-readonly': 'Staff Read-Only (staff can see, admin can type)',
  'staff-full': 'Staff Full Access (staff can see and type)',
};
