/**
 * Treasury Surveillance — monitors RQ ecosystem wallets every 6 hours.
 * Reports QUEST movements to/from treasury & game vaults, where it went,
 * volume, and current balances.
 */
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import * as imx from './imx-service';
import { getTokenPrices } from './nft-service';
import { KNOWN_ADDRESSES, type KnownAddress } from './known-addresses';
import { getTrackerState } from './state';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let interval: NodeJS.Timeout | null = null;

/** Wallets to surveil — treasury, game vaults, and flagged liquidity actors */
const WATCHED_TYPES = new Set(['treasury', 'game']);
/** Additional addresses to watch regardless of type */
const EXTRA_WATCH = new Set([
  '0x89142e95d3124f766d840fc7bc16b4b7734cc3d9', // Potentially: Market Maker / Arb Bot — 182M volume
]);
const WATCHED_WALLETS = KNOWN_ADDRESSES.filter(
  (a) => WATCHED_TYPES.has(a.type) || EXTRA_WATCH.has(a.address)
);

export function startTreasuryWatch(client: Client): void {
  if (interval) return;
  console.log('[TreasuryWatch] Starting 6-hour surveillance');
  // Run first report after 1 minute (let bot settle), then every 6 hours
  setTimeout(() => void runReport(client), 60_000);
  interval = setInterval(() => void runReport(client), SIX_HOURS_MS);
}

export function stopTreasuryWatch(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
    console.log('[TreasuryWatch] Stopped');
  }
}

interface WalletReport {
  wallet: KnownAddress;
  balance: number;
  transfers: imx.QuestTransfer[];
  totalOut: number;
  totalIn: number;
  netFlow: number;
  topRecipients: Array<{ address: string; amount: number }>;
  topSenders: Array<{ address: string; amount: number }>;
}

async function runReport(client: Client): Promise<void> {
  const state = getTrackerState();
  if (!state.channelId) return;

  try {
    const channel = (await client.channels.fetch(state.channelId)) as TextChannel | null;
    if (!channel?.isTextBased()) return;

    const fromDate = new Date(Date.now() - SIX_HOURS_MS);
    const prices = await getTokenPrices();

    // Fetch ALL QUEST transfers once, then filter per wallet
    const allTransfers = await imx.getTransfers({ fromDate, limit: 500 });

    const reports: WalletReport[] = [];

    for (const wallet of WATCHED_WALLETS) {
      try {
        // 2s between Blockscout balance calls — unauthenticated public API
        if (reports.length > 0) await new Promise((r) => setTimeout(r, 2000));
        const balance = await imx.getWalletBalance(wallet.address);

        // Filter transfers involving THIS wallet
        const addr = wallet.address.toLowerCase();
        const transfers = allTransfers.filter(
          (t) => t.from.toLowerCase() === addr || t.to.toLowerCase() === addr
        );

        let totalOut = 0;
        let totalIn = 0;
        const recipientMap = new Map<string, number>();
        const senderMap = new Map<string, number>();

        for (const t of transfers) {
          if (t.from.toLowerCase() === addr) {
            totalOut += t.amount;
            const to = t.to.toLowerCase();
            recipientMap.set(to, (recipientMap.get(to) || 0) + t.amount);
          }
          if (t.to.toLowerCase() === addr) {
            totalIn += t.amount;
            const from = t.from.toLowerCase();
            senderMap.set(from, (senderMap.get(from) || 0) + t.amount);
          }
        }

        const topRecipients = [...recipientMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([address, amount]) => ({ address, amount }));

        const topSenders = [...senderMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([address, amount]) => ({ address, amount }));

        reports.push({
          wallet,
          balance,
          transfers,
          totalOut,
          totalIn,
          netFlow: totalIn - totalOut,
          topRecipients,
          topSenders,
        });
      } catch (error) {
        console.error(`[TreasuryWatch] Failed to fetch ${wallet.label}:`, error);
      }
    }

    // Skip if zero activity across all wallets
    const totalTransfers = reports.reduce((sum, r) => sum + r.transfers.length, 0);
    if (totalTransfers === 0) {
      console.log('[TreasuryWatch] No treasury activity in last 6 hours — skipping');
      return;
    }

    const embed = buildReportEmbed(reports, prices);
    await channel.send({ embeds: [embed] });

    console.log(
      `[TreasuryWatch] Report posted: ${reports.length} wallets, ${totalTransfers} transfers`
    );
  } catch (error) {
    console.error('[TreasuryWatch] Report error:', error);
  }
}

function buildReportEmbed(
  reports: WalletReport[],
  prices: { imx: number; usdc: number; quest: number }
): EmbedBuilder {
  const questPrice = prices.quest || 0;
  const embed = new EmbedBuilder()
    .setTitle('🏛️ Treasury Surveillance — 6hr Report')
    .setColor(0xe74c3c)
    .setTimestamp();

  for (const r of reports) {
    if (r.transfers.length === 0) continue;

    const balUsd = r.balance * questPrice;
    const netSign = r.netFlow >= 0 ? '+' : '';

    const lines: string[] = [];
    lines.push(`Balance: **${fmtQuest(r.balance)}** (~$${fmtUsd(balUsd)})`);
    lines.push(
      `Out: **${fmtQuest(r.totalOut)}** · In: **${fmtQuest(r.totalIn)}** · Net: ${netSign}${fmtQuest(r.netFlow)}`
    );
    lines.push(`Transfers: ${r.transfers.length}`);

    if (r.topRecipients.length > 0) {
      lines.push('');
      lines.push('**Sent to:**');
      for (const rec of r.topRecipients) {
        lines.push(
          `  → ${imx.shortAddr(rec.address)} — ${fmtQuest(rec.amount)} (~$${fmtUsd(rec.amount * questPrice)})`
        );
      }
    }

    if (r.topSenders.length > 0) {
      lines.push('');
      lines.push('**Received from:**');
      for (const snd of r.topSenders) {
        lines.push(
          `  ← ${imx.shortAddr(snd.address)} — ${fmtQuest(snd.amount)} (~$${fmtUsd(snd.amount * questPrice)})`
        );
      }
    }

    const emoji = r.wallet.type === 'treasury' ? '🏦' : '🎮';
    embed.addFields({
      name: `${emoji} ${r.wallet.label}`,
      value: lines.join('\n'),
    });
  }

  // Summary
  const totalOut = reports.reduce((s, r) => s + r.totalOut, 0);
  const totalIn = reports.reduce((s, r) => s + r.totalIn, 0);
  const totalTransfers = reports.reduce((s, r) => s + r.transfers.length, 0);

  embed.setFooter({
    text: `${totalTransfers} transfers · ${fmtQuest(totalOut)} out · ${fmtQuest(totalIn)} in · QUEST: $${questPrice.toFixed(4)}`,
  });

  return embed;
}

function fmtQuest(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M QUEST`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}K QUEST`;
  return `${amount.toFixed(0)} QUEST`;
}

function fmtUsd(amount: number): string {
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(2);
}
