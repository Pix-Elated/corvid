/**
 * Hourly polling service for the QUEST tracker.
 * Posts digest to the configured Discord channel every hour.
 */
import { Client, TextChannel } from 'discord.js';
import * as imx from './imx-service';
import * as embeds from './embeds';
import { getTrackerState, setLastSync } from './state';
import { getWeeklySummary } from './analytics';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let pollInterval: NodeJS.Timeout | null = null;
let lastWeeklySummaryDay = -1;

/**
 * Start the hourly polling loop.
 */
export function startPolling(client: Client): void {
  if (pollInterval) return; // Already running

  console.log('[QuestTracker] Starting hourly polling');

  // Run immediately on start, then every hour
  void runPoll(client);
  pollInterval = setInterval(() => void runPoll(client), POLL_INTERVAL_MS);
}

/**
 * Stop the polling loop (for graceful shutdown).
 */
export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[QuestTracker] Polling stopped');
  }
}

/**
 * Execute a single poll cycle: fetch recent transfers and post digest.
 */
async function runPoll(client: Client): Promise<void> {
  const state = getTrackerState();
  if (!state.channelId) return; // No channel configured

  try {
    const channel = (await client.channels.fetch(state.channelId)) as TextChannel | null;
    if (!channel || !channel.isTextBased()) {
      console.warn('[QuestTracker] Configured channel not found or not text-based');
      return;
    }

    // Fetch transfers since last sync (or last hour)
    const fromDate = state.lastSyncAt
      ? new Date(state.lastSyncAt)
      : new Date(Date.now() - POLL_INTERVAL_MS);

    const now = new Date();

    const [transfers, tokenInfo] = await Promise.all([
      imx.getTransfers({ fromDate, toDate: now, limit: 500 }),
      imx.getTokenInfo(),
    ]);

    // Update last sync time
    setLastSync(now.toISOString());

    // Skip posting if nothing happened
    if (transfers.length === 0) {
      console.log('[QuestTracker] No transfers in last poll cycle — skipping post');
      return;
    }

    // Filter whale transfers
    const whaleTransfers = imx.filterWhaleTransfers(transfers, state.whaleThreshold);

    // Build and send digest embed
    const embed = embeds.hourlyDigestEmbed(transfers, whaleTransfers, tokenInfo);
    await channel.send({ embeds: [embed] });

    console.log(
      `[QuestTracker] Posted hourly digest: ${transfers.length} transfers, ${whaleTransfers.length} whale movements`
    );

    // Also check watchlist wallets for activity
    await postWatchlistAlerts(channel, transfers, state);

    // Post weekly summary on Sundays at the first poll of the day
    const today = new Date();
    if (today.getUTCDay() === 0 && lastWeeklySummaryDay !== today.getUTCDate()) {
      try {
        lastWeeklySummaryDay = today.getUTCDate();
        const summary = await getWeeklySummary();
        await channel.send({ embeds: [summary] });
        console.log('[QuestTracker] Posted weekly summary');
      } catch (err) {
        console.error('[QuestTracker] Failed to post weekly summary:', err);
      }
    }
  } catch (error) {
    console.error('[QuestTracker] Poll error:', error);
  }
}

/**
 * Check if any watchlisted wallets had activity and post alerts.
 */
async function postWatchlistAlerts(
  channel: TextChannel,
  transfers: imx.QuestTransfer[],
  state: { watchlist: Array<{ address: string; label: string }> }
): Promise<void> {
  if (state.watchlist.length === 0) return;

  for (const watched of state.watchlist) {
    const addr = watched.address.toLowerCase();
    const activity = transfers.filter(
      (t) => t.from.toLowerCase() === addr || t.to.toLowerCase() === addr
    );

    if (activity.length === 0) continue;

    const netFlow = imx.calculateNetFlow(activity, watched.address);
    const totalVolume = activity.reduce((sum, t) => sum + t.amount, 0);

    const lines = activity.slice(0, 3).map((t) => {
      const dir = t.from.toLowerCase() === addr ? '→ sent' : '← received';
      return `${dir} **${imx.formatQuest(t.rawAmount)}** QUEST`;
    });

    const embed = embeds.statusEmbed(
      `👁️ ${watched.label} Activity`,
      [
        `**${activity.length}** transfer${activity.length !== 1 ? 's' : ''} · Volume: **${imx.formatQuest(totalVolume * 1e6)}** QUEST`,
        `Net flow: ${netFlow >= 0 ? '+' : ''}${imx.formatQuest(netFlow * 1e6)} QUEST`,
        '',
        ...lines,
        activity.length > 3 ? `...and ${activity.length - 3} more` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );

    await channel.send({ embeds: [embed] });
  }
}
