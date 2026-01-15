import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { ServerStructure } from '../types';

// Bulletproof server structure with security best practices
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
        PermissionFlagsBits.ModerateMembers |
        PermissionFlagsBits.ViewAuditLog |
        PermissionFlagsBits.MentionEveryone |
        PermissionFlagsBits.ManageNicknames |
        PermissionFlagsBits.ManageWebhooks |
        PermissionFlagsBits.MoveMembers |
        PermissionFlagsBits.MuteMembers |
        PermissionFlagsBits.DeafenMembers,
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
        PermissionFlagsBits.ModerateMembers | // Timeouts
        PermissionFlagsBits.MuteMembers |
        PermissionFlagsBits.MoveMembers |
        PermissionFlagsBits.ViewAuditLog |
        PermissionFlagsBits.ManageNicknames,
    },
    {
      name: 'Support Team',
      color: 0x2ecc71, // Green
      hoist: true,
      mentionable: false, // Prevent ping abuse
      permissions:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.ManageMessages,
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
        PermissionFlagsBits.EmbedLinks |
        PermissionFlagsBits.Connect |
        PermissionFlagsBits.Speak |
        PermissionFlagsBits.UseVAD,
    },
    {
      name: 'Orthodox Warriors',
      color: 0xf1c40f, // Gold
      hoist: true,
      mentionable: true,
      permissions:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.AddReactions |
        PermissionFlagsBits.AttachFiles |
        PermissionFlagsBits.EmbedLinks |
        PermissionFlagsBits.Connect |
        PermissionFlagsBits.Speak |
        PermissionFlagsBits.UseVAD,
    },
    {
      name: 'Muted',
      color: 0x2c3e50, // Dark gray
      hoist: false,
      mentionable: false,
      permissions: PermissionFlagsBits.ReadMessageHistory,
    },
    {
      name: 'Quarantine',
      color: 0xe67e22, // Orange
      hoist: false,
      mentionable: false,
      permissions: 0n, // No permissions at all
    },
  ],

  categories: [
    {
      name: 'VERIFICATION',
      permissionOverwrites: [
        {
          // @everyone CAN see this category - it's the landing zone
          role: '@everyone',
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads'],
        },
        {
          // Hide from verified users - they don't need it anymore
          role: 'Verified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Quarantine',
          deny: ['ViewChannel'],
        },
      ],
      channels: [
        {
          name: 'verify-here',
          type: ChannelType.GuildText,
          topic: 'Click the button below to verify and gain access to the server.',
        },
      ],
    },
    {
      name: 'INFORMATION',
      permissionOverwrites: [
        {
          // @everyone CAN see this category (read-only) - lets new users see rules before verifying
          role: '@everyone',
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads'],
        },
        {
          role: 'Quarantine',
          deny: ['ViewChannel'],
        },
        {
          role: 'Muted',
          deny: ['SendMessages', 'AddReactions'],
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
          type: ChannelType.GuildText,
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
          // @everyone cannot see - must be verified
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Quarantine',
          deny: ['ViewChannel'],
        },
        {
          role: 'Muted',
          deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads'],
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
        {
          name: 'create-ticket',
          type: ChannelType.GuildText,
          topic: 'Click a button below to open a support ticket.',
          permissionOverwrites: [
            {
              role: 'Verified',
              allow: ['ViewChannel', 'ReadMessageHistory'],
              deny: ['SendMessages'], // Can only use buttons, not chat
            },
          ],
        },
      ],
    },
    {
      name: 'COMMUNITY',
      permissionOverwrites: [
        {
          // @everyone cannot see - must be verified
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Quarantine',
          deny: ['ViewChannel'],
        },
        {
          role: 'Muted',
          deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads'],
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
      name: 'ORTHODOX WARRIORS',
      permissionOverwrites: [
        {
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Quarantine',
          deny: ['ViewChannel'],
        },
        {
          role: 'Muted',
          deny: ['SendMessages', 'AddReactions', 'Connect', 'Speak'],
        },
        {
          role: 'Orthodox Warriors',
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'],
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
          name: 'guild-chat',
          type: ChannelType.GuildText,
          topic: 'Orthodox Warriors guild discussion.',
        },
        {
          name: 'guild-announcements',
          type: ChannelType.GuildText,
          topic: 'Guild announcements and important updates.',
        },
        {
          name: 'Guild Voice',
          type: ChannelType.GuildVoice,
          permissionOverwrites: [
            {
              role: 'Orthodox Warriors',
              allow: ['ViewChannel', 'Connect', 'Speak'],
            },
          ],
        },
      ],
    },
    {
      name: 'VOICE',
      permissionOverwrites: [
        {
          // @everyone cannot see or connect - must be verified
          role: '@everyone',
          deny: ['ViewChannel', 'Connect'],
        },
        {
          role: 'Quarantine',
          deny: ['ViewChannel', 'Connect'],
        },
        {
          role: 'Muted',
          deny: ['Connect', 'Speak'],
        },
        {
          role: 'Verified',
          allow: ['ViewChannel', 'Connect', 'Speak'],
        },
        {
          role: 'Orthodox Warriors',
          allow: ['ViewChannel', 'Connect', 'Speak'],
        },
        {
          role: 'Moderator',
          allow: ['ViewChannel', 'Connect', 'Speak', 'MuteMembers', 'MoveMembers'],
        },
        {
          role: 'Admin',
          allow: ['ViewChannel', 'Connect', 'Speak', 'MuteMembers', 'MoveMembers', 'DeafenMembers'],
        },
      ],
      channels: [
        {
          name: 'General Voice',
          type: ChannelType.GuildVoice,
        },
        {
          name: 'AFK',
          type: ChannelType.GuildVoice,
        },
      ],
    },
    {
      name: 'STAFF ONLY',
      permissionOverwrites: [
        {
          // @everyone cannot see - staff only
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Verified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Quarantine',
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
          topic: 'Moderation actions and audit logs.',
        },
        {
          name: 'ticket-logs',
          type: ChannelType.GuildText,
          topic: 'Ticket transcripts and support history.',
        },
      ],
    },
    {
      name: 'BOT',
      permissionOverwrites: [
        {
          // @everyone cannot see - admin/mod only
          role: '@everyone',
          deny: ['ViewChannel'],
        },
        {
          role: 'Verified',
          deny: ['ViewChannel'],
        },
        {
          role: 'Quarantine',
          deny: ['ViewChannel'],
        },
        {
          role: 'Support Team',
          deny: ['ViewChannel'],
        },
        {
          role: 'Moderator',
          allow: ['ViewChannel', 'ReadMessageHistory'], // Mods can see bot logs
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
          topic: 'Server status messages.',
        },
      ],
    },
  ],
};
