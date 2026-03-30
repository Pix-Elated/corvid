import { Router, Request, Response } from 'express';
import {
  Client,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { checkIpBan } from '../../hall-of-shame/ban-list-cache';

export const bansRouter = Router();

let discordClient: Client | null = null;
const MOD_LOG_CHANNEL = 'moderation-log';
const RAVENHUD_LOG_CHANNEL = 'ravenhud-logs';

/** Set the Discord client so ban reports can post to the mod log */
export function setBansDiscordClient(client: Client): void {
  discordClient = client;
}

/**
 * POST /api/bans/report
 * Receives ban trigger reports from the website worldmap.
 * Logs the banned user's info + request IP, sends to Discord mod log.
 */
bansRouter.post('/bans/report', (req: Request, res: Response) => {
  const body = req.body as {
    matchedName?: string;
    matchType?: string;
    reason?: string;
    discordId?: string;
    discordUsername?: string;
    identity?: { characterName?: string; guildTag?: string };
    timestamp?: string;
  };

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  console.log('[Bans] Ban triggered:', {
    ip,
    matchedName: body.matchedName,
    matchType: body.matchType,
    reason: body.reason,
    discordId: body.discordId,
    discordUsername: body.discordUsername,
    characterName: body.identity?.characterName,
    guildTag: body.identity?.guildTag,
    timestamp: body.timestamp,
  });

  // Send to Discord mod log
  void sendBanReport(body, String(ip));

  res.json({ success: true });
});

/**
 * POST /api/bans/identity-log
 * Logs every identity submission from the website worldmap.
 * Posts to #ravenhud-logs channel for moderation review.
 * Also checks requester IP against ban list and returns ban status.
 */
bansRouter.post('/bans/identity-log', (req: Request, res: Response) => {
  const body = req.body as {
    characterName?: string;
    guildTag?: string;
    timestamp?: string;
    isNewIdentity?: boolean;
  };

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ipStr = String(ip);

  // Only log to Discord for NEW identities (first visit / name change), not every page load
  if (body.isNewIdentity) {
    console.log('[Bans] New identity:', {
      ip: ipStr,
      characterName: body.characterName,
      guildTag: body.guildTag,
    });
    void sendIdentityLog(body, ipStr);
  }

  // Check if this IP is banned and return result
  void checkIpBan(ipStr)
    .then((ipBan) => {
      if (ipBan) {
        res.json({ success: true, banned: true, reason: ipBan.reason, matchedName: ipBan.name });
      } else {
        res.json({ success: true, banned: false });
      }
    })
    .catch(() => {
      // Fail-open: if ban check fails, let them through
      res.json({ success: true, banned: false });
    });
});

/**
 * POST /api/bans/ip-check
 * Checks the requester's IP against the ban list.
 * Used by the RavenHUD Electron app (main process).
 * No Discord logging — purely a ban status check.
 */
bansRouter.post('/bans/ip-check', (req: Request, res: Response) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ipStr = String(ip);

  void checkIpBan(ipStr)
    .then((ipBan) => {
      if (ipBan) {
        res.json({ banned: true, reason: ipBan.reason, matchedName: ipBan.name });
      } else {
        res.json({ banned: false });
      }
    })
    .catch(() => {
      res.json({ banned: false });
    });
});

async function sendIdentityLog(
  body: { characterName?: string; guildTag?: string; timestamp?: string },
  ip: string
): Promise<void> {
  if (!discordClient) return;

  try {
    const guild = discordClient.guilds.cache.first();
    if (!guild) return;

    // Use or create #ravenhud-logs channel
    let channel = guild.channels.cache.find(
      (ch) => ch.name === RAVENHUD_LOG_CHANNEL && ch instanceof TextChannel
    ) as TextChannel | undefined;

    if (!channel) {
      // Find moderation category to create channel under
      const modCategory = guild.channels.cache.find(
        (ch) => ch.name.toLowerCase().includes('moderation') && ch.type === 4
      );

      const created = await guild.channels.create({
        name: RAVENHUD_LOG_CHANNEL,
        type: 0, // GuildText
        parent: modCategory?.id,
        topic: 'Worldmap identity submissions and ban triggers — automated by Corvid',
      });
      channel = created as TextChannel;
    }

    const embed = new EmbedBuilder()
      .setTitle('Worldmap Identity')
      .setColor(0x3498db)
      .addFields(
        { name: 'Character', value: body.characterName || 'N/A', inline: true },
        { name: 'Guild', value: body.guildTag || 'none', inline: true },
        { name: 'IP', value: `\`${ip}\``, inline: true }
      )
      .setTimestamp(body.timestamp ? new Date(body.timestamp) : new Date());

    const banUserBtn = new ButtonBuilder()
      .setCustomId(`ban_user_${Date.now()}`)
      .setLabel('Ban User')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('👤');

    const banGuildBtn = new ButtonBuilder()
      .setCustomId(`ban_guild_${Date.now() + 1}`)
      .setLabel('Ban Guild')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🏰');

    const banIpBtn = new ButtonBuilder()
      .setCustomId(`ban_ip_${Date.now() + 2}`)
      .setLabel('Ban IP')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔨');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      banUserBtn,
      banGuildBtn,
      banIpBtn
    );

    await channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[Bans] Failed to send identity log:', err);
  }
}

async function sendBanReport(
  body: {
    matchedName?: string;
    matchType?: string;
    reason?: string;
    discordId?: string;
    discordUsername?: string;
    identity?: { characterName?: string; guildTag?: string };
    timestamp?: string;
  },
  ip: string
): Promise<void> {
  if (!discordClient) return;

  try {
    const guild = discordClient.guilds.cache.first();
    if (!guild) return;

    const channel = guild.channels.cache.find(
      (ch) => ch.name === MOD_LOG_CHANNEL && ch instanceof TextChannel
    ) as TextChannel | undefined;
    if (!channel) return;

    const fields = [
      {
        name: 'Matched',
        value: `\`${body.matchedName || 'unknown'}\` (${body.matchType || '?'})`,
        inline: true,
      },
      { name: 'Reason', value: body.reason || 'N/A', inline: true },
      { name: 'IP', value: `\`${ip}\``, inline: true },
    ];

    if (body.identity?.characterName) {
      fields.push({ name: 'Character', value: body.identity.characterName, inline: true });
    }
    if (body.identity?.guildTag) {
      fields.push({ name: 'Guild Tag', value: body.identity.guildTag, inline: true });
    }
    if (body.discordId) {
      fields.push({
        name: 'Discord',
        value: `${body.discordUsername || '?'} (<@${body.discordId}>)`,
        inline: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('Worldmap Ban Triggered')
      .setColor(0x992d22)
      .addFields(fields)
      .setTimestamp(body.timestamp ? new Date(body.timestamp) : new Date());

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Bans] Failed to send Discord report:', err);
  }
}
