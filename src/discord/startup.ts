import fs from 'fs';
import path from 'path';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const SHUTDOWN_FILE = path.join(DATA_DIR, '.last-shutdown.json');

interface ShutdownInfo {
  reason: string;
  timestamp: string;
  signal?: string;
  error?: string;
}

/**
 * Record shutdown reason before the bot exits
 */
export function recordShutdown(reason: string, signal?: string, error?: string): void {
  const info: ShutdownInfo = {
    reason,
    timestamp: new Date().toISOString(),
    signal,
    error: error?.slice(0, 500), // Truncate long errors
  };

  try {
    fs.writeFileSync(SHUTDOWN_FILE, JSON.stringify(info, null, 2));
    console.log(`[Startup] Recorded shutdown reason: ${reason}`);
  } catch (err) {
    console.error('[Startup] Failed to record shutdown:', err);
  }
}

/**
 * Get and clear the last shutdown info
 */
function getLastShutdown(): ShutdownInfo | null {
  try {
    if (fs.existsSync(SHUTDOWN_FILE)) {
      const data = fs.readFileSync(SHUTDOWN_FILE, 'utf-8');
      fs.unlinkSync(SHUTDOWN_FILE); // Clear after reading
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Startup] Failed to read shutdown info:', err);
  }
  return null;
}

/**
 * Send startup notification to bot-logs channel
 */
export async function sendStartupMessage(client: Client): Promise<void> {
  console.log('[Startup] Preparing startup message...');

  const guild = client.guilds.cache.first();

  if (!guild) {
    console.warn('[Startup] No guild found, skipping startup message');
    return;
  }

  // Fetch channels to ensure cache is populated
  await guild.channels.fetch();

  const botLogsChannel = guild.channels.cache.find(
    (ch) => ch.name === 'bot-logs' && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (!botLogsChannel) {
    console.warn('[Startup] #bot-logs channel not found');
    return;
  }

  const lastShutdown = getLastShutdown();

  const embed = new EmbedBuilder()
    .setTitle('Bot Started')
    .setColor(0x2ecc71)
    .setTimestamp()
    .addFields({ name: 'Status', value: 'Online and ready', inline: true });

  if (lastShutdown) {
    const shutdownTime = new Date(lastShutdown.timestamp);
    const downtime = formatDuration(Date.now() - shutdownTime.getTime());

    embed.addFields(
      { name: 'Previous Shutdown', value: lastShutdown.reason, inline: true },
      { name: 'Downtime', value: downtime, inline: true }
    );

    if (lastShutdown.signal) {
      embed.addFields({ name: 'Signal', value: lastShutdown.signal, inline: true });
    }

    if (lastShutdown.error) {
      embed.addFields({
        name: 'Error Details',
        value: `\`\`\`${lastShutdown.error.slice(0, 900)}\`\`\``,
      });
    }

    // Color based on shutdown type
    if (lastShutdown.reason.includes('error') || lastShutdown.reason.includes('crash')) {
      embed.setColor(0xe74c3c); // Red for errors
    } else if (lastShutdown.reason.includes('Graceful')) {
      embed.setColor(0x3498db); // Blue for graceful
    }
  } else {
    embed.addFields({
      name: 'Previous Shutdown',
      value: 'Unknown (first start or no record)',
      inline: true,
    });
  }

  try {
    await botLogsChannel.send({ embeds: [embed] });
    console.log('[Startup] Sent startup message to #bot-logs');
  } catch (error) {
    console.error('[Startup] Failed to send startup message:', error);
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
