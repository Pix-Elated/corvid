import { Router, Request, Response } from 'express';
import {
  Client,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { banListEvents, checkIpBan, getCachedBanList } from '../../hall-of-shame/ban-list-cache';
import { recordIpIdentity } from '../../ip-identity';
import { recordSubmission } from '../../submissions';

export const bansRouter = Router();

let discordClient: Client | null = null;
const MOD_LOG_CHANNEL = 'moderation-log';
const RAVENHUD_LOG_CHANNEL = 'ravenhud-logs';

/** Open SSE responses. Tracked so shutdown can drain them cleanly. */
const sseClients = new Set<Response>();
const SSE_KEEPALIVE_MS = 25_000;

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
    fingerprint?: string;
    discordId?: string;
  };

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ipStr = String(ip);
  const userAgent = String(req.headers['user-agent'] || '');

  // Track IP-to-identity mapping and detect duplicates
  const otherNames = recordIpIdentity(ipStr, body.characterName || '', body.guildTag || '');

  // Log the submission for identity-graph / cluster analysis (UEBA Phase 1)
  recordSubmission({
    ts: new Date().toISOString(),
    fingerprint: body.fingerprint || '',
    ip: ipStr,
    discordId: body.discordId,
    characterName: body.characterName,
    guildTag: body.guildTag,
    ua: userAgent,
    kind: 'identity_log',
    wasBlocked: false,
  });

  // Only log to Discord for NEW identities (first visit / name change), not every page load
  if (body.isNewIdentity) {
    console.log('[Bans] New identity:', {
      ip: ipStr,
      characterName: body.characterName,
      guildTag: body.guildTag,
    });
    void sendIdentityLog(body, ipStr, otherNames);
  } else if (otherNames.length > 0) {
    // Not a new identity prompt, but IP has other names — still alert
    void sendIdentityLog(body, ipStr, otherNames);
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
 * GET /api/bans/list
 * Returns the current ban list from Corvid's in-memory cache.
 * Clients (worldmap browser, RavenHUD app) call this once on load and
 * re-call when notified via /bans/stream SSE.
 */
bansRouter.get('/bans/list', (_req: Request, res: Response) => {
  void getCachedBanList()
    .then((banList) => {
      res.json(banList);
    })
    .catch((err) => {
      console.error('[Bans] Failed to load ban list:', err);
      // Fail-closed: empty list rather than 500, matches ban-list-cache semantics.
      res.json({ version: 2, entries: [] });
    });
});

/**
 * GET /api/bans/stream
 * Server-Sent Events stream that pushes 'ban-list-changed' events whenever
 * the ban list is invalidated. Clients re-fetch /bans/list on each event.
 * Sends a keepalive comment every 25s so the Azure Container Apps edge
 * doesn't close the idle connection.
 */
bansRouter.get('/bans/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Initial handshake so the client knows the stream is live.
  res.write('event: ready\ndata: {}\n\n');

  const onChanged = (): void => {
    res.write(`event: ban-list-changed\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);
  };

  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, SSE_KEEPALIVE_MS);

  banListEvents.on('changed', onChanged);
  sseClients.add(res);

  const cleanup = (): void => {
    clearInterval(keepalive);
    banListEvents.off('changed', onChanged);
    sseClients.delete(res);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

/**
 * Close all open SSE connections. Called during graceful shutdown
 * so in-flight long-lived connections terminate cleanly.
 */
export function closeSseConnections(): void {
  for (const res of sseClients) {
    try {
      res.end();
    } catch {
      // ignore — client already gone
    }
  }
  sseClients.clear();
}

/**
 * POST /api/bans/ip-check
 * Checks the requester's IP against the ban list.
 * Used by the RavenHUD Electron app (main process).
 * No Discord logging — purely a ban status check.
 *
 * Body is optional. If provided, the submission is also logged to the
 * identity graph for /cluster analysis. Fields mirror /bans/identity-log:
 * fingerprint, characterName, guildTag, discordId.
 */
bansRouter.post('/bans/ip-check', (req: Request, res: Response) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ipStr = String(ip);
  const userAgent = String(req.headers['user-agent'] || '');

  const body = (req.body || {}) as {
    fingerprint?: string;
    characterName?: string;
    guildTag?: string;
    discordId?: string;
  };

  // Log submission for UEBA clustering. RQC sends character/guild/discord
  // from the saved player profile, so we can link Electron-app visits to
  // the same graph as worldmap visits.
  if (body.fingerprint || body.characterName || body.discordId) {
    recordSubmission({
      ts: new Date().toISOString(),
      fingerprint: body.fingerprint || '',
      ip: ipStr,
      discordId: body.discordId,
      characterName: body.characterName,
      guildTag: body.guildTag,
      ua: userAgent,
      kind: 'ban_check',
      wasBlocked: false,
    });
  }

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
  ip: string,
  otherNames: string[] = []
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

    const isDuplicate = otherNames.length > 0;
    const embed = new EmbedBuilder()
      .setTitle(isDuplicate ? '\u26A0\uFE0F Duplicate IP Detected' : 'Worldmap Identity')
      .setColor(isDuplicate ? 0xe67e22 : 0x3498db)
      .addFields(
        { name: 'Character', value: body.characterName || 'N/A', inline: true },
        { name: 'Guild', value: body.guildTag || 'none', inline: true },
        { name: 'IP', value: `\`${ip}\``, inline: true }
      );

    if (isDuplicate) {
      embed.addFields({
        name: 'Other names on this IP',
        value: otherNames.map((n) => `\u2022 ${n}`).join('\n'),
        inline: false,
      });
    }

    embed.setTimestamp(body.timestamp ? new Date(body.timestamp) : new Date());

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
