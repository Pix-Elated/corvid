import { Client, Events } from 'discord.js';
import { loadConfig } from './config';
import { loadState } from './state';
import { loadTicketState } from './tickets';
import { loadWarningsState } from './warnings';
import { loadReactionRolesState } from './reaction-roles';
import { loadInfoCardsState } from './info-cards';
import { loadServerState } from './server-state';
import { loadReleaseState } from './releases';
import { loadAdoptedChannelsState } from './adopted-channels';
import { createClient } from './discord/client';
import { handleReady } from './discord/events/ready';
import { handleMessageCreate } from './discord/events/messageCreate';
import { handleMessageUpdate } from './discord/events/messageUpdate';
import { handleMessageDelete } from './discord/events/messageDelete';
import { handleInteractionCreate } from './discord/events/interactionCreate';
import { handleGuildMemberAdd } from './discord/events/guildMemberAdd';
import { handleGuildMemberRemove } from './discord/events/guildMemberRemove';
import type { Server } from 'http';
import { createApiServer, startApiServer } from './api/server';
import { closeSseConnections, setBansDiscordClient } from './api/routes/bans';
import { recordShutdown, sendStartupMessage } from './discord/startup';
import { stopAutoClose } from './tickets/autoclose';
import { stopBanListRefresh } from './hall-of-shame';
import { loadTrackerState, stopPolling, stopTreasuryWatch } from './quest-tracker';
import { loadIpIdentityState } from './ip-identity';
import { loadSubmissionsState } from './submissions';
import { stopDailyStatsCard } from './moderation-stats/daily-card';

let client: Client | null = null;
let httpServer: Server | null = null;

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
  loadTicketState();
  loadWarningsState();
  loadReactionRolesState();
  loadInfoCardsState();
  loadServerState();
  loadReleaseState();
  loadAdoptedChannelsState();
  loadTrackerState();
  loadIpIdentityState();
  loadSubmissionsState();

  // Create Discord client
  client = createClient();

  // Register event handlers
  client.once(Events.ClientReady, async (readyClient) => {
    await handleReady(readyClient);
    await sendStartupMessage(readyClient);
  });

  // Handle messages (auto-mod + status parsing)
  client.on(Events.MessageCreate, async (message) => {
    await handleMessageCreate(message);
  });

  // Handle all interactions (commands, buttons, etc.)
  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteractionCreate(interaction);
  });

  // Log new members
  client.on(Events.GuildMemberAdd, async (member) => {
    await handleGuildMemberAdd(member);
  });

  // Log member leaves
  client.on(Events.GuildMemberRemove, async (member) => {
    await handleGuildMemberRemove(member);
  });

  // Log message edits
  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    await handleMessageUpdate(oldMessage, newMessage);
  });

  // Log message deletions
  client.on(Events.MessageDelete, async (message) => {
    await handleMessageDelete(message);
  });

  // Discord client resilience handlers
  client.on(Events.Error, (error) => {
    console.error('[Main] Discord client error:', error);
    // Don't exit - let discord.js attempt to recover
  });

  client.on(Events.Warn, (warning) => {
    console.warn('[Main] Discord client warning:', warning);
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(
      `[Main] Shard ${shardId} disconnected (code: ${event.code}), will attempt reconnect...`
    );
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`[Main] Shard ${shardId} reconnecting...`);
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    console.log(`[Main] Shard ${shardId} resumed, replayed ${replayedEvents} events`);
  });

  client.on(Events.ShardError, (error, shardId) => {
    console.error(`[Main] Shard ${shardId} error:`, error);
    // Don't exit - let discord.js handle shard recovery
  });

  // Start Express API server
  const app = createApiServer();
  httpServer = await startApiServer(app, config.port);

  // Login to Discord
  try {
    await client.login(config.discordBotToken);
    // Give API routes access to the Discord client for ban reporting
    setBansDiscordClient(client);
  } catch (error) {
    console.error('[Main] Failed to login to Discord:', error);
    recordShutdown('Failed to login to Discord', undefined, String(error));
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[Main] Received ${signal}, shutting down gracefully...`);

  // Record shutdown for next startup message
  const reason =
    signal === 'SIGTERM' ? 'Graceful shutdown (deployment/restart)' : 'Graceful shutdown (manual)';
  recordShutdown(reason, signal);

  stopAutoClose();
  stopBanListRefresh();
  stopDailyStatsCard();
  stopPolling();
  stopTreasuryWatch();

  // Drain long-lived SSE connections before closing the HTTP server —
  // server.close() otherwise waits indefinitely for them to end.
  closeSseConnections();

  if (httpServer) {
    console.log('[Main] Closing HTTP server...');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[Main] HTTP server close timed out, forcing exit');
        resolve();
      }, 5000);
      httpServer?.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

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
  recordShutdown('Uncaught exception (crash)', undefined, String(error));
  // Only exit for truly fatal errors - let container orchestrator restart
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
  // Log but don't exit - many rejections are recoverable (network issues, rate limits, etc.)
  // The bot can continue operating even if individual operations fail
});

// Start the application
main().catch((error) => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});
