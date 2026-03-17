import { Router, Request, Response } from 'express';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';

export const bansRouter = Router();

let discordClient: Client | null = null;
const MOD_LOG_CHANNEL = 'moderation-log';

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

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

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
