/**
 * Shared GitHub API helpers for hall-of-shame ban list management.
 *
 * Used by ban-button.ts (modal-based bans) and worldmap-ban.ts (slash commands).
 */

import { invalidateBanListCache } from './ban-list-cache';

const GITHUB_API = 'https://api.github.com';
const REPO = 'Pix-Elated/ravenhud';
const BAN_FILE_PATH = 'data/hall-of-shame.json';

export interface BanEntry {
  type: 'character' | 'guild' | 'discord' | 'ip';
  name: string;
  reason: string;
  added: string;
}

export interface BanList {
  version: number;
  entries: BanEntry[];
}

interface GitHubFileData {
  banList: BanList;
  sha: string;
}

function getGitHubPat(): string | undefined {
  return process.env['github-pat'];
}

/**
 * Fetch the current ban list from GitHub (with SHA for commits).
 */
export async function fetchBanListFromGitHub(): Promise<GitHubFileData> {
  const githubPat = getGitHubPat();
  if (!githubPat) {
    throw new Error('github-pat secret not configured');
  }

  const res = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${BAN_FILE_PATH}`, {
    headers: {
      Authorization: `Bearer ${githubPat}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ban list: HTTP ${res.status}`);
  }

  const fileData = (await res.json()) as { content: string; sha: string };
  const banList: BanList = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));

  return { banList, sha: fileData.sha };
}

/**
 * Commit an updated ban list to GitHub.
 * Invalidates the local cache after a successful commit.
 */
export async function commitBanList(
  banList: BanList,
  sha: string,
  commitMessage: string
): Promise<void> {
  const githubPat = getGitHubPat();
  if (!githubPat) {
    throw new Error('github-pat secret not configured');
  }

  const updatedContent = Buffer.from(JSON.stringify(banList, null, 2) + '\n').toString('base64');

  const res = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${BAN_FILE_PATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${githubPat}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: updatedContent,
      sha,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to commit: HTTP ${res.status} — ${err}`);
  }

  invalidateBanListCache();
}
