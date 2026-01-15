import fs from 'fs';
import path from 'path';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const SHUTDOWN_FILE = path.join(DATA_DIR, '.last-shutdown.json');
const STARTUP_FILE = path.join(DATA_DIR, '.last-startup.json');

interface ShutdownInfo {
  reason: string;
  timestamp: string;
  signal?: string;
  error?: string;
}

interface StartupInfo {
  timestamp: string;
}

/**
 * Record startup time when the bot starts
 */
export function recordStartup(): void {
  const info: StartupInfo = {
    timestamp: new Date().toISOString(),
  };

  try {
    const fd = fs.openSync(STARTUP_FILE, 'w');
    fs.writeSync(fd, JSON.stringify(info, null, 2));
    fs.fsyncSync(fd); // Force flush to disk
    fs.closeSync(fd);
    console.log('[Startup] Recorded startup time');
  } catch (err) {
    console.error('[Startup] Failed to record startup:', err);
  }
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
    // Use open/write/fsync/close to ensure data is flushed to disk
    // This is important for container environments where process may be killed quickly
    const fd = fs.openSync(SHUTDOWN_FILE, 'w');
    fs.writeSync(fd, JSON.stringify(info, null, 2));
    fs.fsyncSync(fd); // Force flush to disk before process exits
    fs.closeSync(fd);
    console.log(`[Startup] Recorded shutdown reason: ${reason}`);
  } catch (err) {
    console.error('[Startup] Failed to record shutdown:', err);
  }
}

/**
 * Get the last startup info (for validation)
 */
function getLastStartup(): StartupInfo | null {
  try {
    if (fs.existsSync(STARTUP_FILE)) {
      const data = fs.readFileSync(STARTUP_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Startup] Failed to read startup info:', err);
  }
  return null;
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

  // Record this startup time for next cycle's validation
  recordStartup();

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
  const lastStartup = getLastStartup();

  const embed = new EmbedBuilder()
    .setTitle('Bot Started')
    .setColor(0x2ecc71)
    .setTimestamp()
    .addFields({ name: 'Status', value: 'Online and ready', inline: true });

  if (lastShutdown) {
    const shutdownTime = new Date(lastShutdown.timestamp);
    const now = Date.now();
    const rawDowntime = now - shutdownTime.getTime();

    // Validate: if we have last startup time, check if shutdown happened after it
    let isValidDowntime = true;
    let lastUptime: number | null = null;

    if (lastStartup) {
      const lastStartupTime = new Date(lastStartup.timestamp).getTime();
      // Shutdown should be AFTER the previous startup
      if (shutdownTime.getTime() <= lastStartupTime) {
        // Data is suspicious - shutdown time is before or at startup time
        isValidDowntime = false;
        console.warn('[Startup] Suspicious timing: shutdown timestamp is not after last startup');
      }
      // Calculate last session uptime for reference
      lastUptime = shutdownTime.getTime() - lastStartupTime;
    }

    // Only show downtime if it seems valid (positive and reasonable)
    if (isValidDowntime && rawDowntime > 0) {
      const downtime = formatDuration(rawDowntime);
      embed.addFields(
        { name: 'Previous Shutdown', value: lastShutdown.reason, inline: true },
        { name: 'Downtime', value: downtime, inline: true }
      );
    } else {
      // Show what we can, but indicate data may be unreliable
      embed.addFields(
        { name: 'Previous Shutdown', value: lastShutdown.reason, inline: true },
        { name: 'Downtime', value: 'Unknown (timing data unreliable)', inline: true }
      );
    }

    // If we have valid uptime from last session, show it
    if (lastUptime && lastUptime > 0) {
      embed.addFields({
        name: 'Last Session',
        value: formatDuration(lastUptime),
        inline: true,
      });
    }

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
