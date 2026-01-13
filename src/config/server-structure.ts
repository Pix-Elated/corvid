import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { ServerStructure } from '../types';

// Default server structure following best practices for app support communities
export const defaultServerStructure: ServerStructure = {
  roles: [
    {
      name: 'Admin',
      color: 0xe74c3c, // Red
      hoist: true,
      mentionable: false,
      permissions:
        PermissionFlagsBits.ManageGuild |
        PermissionFlagsBits.ManageRoles |
        PermissionFlagsBits.ManageChannels |
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ManageMessages |
        PermissionFlagsBits.KickMembers |
        PermissionFlagsBits.BanMembers |
        PermissionFlagsBits.ViewAuditLog |
        PermissionFlagsBits.MentionEveryone,
    },
    {
      name: 'Moderator',
      color: 0x3498db, // Blue
      hoist: true,
      mentionable: false,
      permissions:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ManageMessages |
        PermissionFlagsBits.KickMembers |
        PermissionFlagsBits.MuteMembers |
        PermissionFlagsBits.ViewAuditLog,
    },
    {
      name: 'Support Team',
      color: 0x2ecc71, // Green
      hoist: true,
      mentionable: true,
      permissions:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory,
    },
    {
      name: 'Verified',
      color: 0x9b59b6, // Purple
      hoist: false,
      mentionable: false,
      permissions:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.AddReactions |
        PermissionFlagsBits.AttachFiles |
        PermissionFlagsBits.EmbedLinks,
    },
    {
      name: 'Unverified',
      color: 0x95a5a6, // Gray
      hoist: false,
      mentionable: false,
      permissions: PermissionFlagsBits.ReadMessageHistory,
    },
  ],

  categories: [
    {
      name: 'INFORMATION',
      permissionOverwrites: [
        {
          role: '@everyone',
          deny: ['SendMessages'],
          allow: ['ViewChannel', 'ReadMessageHistory'],
        },
      ],
      channels: [
        {
          name: 'welcome',
          type: ChannelType.GuildText,
          topic: 'Welcome to the server! Read this channel for a guide on how to get started.',
        },
        {
          name: 'rules',
          type: ChannelType.GuildText,
          topic: 'Server rules - please read and follow these guidelines.',
        },
        {
          name: 'announcements',
          type: ChannelType.GuildAnnouncement,
          topic: 'Official announcements from the team.',
        },
        {
          name: 'roadmap',
          type: ChannelType.GuildText,
          topic: 'App updates and planned features.',
        },
      ],
    },
    {
      name: 'SUPPORT',
      permissionOverwrites: [
        {
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Unverified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Verified',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          role: 'Support Team',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
        },
        {
          role: 'Moderator',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
        },
        {
          role: 'Admin',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
        },
      ],
      channels: [
        {
          name: 'faq',
          type: ChannelType.GuildText,
          topic: 'Frequently asked questions.',
          permissionOverwrites: [
            {
              role: 'Verified',
              deny: ['SendMessages'],
              allow: ['ViewChannel', 'ReadMessageHistory'],
            },
          ],
        },
        {
          name: 'support-general',
          type: ChannelType.GuildText,
          topic: 'General support questions and discussions.',
        },
        {
          name: 'bug-reports',
          type: ChannelType.GuildText,
          topic: 'Report bugs here with detailed reproduction steps.',
        },
        {
          name: 'feature-requests',
          type: ChannelType.GuildText,
          topic: 'Suggest new features for the app.',
        },
      ],
    },
    {
      name: 'COMMUNITY',
      permissionOverwrites: [
        {
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Unverified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Verified',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          role: 'Support Team',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          role: 'Moderator',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
        },
        {
          role: 'Admin',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
        },
      ],
      channels: [
        {
          name: 'general',
          type: ChannelType.GuildText,
          topic: 'Main community chat.',
        },
        {
          name: 'off-topic',
          type: ChannelType.GuildText,
          topic: 'Off-topic discussions.',
        },
        {
          name: 'screenshots',
          type: ChannelType.GuildText,
          topic: 'Share your screenshots and media.',
        },
      ],
    },
    {
      name: 'STAFF ONLY',
      permissionOverwrites: [
        {
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Unverified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Verified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Support Team',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          role: 'Moderator',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
        },
        {
          role: 'Admin',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
        },
      ],
      channels: [
        {
          name: 'staff-chat',
          type: ChannelType.GuildText,
          topic: 'Private staff discussions.',
        },
        {
          name: 'moderation-log',
          type: ChannelType.GuildText,
          topic: 'Moderation actions and logs.',
        },
        {
          name: 'support-tickets',
          type: ChannelType.GuildText,
          topic: 'Support ticket management.',
        },
      ],
    },
    {
      name: 'BOT',
      permissionOverwrites: [
        {
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Unverified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Verified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Support Team',
          deny: ['ViewChannel'],
        },
        {
          role: 'Moderator',
          deny: ['ViewChannel'],
        },
        {
          role: 'Admin',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
      ],
      channels: [
        {
          name: 'bot-logs',
          type: ChannelType.GuildText,
          topic: 'Bot status and error logs.',
        },
        {
          name: 'server-status',
          type: ChannelType.GuildText,
          topic: 'Munk server status messages are mirrored here.',
        },
      ],
    },
  ],
};
