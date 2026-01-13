# Corvid Discord Bot

A Discord bot for server bootstrapping and game server status monitoring.

## Features

1. **Server Bootstrap** - Creates a complete Discord server structure with roles, categories, and channels via the `/setup` command
2. **Server Status Monitoring** - Monitors another bot's (Munk) status messages and exposes them via REST API

## Prerequisites

- Node.js 20+
- npm or yarn
- Docker (optional, for containerized deployment)
- A Discord bot application

## Discord Developer Portal Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name (e.g., "Corvid")
3. Go to the "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - **Message Content Intent** (required for reading message embeds)
5. Copy the bot token (you'll need this for configuration)
6. Go to "OAuth2" > "URL Generator"
7. Select scopes:
   - `bot`
   - `applications.commands`
8. Select bot permissions:
   - Manage Roles
   - Manage Channels
   - View Channels
   - Send Messages
   - Read Message History
   - Use Slash Commands
9. Copy the generated URL and use it to invite the bot to your server

## Getting IDs

### Guild (Server) ID
1. Enable Developer Mode in Discord (User Settings > Advanced > Developer Mode)
2. Right-click on your server name and select "Copy Server ID"

### Channel ID
1. Right-click on the channel and select "Copy Channel ID"

### Bot User ID
1. Right-click on the bot user and select "Copy User ID"

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```env
DISCORD_BOT_TOKEN=your_bot_token_here
GUILD_ID=your_guild_id_here
SOURCE_CHANNEL_ID=channel_id_where_munk_posts
MUNK_BOT_ID=munk_bot_user_id
PORT=3000
TZ=UTC
```

### 3. Run in Development Mode

```bash
npm run dev
```

Or with auto-reload:
```bash
npm run dev:watch
```

### 4. Build for Production

```bash
npm run build
npm start
```

## Docker

### Build Image

```bash
docker build -t corvid .
```

### Run Container

```bash
docker run -d \
  --name corvid \
  -p 3000:3000 \
  -e DISCORD_BOT_TOKEN=your_token \
  -e GUILD_ID=your_guild_id \
  -e SOURCE_CHANNEL_ID=your_channel_id \
  -e MUNK_BOT_ID=munk_bot_id \
  -e PORT=3000 \
  corvid
```

Or using an env file:
```bash
docker run -d \
  --name corvid \
  -p 3000:3000 \
  --env-file .env \
  corvid
```

## Azure Container Apps Deployment

### 1. Login to Azure

```bash
az login
```

### 2. Create Resource Group (if needed)

```bash
az group create --name corvid-rg --location eastus
```

### 3. Create Container Apps Environment

```bash
az containerapp env create \
  --name corvid-env \
  --resource-group corvid-rg \
  --location eastus
```

### 4. Build and Push Image to Azure Container Registry

```bash
# Create ACR (if needed)
az acr create --name corvidacr --resource-group corvid-rg --sku Basic

# Login to ACR
az acr login --name corvidacr

# Build and push
az acr build --registry corvidacr --image corvid:latest .
```

### 5. Deploy Container App

```bash
az containerapp create \
  --name corvid \
  --resource-group corvid-rg \
  --environment corvid-env \
  --image corvidacr.azurecr.io/corvid:latest \
  --registry-server corvidacr.azurecr.io \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 1 \
  --env-vars \
    DISCORD_BOT_TOKEN=secretref:discord-token \
    GUILD_ID=your_guild_id \
    SOURCE_CHANNEL_ID=your_channel_id \
    MUNK_BOT_ID=munk_bot_id \
    PORT=3000
```

### 6. Configure Secrets

```bash
az containerapp secret set \
  --name corvid \
  --resource-group corvid-rg \
  --secrets discord-token=your_actual_token
```

## Usage

### /setup Command

The `/setup` command bootstraps your Discord server with the default structure. Only users with Administrator permission can use this command.

**What it creates:**
- **Roles:** Admin, Moderator, Support Team, Verified, Unverified
- **Categories:** INFORMATION, SUPPORT, COMMUNITY, STAFF ONLY, BOT
- **Channels:** Various channels within each category with appropriate permissions

The command is idempotent - it will skip creating resources that already exist.

**Important:** After running `/setup`, manually drag the bot's role above the created roles in Server Settings > Roles for proper permission management.

### API Endpoints

#### GET /health
Health check endpoint for monitoring and Azure health probes.

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-13T12:00:00.000Z"
}
```

#### GET /api/status
Returns current server status information.

```bash
curl http://localhost:3000/api/status
```

Response (online):
```json
{
  "status": "online",
  "lastUpdated": "2026-01-13T12:00:00.000Z",
  "maintenance": null
}
```

Response (maintenance):
```json
{
  "status": "maintenance",
  "lastUpdated": "2026-01-13T12:00:00.000Z",
  "maintenance": {
    "startTime": "2026-01-13T14:00:00.000Z",
    "endTime": "2026-01-13T15:30:00.000Z",
    "durationMinutes": 90,
    "message": "We will be undergoing a 90-minute maintenance..."
  }
}
```

## Project Structure

```
corvid/
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
│   │   ├── index.ts          # Bootstrap orchestrator
│   │   ├── roles.ts          # Role creation
│   │   ├── categories.ts     # Category creation
│   │   └── channels.ts       # Channel creation
│   ├── api/
│   │   ├── server.ts         # Express setup
│   │   └── routes/
│   │       ├── status.ts     # /api/status
│   │       └── health.ts     # /health
│   ├── parser/
│   │   └── munk.ts           # Munk embed parsing
│   ├── state/
│   │   └── index.ts          # State management
│   ├── config/
│   │   ├── index.ts          # Environment config
│   │   └── server-structure.ts
│   └── types/
│       └── index.ts          # TypeScript types
├── Dockerfile
├── .dockerignore
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Notes

- The bot role must be positioned above the roles it creates for proper permission management
- Bootstrap operations are idempotent - safe to run multiple times
- Never grant Administrator permission to any role (security best practice)
- State is persisted to `status.json` for recovery after restarts
