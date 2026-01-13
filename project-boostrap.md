Create a Discord bot in TypeScript that:
1. Bootstraps a Discord server with best-practice channels, roles, and permissions
2. Monitors a game server status channel and exposes data via REST API

The bot will be deployed to Azure Container Apps.

---

## FEATURE 1: SERVER BOOTSTRAP

On first run (or via a slash command like /setup), the bot should create a complete Discord server structure optimized for an app support community.

### Roles (in hierarchy order, top to bottom)
- Admin: Full server management (separate from bot role)
- Moderator: Manage messages, mute/kick users, view audit log
- Support Team: Access to support channels, can't manage server
- Verified: Standard member access (unlocked after verification)
- Unverified: New members, limited to rules and verification channels

### Categories & Channels

**📢 INFORMATION**
- #welcome (read-only, welcome message with server guide)
- #rules (read-only, server rules)
- #announcements (read-only, official announcements)
- #roadmap (read-only, app updates and planned features)

**🎫 SUPPORT**
- #faq (read-only, frequently asked questions)
- #support-general (Verified+ can post)
- #bug-reports (Verified+, structured bug reporting)
- #feature-requests (Verified+)

**💬 COMMUNITY**
- #general (Verified+, main chat)
- #off-topic (Verified+)
- #screenshots (Verified+, media only)

**🔒 STAFF ONLY** (visible only to Support Team+)
- #staff-chat
- #moderation-log
- #support-tickets (if implementing ticket system later)

**🤖 BOT** (visible only to Admin)
- #bot-logs (bot status, errors)
- #server-status (where Munk posts are mirrored/monitored)

### Permissions Strategy
- Use category-level permissions (channels inherit)
- @everyone: No permissions except viewing #welcome, #rules
- Unverified: Can see and use #verify channel only
- Verified: Access to SUPPORT and COMMUNITY categories
- Support Team: Verified permissions + STAFF ONLY visibility
- Moderator: Support Team + manage messages/members
- Admin: Full access (but not Administrator permission for safety)

### Bootstrap Behavior
- Idempotent: Skip creating roles/channels that already exist
- Log all actions to console
- Run via slash command: /setup (Admin only)
- Store setup completion flag in config to prevent accidental reruns
- Optionally accept a JSON config file to customize structure

---

## FEATURE 2: SERVER STATUS MONITORING

### Context
A Discord bot named "Munk" posts server status updates as embeds. The embeds have two formats:

1. **Server Status** (title: "[Global] Server Status")
   - Body: "The Server is back **Online**!" or similar
   - Indicates server is up/down

2. **Server Maintenance** (title: "[Global] Server Maintenance")
   - Body contains: maintenance duration, start time, expected end time
   - Example: "We will be undergoing a 90-minute maintenance starting [date] at [time]... The maintenance is expected to conclude by [date] at [time]."

Multiple Electron app instances will poll the bot's API to display countdown timers.

### Discord Monitoring
- Monitor SOURCE_CHANNEL_ID for new messages
- Filter to only process messages from MUNK_BOT_ID
- Parse embed title and description to extract:
  - Server status: "online" | "maintenance" | "offline"
  - Maintenance window: start time, end time, duration, message
- On startup, fetch and parse the most recent Munk message

### HTTP API (Express)
- Run alongside Discord client on configurable PORT
- Endpoints:
  - GET /api/status → current server status JSON
  - GET /health → 200 OK (Azure health probes)
- Enable CORS for all origins
- Response schema:
```json
  {
    "status": "online" | "maintenance" | "offline",
    "lastUpdated": "ISO 8601 timestamp",
    "maintenance": {
      "startTime": "ISO 8601 timestamp",
      "endTime": "ISO 8601 timestamp",
      "durationMinutes": number,
      "message": "string"
    } | null
  }
```

### Persistence
- Store state in local status.json file
- Load on startup, update on change

---

## CONFIGURATION

### Environment Variables
- DISCORD_BOT_TOKEN: Bot token
- GUILD_ID: Server to bootstrap/monitor
- SOURCE_CHANNEL_ID: Channel where Munk posts
- MUNK_BOT_ID: Munk's bot user ID
- PORT: HTTP server port (default 3000)
- TZ: Timezone for parsing dates (default UTC)

### Server Structure Config (optional)
- Allow overriding default channel/role structure via server-config.json
- Bot uses defaults if file doesn't exist

---

## PROJECT STRUCTURE
discord-status-bot/
├── src/
│   ├── index.ts              # Entry point
│   ├── discord/
│   │   ├── client.ts         # Discord client setup
│   │   ├── events/
│   │   │   ├── ready.ts      # On ready handler
│   │   │   └── messageCreate.ts
│   │   └── commands/
│   │       └── setup.ts      # /setup slash command
│   ├── bootstrap/
│   │   ├── index.ts          # Main bootstrap orchestrator
│   │   ├── roles.ts          # Role creation
│   │   ├── categories.ts     # Category creation
│   │   └── channels.ts       # Channel creation with permissions
│   ├── api/
│   │   ├── server.ts         # Express setup
│   │   └── routes/
│   │       ├── status.ts     # /api/status
│   │       └── health.ts     # /health
│   ├── parser/
│   │   └── munk.ts           # Munk embed parsing
│   ├── state/
│   │   └── index.ts          # State management + persistence
│   ├── config/
│   │   ├── index.ts          # Load env vars
│   │   └── server-structure.ts # Default server structure
│   └── types/
│       └── index.ts          # TypeScript interfaces
├── server-config.example.json
├── Dockerfile
├── .dockerignore
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
---

## TECH STACK

- Node.js 20
- TypeScript 5 (strict mode)
- discord.js v14
- Express v4
- dotenv
- No database, no external services

---

## DISCORD INTENTS & PERMISSIONS

### Intents Required
- Guilds
- GuildMessages
- MessageContent (privileged - enable in Developer Portal)

### Bot Permissions Required
- Manage Roles
- Manage Channels
- View Channels
- Send Messages (for setup confirmation only)
- Read Message History
- Use Slash Commands

---

## DOCKERFILE

- Multi-stage build (build + production)
- node:20-alpine base
- Non-root user
- Only production dependencies in final image
- Expose PORT

---

## CODE QUALITY

- Clean, well-commented code
- Proper error handling
- Graceful shutdown (SIGTERM/SIGINT)
- Strict TypeScript
- Modular and easy to extend

---

## README SHOULD INCLUDE

1. Project overview
2. Prerequisites (Node, Docker, Discord app setup)
3. Discord Developer Portal setup:
   - Create application
   - Enable privileged intents
   - Get bot token
   - Generate invite URL with required permissions
4. How to get Guild ID, Channel ID, Bot ID
5. Local development:
   - Install dependencies
   - Configure .env
   - Run in dev mode
6. Docker:
   - Build command
   - Run command
7. Azure Container Apps deployment:
   - az cli commands
   - Environment variable configuration
   - Custom domain (optional)
8. Usage:
   - /setup command
   - API endpoints

---

## NOTES

- Bot role must be positioned above roles it creates (drag manually after invite)
- Bootstrap is idempotent - safe to run multiple times
- Parse dates from natural language (e.g., "January 8, 2026 at 6:00 AM")
- Log all actions for debugging
- Never grant Administrator permission to any role (security best practice)