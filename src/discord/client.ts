import { Client, GatewayIntentBits, Partials } from 'discord.js';

/**
 * Create and configure Discord client with required intents
 */
export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // Privileged intent - must enable in Developer Portal
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  return client;
}
