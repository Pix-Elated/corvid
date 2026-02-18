# Corvid Discord Bot - Claude Project Rules

## Overview

Corvid is a Discord bot for server bootstrapping and game server status monitoring. It runs on Azure Container Apps and exposes a REST API for status checks.

## Environment

- **Platform**: Windows development, Linux production (Docker)
- **Runtime**: Node.js 20+ with TypeScript
- **Working Directory**: `c:/Users/jgh0st/Repositories/corvid`

## Path Rules (Windows)

- Use forward slashes: `c:/Users/jgh0st/...`
- Quote paths with spaces: `"c:/path with spaces/..."`

---

## Commit Message Rules

### Format

```
<type>(<scope>): <short description>

<human-readable body for user-facing changes - minimum 50 characters>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### When Body is REQUIRED

| Type   | Description | Body Required       |
| ------ | ----------- | ------------------- |
| `feat` | New feature | **YES** (50+ chars) |
| `fix`  | Bug fix     | **YES** (50+ chars) |
| `perf` | Performance | **YES** (50+ chars) |

### When Body is OPTIONAL

| Type       | Description   | Body Required |
| ---------- | ------------- | ------------- |
| `chore`    | Maintenance   | Optional      |
| `docs`     | Documentation | Optional      |
| `ci`       | CI/CD changes | Optional      |
| `refactor` | Restructuring | Optional      |
| `style`    | Formatting    | Optional      |
| `test`     | Tests         | Optional      |
| `build`    | Build changes | Optional      |

### Body Guidelines

For `feat`, `fix`, and `perf` commits, the body must:

- Explain what changed from a **bot operator/server admin perspective**
- Use plain language, not internal implementation details
- Mention Discord commands or API endpoints by name
- Be at least 50 characters

### Examples

**GOOD: User-Facing Feature**

```
feat(status): add maintenance countdown in API response

Server admins can now see estimated maintenance end times in the /api/status
response. This helps when building status pages or dashboards that need to
show players when the game will be back online.

- Added maintenance.endTime and maintenance.durationMinutes fields
- Returns null when server is online (no maintenance)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

**GOOD: Bug Fix**

```
fix(embeds): prevent duplicate status messages in channel

The bot no longer posts duplicate status embeds when it reconnects after
a brief disconnect. Previously, server admins would see 2-3 identical
messages appear after network hiccups.

- Delete existing bot messages before posting new embed
- Add debounce to prevent rapid-fire updates

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

**BAD: Technical-Only**

```
feat(status): add maintenance countdown in API response

- Add maintenanceEndTime to StatusState interface
- Update munk.ts parser to extract end time from embed
- Modify status route to include new fields

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

_Problem: Doesn't explain benefit to bot operators_

**ACCEPTABLE: Housekeeping**

```
chore: update discord.js to v14.16.0

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Project Structure

```
corvid/
├── src/
│   ├── index.ts           # Entry point
│   ├── discord/           # Discord client and commands
│   ├── api/               # Express REST API
│   ├── parser/            # Message parsing (Munk embeds)
│   └── state/             # State management
├── scripts/
│   └── hooks/             # Git hooks
├── Dockerfile
└── package.json
```

## Development Commands

```bash
npm run dev        # Run with ts-node
npm run dev:watch  # Run with nodemon (auto-reload)
npm run build      # Compile TypeScript
npm start          # Run compiled code
npm run lint       # ESLint
npm run format     # Prettier
npm run typecheck  # Type checking only
npm run setup:hooks # Install git hooks
```

## Branch Workflow

- Feature branches: `feat/`, `fix/`, `chore/`
- Main branch: `master`
- Always create PR for review before merging
- Direct pushes to master/main/staging are blocked by pre-push hook

## Deployment

- Docker container deployed to Azure Container Apps
- Health check endpoint: `/health`
- Status API endpoint: `/api/status`
