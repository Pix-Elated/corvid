# Corvid Discord Bot

> Explain changes clearly. The human is a security architect, not a Discord.js expert.

## Pre-Flight Checklist (MANDATORY)

```bash
git fetch origin && git branch --show-current && git status && npm run typecheck
```

| Check      | Expected                  | If Wrong                                                |
| ---------- | ------------------------- | ------------------------------------------------------- |
| Branch     | `master` or `feat/*`      | `git checkout master`                                   |
| Changes    | None (or intentional WIP) | WIP-commit: `git add -A && git commit -m "wip: reason"` |
| TypeScript | 0 errors                  | **STOP. Fix before proceeding.**                        |

---

## Hard Rules (Non-Negotiable)

### Git

- **NEVER** push directly to `master` or `staging` (pre-push hook blocks this)
- **NEVER** use `git stash` -- use WIP commits instead
- **NEVER** use `git reset --hard`, `git restore`, or `git clean -fd` on uncommitted work

### Security

- **NEVER** hardcode tokens, secrets, or IDs -- use environment variables via `src/config/`
- **NEVER** commit `.env` files
- **NEVER** expose Discord bot token in logs or error messages

### Code Quality

- **NEVER** leave unused imports or variables (`noUnusedLocals: true` in tsconfig)
- **NEVER** use `any` without prefixing the variable with `_`
- **NEVER** hallucinate Discord.js APIs -- verify against v14 docs

---

## Architecture

Discord bot + Express REST API, containerized for Azure.

- **Entry**: `src/index.ts`
- **Discord client**: `src/discord/client.ts`
- **Commands** (slash): `src/discord/commands/*.ts`
- **Events**: `src/discord/events/*.ts`
- **API routes**: `src/api/routes/*.ts`
- **State** (JSON persistence): `src/state/`
- **Config** (env vars): `src/config/`
- **Feature subsystems**: `src/tickets/`, `src/warnings/`, `src/reaction-roles/`, `src/image-scanner/`, etc.

### State Persistence

State is stored as JSON files (no database). Each subsystem manages its own:
`tickets.json`, `warnings.json`, `reaction-roles.json`, `server-state.json`, etc.

---

## Tech Stack

| Component      | Technology                   |
| -------------- | ---------------------------- |
| Runtime        | Node.js 20+                  |
| Language       | TypeScript 5.3 (strict mode) |
| Framework      | Discord.js 14, Express 4     |
| Build          | tsc (TypeScript compiler)    |
| Container      | Docker (multi-stage, Alpine) |
| Deploy         | Azure Container Apps         |
| Image Scanning | TensorFlow.js + nsfwjs       |

---

## Commands

```bash
npm run dev           # Run with ts-node
npm run dev:watch     # Nodemon auto-reload
npm run build         # Compile TS -> dist/
npm start             # Run compiled code
npm run typecheck     # Type-check only
npm run lint          # ESLint
npm run lint:fix      # ESLint auto-fix
npm run format        # Prettier format
npm run setup:hooks   # Install git hooks
```

---

## Git Workflow

```
feature-branch -> PR -> master -> deploy (Azure)
```

```bash
git checkout master && git pull origin master && git checkout -b feat/name
# ... work ...
npm run typecheck && npm run lint
# Commit, push, create PR targeting master
```

Branch prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`

Commit format: `<type>(<scope>): <description>` with user-benefit body for feat/fix/perf.
Body should explain benefit to **bot operators/server admins**, not implementation details.

---

## API Endpoints

| Endpoint          | Purpose                          |
| ----------------- | -------------------------------- |
| `GET /health`     | Health check (Azure probes)      |
| `GET /api/status` | Server status + maintenance info |

Rate-limited: 100 req/15min per IP. CORS restricted to ravenhud.com.

---

## Environment Variables

Required: `DISCORD_BOT_TOKEN`, `GUILD_ID`
Optional: `SOURCE_CHANNEL_ID`, `PORT` (default 3000), `TZ` (default UTC)

See `.env.example` for full list. Config loads from `src/config/index.ts`.

---

## When Uncertain

1. Check `src/types/index.ts` for interfaces
2. Check Discord.js v14 docs (not v13)
3. Check `src/config/` for env var requirements
4. Run `npm run typecheck` to catch errors
5. Ask -- better to clarify than guess
