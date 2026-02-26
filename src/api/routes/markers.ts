import { Router, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import type { MarkerPayload, MarkerSubmitRequest, MarkerSubmitResponse } from './markers.types';

const GITHUB_API = 'https://api.github.com';
const PUBLIC_REPO = 'Pix-Elated/ravenhud';
const MAX_MARKERS = 50;
const MAX_SCREENSHOT_BYTES = 1_500_000; // ~1.5MB base64

export const markersRouter = Router();

// Stricter rate limit for submissions: 10 per 15 minutes per IP
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions, please try again later.' },
});

/** Validate a single marker has required fields with correct types. */
function validateMarker(m: unknown, index: number): string | null {
  if (typeof m !== 'object' || m === null) {
    return `markers[${index}]: not an object`;
  }
  const marker = m as Record<string, unknown>;
  if (typeof marker.category !== 'string' || !marker.category) {
    return `markers[${index}]: missing or invalid 'category'`;
  }
  if (typeof marker.name !== 'string' || !marker.name) {
    return `markers[${index}]: missing or invalid 'name'`;
  }
  if (typeof marker.x !== 'number' || !Number.isFinite(marker.x)) {
    return `markers[${index}]: missing or invalid 'x'`;
  }
  if (typeof marker.y !== 'number' || !Number.isFinite(marker.y)) {
    return `markers[${index}]: missing or invalid 'y'`;
  }
  if (typeof marker.floor !== 'string' || !marker.floor) {
    return `markers[${index}]: missing or invalid 'floor'`;
  }
  return null;
}

/** Generate a deterministic marker ID from its properties. */
function generateMarkerId(m: MarkerPayload): string {
  const fingerprint = `${m.category}_${m.floor}_${m.x}_${m.y}`;
  return `c_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 8)}`;
}

/** Build the GitHub issue body (markdown table + JSON block). */
function buildIssueBody(
  markers: MarkerPayload[],
  screenshot: string | undefined,
  authorName: string | undefined
): string {
  const rows = markers
    .map((m) => {
      const desc = m.description || '';
      const author = authorName || 'Anonymous';
      return `| ${m.category} | ${m.name} | ${m.x} | ${m.y} | ${m.floor} | ${desc} | ${author} |`;
    })
    .join('\n');

  const json = JSON.stringify(
    markers.map((m) => ({
      id: generateMarkerId(m),
      category: m.category,
      name: m.name,
      x: m.x,
      y: m.y,
      floor: m.floor,
      region: m.region || '',
      description: m.description || '',
      authorName: authorName || undefined,
    })),
    null,
    2
  );

  const screenshotComment = screenshot ? `\n<!-- RHUD_SCREENSHOT:${screenshot} -->\n` : '';

  const parts = [
    '## RavenHUD Map Marker Contribution\n',
    `**Exported**: ${new Date().toISOString().split('T')[0]}`,
    authorName ? `**Contributor**: ${authorName}\n` : '',
    '| Category | Name | X | Y | Floor | Description | Author |',
    '|----------|------|---|---|-------|-------------|--------|',
    rows,
    '',
    screenshotComment,
    '<details><summary>Raw JSON (for automated import)</summary>\n',
    '```json',
    json,
    '```',
    '</details>',
  ];

  return parts.join('\n');
}

/**
 * POST /api/markers/submit
 * Receives marker data from RavenHUD and creates a GitHub issue.
 */
markersRouter.post('/markers/submit', submitLimiter, async (req: Request, res: Response) => {
  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    console.error('[Markers] GITHUB_PAT not configured');
    res
      .status(503)
      .json({ success: false, error: 'Service not configured' } satisfies MarkerSubmitResponse);
    return;
  }

  const body = req.body as MarkerSubmitRequest;

  // Validate markers array
  if (!body.markers || !Array.isArray(body.markers) || body.markers.length === 0) {
    res.status(400).json({
      success: false,
      error: 'markers array is required and must not be empty',
    } satisfies MarkerSubmitResponse);
    return;
  }
  if (body.markers.length > MAX_MARKERS) {
    res.status(400).json({
      success: false,
      error: `Maximum ${MAX_MARKERS} markers per submission`,
    } satisfies MarkerSubmitResponse);
    return;
  }

  // Validate each marker
  for (let i = 0; i < body.markers.length; i++) {
    const err = validateMarker(body.markers[i], i);
    if (err) {
      res.status(400).json({ success: false, error: err } satisfies MarkerSubmitResponse);
      return;
    }
  }

  // Validate screenshot size
  if (body.screenshot && body.screenshot.length > MAX_SCREENSHOT_BYTES) {
    res.status(400).json({
      success: false,
      error: 'Screenshot too large (max ~1MB)',
    } satisfies MarkerSubmitResponse);
    return;
  }

  // Build issue
  const title =
    body.markers.length === 1
      ? `Map Marker: ${body.markers[0].name}`
      : `Map Markers: ${body.markers.length} contributions`;

  const issueBody = buildIssueBody(body.markers, body.screenshot, body.authorName);

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
        labels: ['map-markers'],
      }),
    });

    if (!ghRes.ok) {
      const errData = (await ghRes.json()) as Record<string, unknown>;
      console.error('[Markers] GitHub API error:', ghRes.status, errData.message);
      res.status(502).json({
        success: false,
        error: 'Failed to create issue on GitHub',
      } satisfies MarkerSubmitResponse);
      return;
    }

    const issue = (await ghRes.json()) as Record<string, unknown>;
    console.log(`[Markers] Created issue #${issue.number} for ${body.markers.length} marker(s)`);

    res.status(201).json({
      success: true,
      issueUrl: issue.html_url as string,
      issueNumber: issue.number as number,
    } satisfies MarkerSubmitResponse);
  } catch (err) {
    console.error('[Markers] Failed to submit:', err);
    res
      .status(500)
      .json({ success: false, error: 'Internal server error' } satisfies MarkerSubmitResponse);
  }
});
