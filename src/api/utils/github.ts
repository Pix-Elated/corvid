/**
 * Shared GitHub API utilities.
 * Centralizes PAT handling and issue creation to avoid duplication.
 */

const GITHUB_API = 'https://api.github.com';

/** Get the GitHub PAT from Azure secrets (lowercase-hyphen convention) */
export function getGitHubPat(): string | undefined {
  return process.env['github-pat'];
}

/** Standard headers for GitHub API requests */
function githubHeaders(pat: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Corvid-Bot',
  };
}

/**
 * Create a GitHub issue in the specified repo.
 * Returns the issue URL and number on success.
 */
export async function createGitHubIssue(
  repo: string,
  title: string,
  body: string,
  labels: string[]
): Promise<{ issueUrl: string; issueNumber: number }> {
  const pat = getGitHubPat();
  if (!pat) throw new Error('github-pat secret not configured');

  const response = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
    method: 'POST',
    headers: githubHeaders(pat),
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { html_url: string; number: number };
  return { issueUrl: data.html_url, issueNumber: data.number };
}

/**
 * Read a JSON file from a GitHub repo.
 * Returns the parsed content and SHA (needed for updates).
 */
export async function readGitHubFile<T>(
  repo: string,
  filePath: string
): Promise<{ content: T; sha: string }> {
  const pat = getGitHubPat();
  if (!pat) throw new Error('github-pat secret not configured');

  const response = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}`, {
    headers: githubHeaders(pat),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}`);
  }

  const data = (await response.json()) as { content: string; sha: string };
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')) as T;
  return { content, sha: data.sha };
}

/**
 * Update a JSON file in a GitHub repo.
 */
export async function updateGitHubFile(
  repo: string,
  filePath: string,
  content: unknown,
  sha: string,
  commitMessage: string
): Promise<void> {
  const pat = getGitHubPat();
  if (!pat) throw new Error('github-pat secret not configured');

  const encoded = Buffer.from(JSON.stringify(content, null, 2) + '\n').toString('base64');

  const response = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: githubHeaders(pat),
    body: JSON.stringify({ message: commitMessage, content: encoded, sha }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }
}
