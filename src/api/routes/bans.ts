import { Router, Request, Response } from 'express';

export const bansRouter = Router();

/**
 * POST /api/bans/report
 * Receives ban trigger reports from the website worldmap.
 * Logs the banned user's info + request IP for tracking.
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

  res.json({ success: true });
});
