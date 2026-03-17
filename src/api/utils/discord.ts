/**
 * Shared Discord utilities for API routes.
 */

import { Guild, TextChannel } from 'discord.js';

/**
 * Find a text channel by name in a guild. Case-sensitive.
 * Returns null if not found.
 */
export function findTextChannel(guild: Guild, name: string): TextChannel | null {
  const channel = guild.channels.cache.find(
    (ch) => ch.name === name && ch instanceof TextChannel
  ) as TextChannel | undefined;
  return channel ?? null;
}

/**
 * Find or create a text channel in a guild.
 * Creates under the first category matching `parentPattern` if provided.
 */
export async function findOrCreateTextChannel(
  guild: Guild,
  name: string,
  options?: { parentPattern?: string; topic?: string }
): Promise<TextChannel> {
  const existing = findTextChannel(guild, name);
  if (existing) return existing;

  const parent = options?.parentPattern
    ? guild.channels.cache.find(
        (ch) =>
          ch.name.toLowerCase().includes(options.parentPattern!.toLowerCase()) && ch.type === 4
      )
    : undefined;

  const created = await guild.channels.create({
    name,
    type: 0, // GuildText
    parent: parent?.id,
    topic: options?.topic,
  });

  return created as TextChannel;
}
