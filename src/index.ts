import { Client, Events } from 'discord.js';
import { loadConfig } from './config';
import { loadState } from './state';
import { createClient } from './discord/client';
import { handleReady } from './discord/events/ready';
import { handleMessageCreate } from './discord/events/messageCreate';
import { handleInteractionCreate } from './discord/events/interactionCreate';
import { handleGuildMemberAdd } from './discord/events/guildMemberAdd';
import { createApiServer, startApiServer } from './api/server';

let client: Client | null = null;

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('[Main] Starting Corvid Discord Bot...');

  // Load configuration
  let config;
  try {
    config = loadConfig();
    console.log('[Main] Configuration loaded');
  } catch (error) {
    console.error('[Main] Failed to load configuration:', error);
    process.exit(1);
  }

  // Load persisted state
  loadState();

  // Create Discord client
  client = createClient();

  // Register event handlers
  client.once(Events.ClientReady, async (readyClient) => {
    await handleReady(readyClient);
  });

  client.on(Events.MessageCreate, (message) => {
    handleMessageCreate(message);
  });

  // Handle all interactions (commands, buttons, etc.)
  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteractionCreate(interaction);
  });

  // Auto-assign Unverified role to new members
  client.on(Events.GuildMemberAdd, async (member) => {
    await handleGuildMemberAdd(member);
  });

  // Start Express API server
  const app = createApiServer();
  await startApiServer(app, config.port);

  // Login to Discord
  try {
    await client.login(config.discordBotToken);
  } catch (error) {
    console.error('[Main] Failed to login to Discord:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[Main] Received ${signal}, shutting down gracefully...`);

  if (client) {
    console.log('[Main] Destroying Discord client...');
    client.destroy();
  }

  console.log('[Main] Shutdown complete');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});
