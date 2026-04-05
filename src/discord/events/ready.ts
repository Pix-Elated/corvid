import { Client, REST, Routes, TextChannel, Message } from 'discord.js';
import { getConfig } from '../../config';
import { parseMunkMessage } from '../../parser/munk';
import { updateStatus, updateMaintenance } from '../../state';
import { loadTicketState } from '../../tickets';
import { startAutoClose } from '../../tickets/autoclose';
import { setupCommand } from '../commands/setup';
import { verifyCommand } from '../commands/verify';
import { populateCommand } from '../commands/populate';
import { ticketSetupCommand } from '../commands/ticket-setup';
import { rolesSetupCommand } from '../commands/roles-setup';
import { statusCommand } from '../commands/status';
import { postInfoCardsCommand } from '../commands/post-info-cards';
import {
  banCommand,
  kickCommand,
  muteCommand,
  unmuteCommand,
  warnCommand,
  warningsCommand,
  clearWarningsCommand,
} from '../commands/moderation';
import { scanCommand } from '../commands/scan';
import { worldmapBanCommand } from '../commands/worldmap-ban';
import { clusterCommand } from '../commands/cluster';
import { postOrUpdateBanList, startBanListRefresh } from '../../hall-of-shame';
import {
  questCommand,
  setupQuestTrackingCommand,
  nftCommand,
  startPolling,
  startTreasuryWatch,
} from '../../quest-tracker';

/**
 * Handle the ready event - bot is connected and ready
 */
export async function handleReady(client: Client): Promise<void> {
  if (!client.user) {
    console.error('[Ready] Client user is not available');
    return;
  }

  console.log(`[Ready] Logged in as ${client.user.tag}`);

  // Load ticket state from file
  loadTicketState();

  // Register slash commands
  await registerCommands(client);

  // Fetch and parse the most recent status message
  await fetchLatestStatusMessage(client);

  // Start ticket auto-close checker
  startAutoClose(client);

  // NSFW model loads lazily on first image scan — no startup load needed

  // Post/update hall-of-shame ban list card and start daily refresh
  const config = getConfig();
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {
      await postOrUpdateBanList(guild, client);
      startBanListRefresh(guild, client);
    }
  } catch (error) {
    console.error('[Ready] Failed to set up ban list card:', error);
  }

  // Start QUEST tracker hourly polling + 6-hour treasury surveillance
  startPolling(client);
  startTreasuryWatch(client);
}

/**
 * Register slash commands with Discord
 */
async function registerCommands(client: Client): Promise<void> {
  const config = getConfig();

  const commands = [
    setupCommand.data.toJSON(),
    verifyCommand.data.toJSON(),
    populateCommand.data.toJSON(),
    ticketSetupCommand.data.toJSON(),
    rolesSetupCommand.data.toJSON(),
    statusCommand.data.toJSON(),
    postInfoCardsCommand.data.toJSON(),
    banCommand.data.toJSON(),
    kickCommand.data.toJSON(),
    muteCommand.data.toJSON(),
    unmuteCommand.data.toJSON(),
    warnCommand.data.toJSON(),
    warningsCommand.data.toJSON(),
    clearWarningsCommand.data.toJSON(),
    scanCommand.data.toJSON(),
    worldmapBanCommand.data.toJSON(),
    clusterCommand.data.toJSON(),
    questCommand.data.toJSON(),
    setupQuestTrackingCommand.data.toJSON(),
    nftCommand.data.toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(config.discordBotToken);

  try {
    console.log('[Ready] Registering slash commands...');

    await rest.put(Routes.applicationGuildCommands(client.user!.id, config.guildId), {
      body: commands,
    });

    console.log('[Ready] Slash commands registered successfully');
  } catch (error) {
    console.error('[Ready] Error registering slash commands:', error);
  }
}

/**
 * Fetch the most recent status message from the source channel
 */
async function fetchLatestStatusMessage(client: Client): Promise<void> {
  const config = getConfig();

  // Skip if no source channel configured
  if (!config.sourceChannelId) {
    console.log('[Ready] No source channel configured, skipping status fetch');
    return;
  }

  try {
    const channel = await client.channels.fetch(config.sourceChannelId);

    if (!channel || !(channel instanceof TextChannel)) {
      console.log('[Ready] Source channel not found or is not a text channel');
      return;
    }

    // Fetch the last 50 messages and find ones with embeds
    const messages = await channel.messages.fetch({ limit: 50 });
    const embedMessages = messages.filter((msg: Message) => msg.embeds.length > 0);

    if (embedMessages.size === 0) {
      console.log('[Ready] No messages with embeds found in source channel');
      return;
    }

    // Try to parse messages until we find a valid one
    for (const [, message] of embedMessages) {
      const parseResult = parseMunkMessage(message);
      if (parseResult) {
        if (parseResult.type === 'status') {
          updateStatus(parseResult.status);
        } else if (parseResult.type === 'maintenance') {
          updateMaintenance(parseResult.maintenance);
        }
        console.log('[Ready] Initial state set from channel message');
        return;
      }
    }

    console.log('[Ready] No parseable status messages found');
  } catch (error) {
    console.error('[Ready] Error fetching status messages:', error);
  }
}
