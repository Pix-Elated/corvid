import { Router, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import type {
  MarkerPayload,
  MarkerSubmitRequest,
  MarkerSubmitResponse,
  ScreenshotSubmitRequest,
} from './markers.types';

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

/** Generate a deterministic marker ID from its properties, or preserve client-provided ID. */
function generateMarkerId(m: MarkerPayload): string {
  if (m.id) return m.id;
  const fingerprint = `${m.category}_${m.floor}_${m.x}_${m.y}`;
  return `c_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 8)}`;
}

/** Build a diff table showing what changed in an edit. */
function buildDiffSection(
  original: { name: string; x: number; y: number; description?: string; region?: string },
  edited: MarkerPayload
): string {
  const fields: { label: string; old: string; new: string }[] = [];
  if (original.name !== edited.name) {
    fields.push({ label: 'Name', old: original.name, new: edited.name });
  }
  if (original.x !== edited.x || original.y !== edited.y) {
    fields.push({
      label: 'Position',
      old: `${original.x}, ${original.y}`,
      new: `${edited.x}, ${edited.y}`,
    });
  }
  if ((original.description || '') !== (edited.description || '')) {
    fields.push({
      label: 'Description',
      old: original.description || '_(empty)_',
      new: edited.description || '_(empty)_',
    });
  }
  if ((original.region || '') !== (edited.region || '')) {
    fields.push({
      label: 'Region',
      old: original.region || '_(empty)_',
      new: edited.region || '_(empty)_',
    });
  }
  if (fields.length === 0) return '_No changes detected._';

  const rows = fields.map((f) => `| ${f.label} | ${f.old} | ${f.new} |`).join('\n');
  return '| Field | Before | After |\n|-------|--------|-------|\n' + rows;
}

/** Build the GitHub issue body (markdown table + JSON block). */
function buildIssueBody(
  markers: MarkerPayload[],
  screenshot: string | undefined,
  authorName: string | undefined,
  originalMarker?: { name: string; x: number; y: number; description?: string; region?: string }
): string {
  const isEdit = markers.length === 1 && markers[0].correction;
  const isDeletion = markers.length === 1 && markers[0].deletion;

  const json = JSON.stringify(
    markers.map((m) => ({
      id: generateMarkerId(m),
      ...(m.correction ? { correction: true } : {}),
      ...(m.deletion ? { deletion: true } : {}),
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

  // Deletion requests get a simple body
  if (isDeletion) {
    return [
      '## RavenHUD Map Marker Deletion Request\n',
      `**Marker**: ${markers[0].name} (\`${generateMarkerId(markers[0])}\`)`,
      `**Category**: ${markers[0].category}`,
      `**Position**: ${markers[0].x}, ${markers[0].y} (${markers[0].floor})`,
      markers[0].region ? `**Region**: ${markers[0].region}` : '',
      `**Exported**: ${new Date().toISOString().split('T')[0]}`,
      authorName ? `**Requested by**: ${authorName}\n` : '',
      markers[0].description ? `**Reason**: ${markers[0].description}\n` : '',
      screenshotComment,
      '<details><summary>Raw JSON (for automated import)</summary>\n',
      '```json',
      json,
      '```',
      '</details>',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Edit submissions get a diff table instead of the standard marker table
  if (isEdit && originalMarker) {
    const diff = buildDiffSection(originalMarker, markers[0]);
    return [
      '## RavenHUD Map Marker Edit\n',
      `**Marker**: ${originalMarker.name} (\`${generateMarkerId(markers[0])}\`)`,
      `**Exported**: ${new Date().toISOString().split('T')[0]}`,
      authorName ? `**Contributor**: ${authorName}\n` : '',
      '### Changes\n',
      diff,
      '',
      screenshotComment,
      '<details><summary>Raw JSON (for automated import)</summary>\n',
      '```json',
      json,
      '```',
      '</details>',
    ].join('\n');
  }

  const rows = markers
    .map((m) => {
      const desc = m.description || '';
      const author = authorName || 'Anonymous';
      return `| ${m.category} | ${m.name} | ${m.x} | ${m.y} | ${m.floor} | ${desc} | ${author} |`;
    })
    .join('\n');

  return [
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
  ].join('\n');
}

/**
 * POST /api/markers/submit
 * Receives marker data from RavenHUD and creates a GitHub issue.
 */
markersRouter.post('/markers/submit', submitLimiter, async (req: Request, res: Response) => {
  const githubPat = process.env['github-pat'];
  if (!githubPat) {
    console.error('[Markers] github-pat secret not configured');
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

  // Build issue — edits/deletions get different title, label, and body
  const isEdit = body.markers.length === 1 && body.markers[0].correction;
  const isDeletion = body.markers.length === 1 && body.markers[0].deletion;
  const title = isDeletion
    ? `Delete: ${body.markers[0].name}`
    : isEdit
      ? `Edit: ${body.markers[0].name}`
      : body.markers.length === 1
        ? `Map Marker: ${body.markers[0].name}`
        : `Map Markers: ${body.markers.length} contributions`;

  const issueBody = buildIssueBody(
    body.markers,
    body.screenshot,
    body.authorName,
    body.originalMarker
  );
  const labels = ['map-markers'];
  if (isEdit) labels.push('edit');
  if (isDeletion) labels.push('deletion');

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
        labels,
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

/**
 * POST /api/markers/submit-screenshot
 * Submit a screenshot for an existing base marker (no new marker created).
 * Creates a GitHub issue that the ingestion workflow will use to backfill the screenshot.
 */
markersRouter.post(
  '/markers/submit-screenshot',
  submitLimiter,
  async (req: Request, res: Response) => {
    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      console.error('[Markers] GITHUB_PAT not configured');
      res
        .status(503)
        .json({ success: false, error: 'Service not configured' } satisfies MarkerSubmitResponse);
      return;
    }

    const body = req.body as ScreenshotSubmitRequest;

    if (!body.markerId || !body.screenshot || !body.markerName || !body.category || !body.floor) {
      res.status(400).json({
        success: false,
        error: 'markerId, markerName, category, floor, and screenshot are required',
      } satisfies MarkerSubmitResponse);
      return;
    }

    if (body.screenshot.length > MAX_SCREENSHOT_BYTES) {
      res.status(400).json({
        success: false,
        error: 'Screenshot too large (max ~1MB)',
      } satisfies MarkerSubmitResponse);
      return;
    }

    // Build an issue that looks like a normal marker submission so the ingestion
    // workflow can process it with its existing backfill logic.
    const json = JSON.stringify(
      [
        {
          id: body.markerId,
          category: body.category,
          name: body.markerName,
          x: body.x,
          y: body.y,
          floor: body.floor,
          authorName: body.authorName || undefined,
        },
      ],
      null,
      2
    );

    const screenshotComment = `\n<!-- RHUD_SCREENSHOT:${body.screenshot} -->\n`;
    const contributor = body.authorName || 'Anonymous';

    const issueBody = [
      '## Screenshot for Existing Marker\n',
      `**Marker**: ${body.markerName}`,
      `**ID**: \`${body.markerId}\``,
      `**Location**: ${body.x}, ${body.y} (${body.floor})`,
      `**Contributor**: ${contributor}\n`,
      screenshotComment,
      '<details><summary>Raw JSON (for automated import)</summary>\n',
      '```json',
      json,
      '```',
      '</details>',
    ].join('\n');

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
          title: `Screenshot: ${body.markerName}`,
          body: issueBody,
          labels: ['map-markers', 'screenshot-only'],
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
      console.log(
        `[Markers] Created screenshot issue #${issue.number} for marker ${body.markerId}`
      );

      res.status(201).json({
        success: true,
        issueUrl: issue.html_url as string,
        issueNumber: issue.number as number,
      } satisfies MarkerSubmitResponse);
    } catch (err) {
      console.error('[Markers] Failed to submit screenshot:', err);
      res
        .status(500)
        .json({ success: false, error: 'Internal server error' } satisfies MarkerSubmitResponse);
    }
  }
);
