import { EmbedBuilder, TextChannel, Guild } from 'discord.js';

const MOD_LOG_CHANNEL = 'moderation-log';

let cachedLogChannel: TextChannel | null = null;

/**
 * Get the moderation log channel for a guild
 */
export async function getModLogChannel(guild: Guild): Promise<TextChannel | null> {
  if (cachedLogChannel && cachedLogChannel.guild.id === guild.id) {
    return cachedLogChannel;
  }

  const channel = guild.channels.cache.find(
    (ch) => ch.name === MOD_LOG_CHANNEL && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (channel) {
    cachedLogChannel = channel;
    return channel;
  }

  console.warn(`[Audit] Could not find #${MOD_LOG_CHANNEL} channel`);
  return null;
}

/**
 * Clear cached channel (call when bot reconnects or channels change)
 */
export function clearAuditCache(): void {
  cachedLogChannel = null;
}

/**
 * Log an audit event to the moderation log channel
 */
export async function logAuditEvent(guild: Guild, embed: EmbedBuilder): Promise<void> {
  try {
    const channel = await getModLogChannel(guild);
    if (channel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('[Audit] Failed to send audit log:', error);
  }
}

// Embed colors for different event types
export const AuditColors = {
  JOIN: 0x2ecc71, // Green
  LEAVE: 0xe74c3c, // Red
  MESSAGE_EDIT: 0xf39c12, // Orange
  MESSAGE_DELETE: 0xe67e22, // Dark orange
  BAN: 0x992d22, // Dark red
  KICK: 0xe74c3c, // Red
  MUTE: 0xf1c40f, // Yellow
  WARN: 0xf1c40f, // Yellow
} as const;

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
