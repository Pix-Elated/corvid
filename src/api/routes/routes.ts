import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { RouteSubmitRequest, RouteSubmitResponse } from './routes.types';

const GITHUB_API = 'https://api.github.com';
const PUBLIC_REPO = 'Pix-Elated/ravenhud';

export const routesRouter = Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions, please try again later.' },
});

/** Escape user-supplied strings for safe markdown embedding. */
function sanitizeMd(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, ' ')
    .trim();
}

/** Build the GitHub issue body for a route submission. */
function buildIssueBody(req: RouteSubmitRequest): string {
  const safeAuthor = sanitizeMd(req.authorName || 'Anonymous');
  const routeName = sanitizeMd(req.route.name);
  const desc = req.route.description ? sanitizeMd(req.route.description) : '';

  const rows = req.route.segments
    .map((s, i) => {
      const from = sanitizeMd(s.fromMarkerName);
      const to = sanitizeMd(s.toMarkerName);
      const floor = sanitizeMd(s.floor);
      return `| ${i + 1} | ${from} | ${to} | ${floor} | ${s.waypointCount} |`;
    })
    .join('\n');

  const json = JSON.stringify(
    {
      route: req.route,
      rawData: req.rawData,
      authorName: req.authorName || undefined,
    },
    null,
    2
  );

  const parts = [
    '## RavenHUD Map Route Contribution\n',
    `**Route**: ${routeName}`,
    desc ? `**Description**: ${desc}` : '',
    `**Floors**: ${req.route.floors.join(', ')}`,
    `**Markers**: ${req.route.markerNames.join(' → ')}`,
    `**Exported**: ${new Date().toISOString().split('T')[0]}`,
    `**Contributor**: ${safeAuthor}\n`,
    '| # | From | To | Floor | Waypoints |',
    '|---|------|-----|-------|-----------|',
    rows,
    '',
    '<details><summary>Raw JSON (for automated import)</summary>\n',
    '```json',
    json,
    '```',
    '</details>',
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * POST /api/routes/submit
 * Receives route data from RavenHUD and creates a GitHub issue.
 */
routesRouter.post('/routes/submit', submitLimiter, async (req: Request, res: Response) => {
  const githubPat = process.env['github-pat'];
  if (!githubPat) {
    console.error('[Routes] github-pat secret not configured');
    res
      .status(503)
      .json({ success: false, error: 'Service not configured' } satisfies RouteSubmitResponse);
    return;
  }

  const body = req.body as RouteSubmitRequest;

  if (!body.route || typeof body.route !== 'object') {
    res
      .status(400)
      .json({ success: false, error: 'route object is required' } satisfies RouteSubmitResponse);
    return;
  }
  if (!body.route.name || typeof body.route.name !== 'string') {
    res.status(400).json({
      success: false,
      error: "missing or invalid 'name'",
    } satisfies RouteSubmitResponse);
    return;
  }
  if (!Array.isArray(body.route.segments) || body.route.segments.length === 0) {
    res.status(400).json({
      success: false,
      error: 'segments array is required and must not be empty',
    } satisfies RouteSubmitResponse);
    return;
  }
  if (!Array.isArray(body.route.floors) || body.route.floors.length === 0) {
    res.status(400).json({
      success: false,
      error: 'floors array is required and must not be empty',
    } satisfies RouteSubmitResponse);
    return;
  }

  const title = `Map Route: ${body.route.name}`;
  const issueBody = buildIssueBody(body);

  try {
    const ghRes = await fetch(`${GITHUB_API}/repos/${PUBLIC_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title,
        body: issueBody,
        labels: ['map-routes'],
      }),
    });

    if (!ghRes.ok) {
      const errData = (await ghRes.json()) as Record<string, unknown>;
      console.error('[Routes] GitHub API error:', ghRes.status, errData.message);
      res.status(502).json({
        success: false,
        error: 'Failed to create issue on GitHub',
      } satisfies RouteSubmitResponse);
      return;
    }

    const issue = (await ghRes.json()) as Record<string, unknown>;
    console.log(`[Routes] Created issue #${issue.number} for route "${body.route.name}"`);

    res.status(201).json({
      success: true,
      issueUrl: issue.html_url as string,
      issueNumber: issue.number as number,
    } satisfies RouteSubmitResponse);
  } catch (err) {
    console.error('[Routes] Failed to submit:', err);
    res
      .status(500)
      .json({ success: false, error: 'Internal server error' } satisfies RouteSubmitResponse);
  }
});
