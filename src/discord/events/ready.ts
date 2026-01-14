import { Client, REST, Routes, TextChannel, Message } from 'discord.js';
import { getConfig } from '../../config';
import { parseMunkMessage } from '../../parser/munk';
import { updateStatus, updateMaintenance } from '../../state';
import { setupCommand } from '../commands/setup';

/**
 * Handle the ready event - bot is connected and ready
 */
export async function handleReady(client: Client): Promise<void> {
  if (!client.user) {
    console.error('[Ready] Client user is not available');
    return;
  }

  console.log(`[Ready] Logged in as ${client.user.tag}`);

  // Register slash commands
  await registerCommands(client);

  // Fetch and parse the most recent status message
  await fetchLatestStatusMessage(client);
}

/**
 * Register slash commands with Discord
 */
async function registerCommands(client: Client): Promise<void> {
  const config = getConfig();

  const commands = [setupCommand.data.toJSON()];

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
