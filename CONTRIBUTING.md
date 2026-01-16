# Contributing to Corvid

Thank you for your interest in contributing to Corvid!

## Getting Started

1. Clone the repository
2. Run `npm install` (hooks are installed automatically via `prepare` script)
3. Copy `.env.example` to `.env` and fill in your Discord bot token

## Development

```bash
npm run dev        # Run with ts-node
npm run dev:watch  # Run with nodemon (auto-reload)
npm run build      # Compile TypeScript
npm run lint       # Run ESLint
npm run format     # Format with Prettier
npm run typecheck  # Type checking only
```

## Branch Workflow

- Create feature branches from `master`
- Branch naming: `feat/description`, `fix/description`, `chore/description`
- Submit PRs for review
- Direct pushes to master/main/staging are blocked

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) with **mandatory human-readable bodies** for user-facing changes.

### Format

```
type(scope): short description

Human-readable explanation of what changed and why it matters.
This body is REQUIRED for feat, fix, and perf commits (minimum 50 characters).

Optional technical details can follow.

Co-Authored-By: Your Name <email@example.com>
```

### Commit Types

| Type       | Description               | Body Required       |
| ---------- | ------------------------- | ------------------- |
| `feat`     | New feature               | **YES** (50+ chars) |
| `fix`      | Bug fix                   | **YES** (50+ chars) |
| `perf`     | Performance improvement   | **YES** (50+ chars) |
| `chore`    | Maintenance, dependencies | Optional            |
| `docs`     | Documentation changes     | Optional            |
| `style`    | Formatting, whitespace    | Optional            |
| `refactor` | Code restructuring        | Optional            |
| `ci`       | CI/CD changes             | Optional            |
| `build`    | Build system changes      | Optional            |
| `test`     | Test additions/fixes      | Optional            |

### Example: Good Commit

```
feat(status): add maintenance countdown in API response

Server admins can now see estimated maintenance end times in the /api/status
response. This helps when building status pages or dashboards that need to
show players when the game will be back online.

- Added maintenance.endTime and maintenance.durationMinutes fields
```

### Example: Bad Commit (Will Be Rejected)

```
feat: add new endpoint
```

_Missing body - doesn't explain what the endpoint does for bot operators_

### Why Bodies Matter

Commit messages feed into:

- Release notes
- Changelog entries
- Discord update announcements

When you write "Server admins can now...", you're directly writing for the people who deploy the bot.

## Git Hooks

The repository uses git hooks to enforce code quality:

- **pre-commit**: Runs ESLint, Prettier, and type checking
- **commit-msg**: Validates Conventional Commits format and body requirements
- **pre-push**: Prevents direct pushes to protected branches

Hooks are installed automatically when you run `npm install`.

If your commit is rejected, read the error message - it will explain exactly what's needed.

## Pull Requests

1. Ensure your branch is up-to-date with `master`
2. All checks must pass (lint, typecheck)
3. Request review from a maintainer

## Questions?

Open an issue or reach out on Discord.
