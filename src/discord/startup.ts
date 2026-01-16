import fs from 'fs';
import path from 'path';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';

// Use DATA_PATH env var for persistent storage, fallback to cwd
const DATA_DIR = process.env.DATA_PATH || process.cwd();
const SHUTDOWN_FILE = path.join(DATA_DIR, '.last-shutdown.json');
const STARTUP_FILE = path.join(DATA_DIR, '.last-startup.json');
const DEPLOYMENT_FILE = path.join(DATA_DIR, '.deployment-started.json');

interface ShutdownInfo {
  reason: string;
  timestamp: string;
  signal?: string;
  error?: string;
}

interface StartupInfo {
  timestamp: string;
}

interface DeploymentInfo {
  timestamp: string;
  version?: string;
  commitSha?: string;
  changelog?: string;
  commitUrl?: string;
  maintenanceMessageId?: string;
  maintenanceChannelId?: string;
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
 * Record that a deployment is starting (called when webhook is received)
 * This provides accurate downtime tracking since it's recorded BEFORE shutdown
 */
export function recordDeploymentStarting(
  version?: string,
  commitSha?: string,
  changelog?: string,
  commitUrl?: string,
  maintenanceMessageId?: string,
  maintenanceChannelId?: string
): void {
  const info: DeploymentInfo = {
    timestamp: new Date().toISOString(),
    version,
    commitSha,
    changelog,
    commitUrl,
    maintenanceMessageId,
    maintenanceChannelId,
  };

  try {
    const fd = fs.openSync(DEPLOYMENT_FILE, 'w');
    fs.writeSync(fd, JSON.stringify(info, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    console.log(
      `[Startup] Recorded deployment: v${version} (${commitSha}), msg: ${maintenanceMessageId}`
    );
  } catch (err) {
    console.error('[Startup] Failed to record deployment start:', err);
  }
}

/**
 * Get and clear the deployment start info
 */
function getDeploymentStart(): DeploymentInfo | null {
  try {
    if (fs.existsSync(DEPLOYMENT_FILE)) {
      const data = fs.readFileSync(DEPLOYMENT_FILE, 'utf-8');
      fs.unlinkSync(DEPLOYMENT_FILE); // Clear after reading
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Startup] Failed to read deployment info:', err);
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
 * Look for recent maintenance embed in #bot-logs posted by our bot
 * This is a fallback when the deployment file doesn't persist across container restarts
 */
async function findRecentMaintenanceEmbed(
  channel: TextChannel,
  botId: string
): Promise<DeploymentInfo | null> {
  try {
    // Fetch recent messages (last 10)
    const messages = await channel.messages.fetch({ limit: 10 });

    // Look for maintenance embed (within last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    for (const [, message] of messages) {
      // Must be from our bot
      if (message.author.id !== botId) continue;

      // Must be recent
      if (message.createdTimestamp < fiveMinutesAgo) continue;

      // Check for maintenance embed (title starts with "Updating to v")
      const embed = message.embeds[0];
      if (!embed?.title?.startsWith('Updating to v')) continue;

      console.log('[Startup] Found maintenance embed in channel history');

      // Parse version from title: "Updating to v1.2.3..."
      const versionMatch = embed.title.match(/Updating to v([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : undefined;

      // Parse from embed fields
      let commitSha: string | undefined;
      let changelog: string | undefined;
      let commitUrl: string | undefined;

      if (embed.fields) {
        for (const field of embed.fields) {
          if (field.name === 'Commit') {
            const match = field.value.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (match) {
              commitSha = match[1];
              commitUrl = match[2];
            } else {
              commitSha = field.value;
            }
          }
          if (field.name === 'Changes') {
            changelog = field.value;
          }
        }
      }

      return {
        timestamp: message.createdAt.toISOString(),
        version,
        commitSha,
        changelog,
        commitUrl,
        maintenanceMessageId: message.id,
        maintenanceChannelId: channel.id,
      };
    }
  } catch (err) {
    console.error('[Startup] Failed to search for maintenance embed:', err);
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

  // Try to get deployment info from file first, then fallback to Discord message
  let deploymentStart = getDeploymentStart();
  if (!deploymentStart || !deploymentStart.version) {
    console.log(
      '[Startup] No deployment file found, checking Discord for recent maintenance embed...'
    );
    const botId = client.user?.id;
    if (botId) {
      deploymentStart = await findRecentMaintenanceEmbed(botLogsChannel, botId);
    }
  }

  // Build the result embed
  const embed = new EmbedBuilder().setTimestamp();

  if (deploymentStart && deploymentStart.version) {
    // This is a deployment - show update-focused message
    const deployTime = new Date(deploymentStart.timestamp);
    const now = Date.now();
    const downtime = now - deployTime.getTime();
    const downtimeStr =
      downtime > 0 && downtime < 30 * 60 * 1000 ? formatDuration(downtime) : 'N/A';

    embed
      .setTitle(`Corvid Updated to v${deploymentStart.version}`)
      .setColor(0x2ecc71) // Green for success
      .setDescription('Bot is now online with the latest changes.');

    // Version and commit info
    if (deploymentStart.commitSha) {
      const commitLink = deploymentStart.commitUrl
        ? `[${deploymentStart.commitSha}](${deploymentStart.commitUrl})`
        : deploymentStart.commitSha;
      embed.addFields(
        { name: 'Version', value: deploymentStart.version, inline: true },
        { name: 'Commit', value: commitLink, inline: true },
        { name: 'Downtime', value: downtimeStr, inline: true }
      );
    } else {
      embed.addFields(
        { name: 'Version', value: deploymentStart.version, inline: true },
        { name: 'Downtime', value: downtimeStr, inline: true }
      );
    }

    // Changelog
    if (deploymentStart.changelog) {
      const changelog =
        deploymentStart.changelog.length > 800
          ? deploymentStart.changelog.slice(0, 800) + '...'
          : deploymentStart.changelog;
      embed.addFields({ name: 'Changes', value: changelog });
    }

    // Add link to releases
    embed.addFields({
      name: 'Links',
      value: '[View Releases](https://github.com/Pix-Elated/corvid/releases)',
    });

    // Try to EDIT the maintenance message instead of posting new
    if (deploymentStart.maintenanceMessageId && deploymentStart.maintenanceChannelId) {
      try {
        const channel = client.channels.cache.get(deploymentStart.maintenanceChannelId) as
          | TextChannel
          | undefined;
        if (channel) {
          const maintenanceMsg = await channel.messages.fetch(deploymentStart.maintenanceMessageId);
          await maintenanceMsg.edit({ embeds: [embed] });
          console.log('[Startup] Edited maintenance embed with update results');
          return;
        }
      } catch (err) {
        console.error('[Startup] Failed to edit maintenance message, will post new:', err);
      }
    }
  } else if (lastShutdown) {
    // Regular restart (not a deployment)
    const shutdownTime = new Date(lastShutdown.timestamp);
    const now = Date.now();
    const rawDowntime = now - shutdownTime.getTime();
    const downtimeStr = rawDowntime > 0 ? formatDuration(rawDowntime) : 'N/A';

    embed
      .setTitle('Corvid Restarted')
      .setDescription('Bot is back online.')
      .addFields(
        { name: 'Reason', value: lastShutdown.reason, inline: true },
        { name: 'Downtime', value: downtimeStr, inline: true }
      );

    // Color based on shutdown type
    if (lastShutdown.reason.includes('error') || lastShutdown.reason.includes('crash')) {
      embed.setColor(0xe74c3c); // Red for errors
    } else {
      embed.setColor(0x2ecc71); // Green for normal
    }

    if (lastShutdown.signal) {
      embed.addFields({ name: 'Signal', value: lastShutdown.signal, inline: true });
    }

    if (lastShutdown.error) {
      embed.addFields({
        name: 'Error Details',
        value: `\`\`\`${lastShutdown.error.slice(0, 500)}\`\`\``,
      });
    }
  } else {
    // First start or no info
    embed.setTitle('Corvid Started').setColor(0x2ecc71).setDescription('Bot is now online.');
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
