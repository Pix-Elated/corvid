/**
 * Discord embed builders for QUEST tracker displays.
 */
import { EmbedBuilder } from 'discord.js';
import {
  QuestTransfer,
  QuestHolder,
  QuestTokenInfo,
  formatQuest,
  shortAddr,
  getVolumeSummary,
  calculateNetFlow,
} from './imx-service';

const QUEST_COLOR = 0xc9a959; // Gold
const WHALE_COLOR = 0xe74c3c; // Red
const INFO_COLOR = 0x3498db; // Blue
const SUCCESS_COLOR = 0x2ecc71; // Green

const EXPLORER_BASE = 'https://explorer.immutable.com';

function txLink(hash: string): string {
  return `[${hash.slice(0, 10)}...](${EXPLORER_BASE}/tx/${hash})`;
}

function addrLink(addr: string, label?: string): string {
  const display = label || shortAddr(addr);
  return `[${display}](${EXPLORER_BASE}/address/${addr})`;
}

/**
 * Build wallet summary embed.
 */
export function walletEmbed(
  address: string,
  balance: number,
  transfers: QuestTransfer[],
  label?: string
): EmbedBuilder {
  const net7d = calculateNetFlow(transfers, address);
  const sent = transfers.filter((t) => t.from.toLowerCase() === address.toLowerCase());
  const received = transfers.filter((t) => t.to.toLowerCase() === address.toLowerCase());

  const embed = new EmbedBuilder()
    .setTitle(`${label ? `${label} — ` : ''}${shortAddr(address)}`)
    .setURL(`${EXPLORER_BASE}/address/${address}`)
    .setColor(INFO_COLOR)
    .addFields(
      { name: 'Balance', value: `**${formatQuest(balance * 1e6)}** QUEST`, inline: true },
      {
        name: 'Net Flow (recent)',
        value: `${net7d >= 0 ? '+' : ''}${formatQuest(net7d * 1e6)} QUEST`,
        inline: true,
      },
      {
        name: 'Transfers',
        value: `${sent.length} sent · ${received.length} received`,
        inline: true,
      }
    );

  // Last 5 transfers
  if (transfers.length > 0) {
    const recent = transfers.slice(0, 5);
    const lines = recent.map((t) => {
      const dir = t.from.toLowerCase() === address.toLowerCase() ? '→' : '←';
      const other = dir === '→' ? t.to : t.from;
      return `${dir} **${formatQuest(t.rawAmount)}** ${dir === '→' ? 'to' : 'from'} ${addrLink(other)} ${txLink(t.txHash)}`;
    });
    embed.addFields({ name: 'Recent Transfers', value: lines.join('\n') });
  }

  embed.setFooter({ text: 'QUEST on Immutable zkEVM' }).setTimestamp();
  return embed;
}

/**
 * Build whale holders leaderboard embed.
 */
export function whalesEmbed(holders: QuestHolder[], tokenInfo: QuestTokenInfo): EmbedBuilder {
  const lines = holders.map((h, i) => {
    const rank = `\`${String(i + 1).padStart(2)}\``;
    const label = h.name || shortAddr(h.address);
    const pct = h.percentOfSupply.toFixed(1);
    const tag = h.isContract ? ' 📄' : '';
    return `${rank} ${addrLink(h.address, label)}${tag} — **${formatQuest(h.rawBalance)}** (${pct}%)`;
  });

  return new EmbedBuilder()
    .setTitle('🐋 Top QUEST Holders')
    .setColor(QUEST_COLOR)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Total Supply', value: formatQuest(tokenInfo.totalSupply * 1e6), inline: true },
      { name: 'Holders', value: tokenInfo.holders.toLocaleString(), inline: true },
      {
        name: 'Price',
        value: tokenInfo.price ? `$${tokenInfo.price.toFixed(4)}` : 'N/A',
        inline: true,
      }
    )
    .setFooter({ text: 'Source: Immutable zkEVM Blockscout' })
    .setTimestamp();
}

/**
 * Build large transfers list embed.
 */
export function transfersEmbed(transfers: QuestTransfer[], period: string): EmbedBuilder {
  const summary = getVolumeSummary(transfers);

  const embed = new EmbedBuilder()
    .setTitle(`📊 Largest QUEST Transfers — ${period}`)
    .setColor(WHALE_COLOR)
    .addFields(
      {
        name: 'Total Volume',
        value: `**${formatQuest(summary.totalVolume * 1e6)}** QUEST`,
        inline: true,
      },
      { name: 'Transfers', value: summary.transferCount.toLocaleString(), inline: true },
      {
        name: 'Unique Wallets',
        value: `${summary.uniqueSenders} senders · ${summary.uniqueReceivers} receivers`,
        inline: true,
      }
    );

  // Top 10 largest
  const top = transfers.sort((a, b) => b.amount - a.amount).slice(0, 10);
  if (top.length > 0) {
    const lines = top.map((t, i) => {
      const ts = t.timestamp ? `<t:${Math.floor(new Date(t.timestamp).getTime() / 1000)}:R>` : '';
      return `**${i + 1}.** ${formatQuest(t.rawAmount)} — ${addrLink(t.from)} → ${addrLink(t.to)} ${ts}`;
    });
    embed.addFields({ name: 'Top Transfers', value: lines.join('\n') });
  } else {
    embed.addFields({ name: 'Top Transfers', value: 'No transfers in this period' });
  }

  embed.setFooter({ text: 'QUEST on Immutable zkEVM' }).setTimestamp();
  return embed;
}

/**
 * Build volume/flow summary embed (for auto-channel hourly posts).
 */
export function hourlyDigestEmbed(
  transfers: QuestTransfer[],
  whaleTransfers: QuestTransfer[],
  tokenInfo: QuestTokenInfo
): EmbedBuilder {
  const summary = getVolumeSummary(transfers);

  const embed = new EmbedBuilder()
    .setTitle('⏰ QUEST Hourly Digest')
    .setColor(QUEST_COLOR)
    .addFields(
      {
        name: 'Volume',
        value: `**${formatQuest(summary.totalVolume * 1e6)}** QUEST`,
        inline: true,
      },
      { name: 'Transfers', value: summary.transferCount.toLocaleString(), inline: true },
      {
        name: 'Price',
        value: tokenInfo.price ? `$${tokenInfo.price.toFixed(4)}` : 'N/A',
        inline: true,
      }
    );

  // Whale movements
  if (whaleTransfers.length > 0) {
    const lines = whaleTransfers.slice(0, 5).map((t) => {
      return `**${formatQuest(t.rawAmount)}** — ${addrLink(t.from)} → ${addrLink(t.to)}`;
    });
    embed.addFields({
      name: `🐋 Whale Movements (${whaleTransfers.length})`,
      value: lines.join('\n'),
    });
  } else {
    embed.addFields({ name: '🐋 Whale Movements', value: 'No large transfers this hour' });
  }

  // Largest single transfer
  if (summary.largestTransfer) {
    const t = summary.largestTransfer;
    embed.addFields({
      name: '🏆 Largest Transfer',
      value: `**${formatQuest(t.rawAmount)}** — ${addrLink(t.from)} → ${addrLink(t.to)} ${txLink(t.txHash)}`,
    });
  }

  embed
    .setFooter({ text: `${summary.uniqueSenders} senders · ${summary.uniqueReceivers} receivers` })
    .setTimestamp();
  return embed;
}

/**
 * Build price/overview embed.
 */
export function priceEmbed(tokenInfo: QuestTokenInfo): EmbedBuilder {
  const mcap = tokenInfo.price ? tokenInfo.price * tokenInfo.totalSupply : 0;

  return new EmbedBuilder()
    .setTitle('💰 QUEST Token Overview')
    .setColor(QUEST_COLOR)
    .addFields(
      {
        name: 'Price',
        value: tokenInfo.price ? `**$${tokenInfo.price.toFixed(4)}**` : 'N/A',
        inline: true,
      },
      {
        name: 'Market Cap',
        value: mcap > 0 ? `$${(mcap / 1000).toFixed(0)}K` : 'N/A',
        inline: true,
      },
      { name: 'Supply', value: formatQuest(tokenInfo.totalSupply * 1e6), inline: true },
      { name: 'Holders', value: tokenInfo.holders.toLocaleString(), inline: true },
      { name: 'Total Transfers', value: tokenInfo.transfers.toLocaleString(), inline: true }
    )
    .setFooter({ text: 'QUEST on Immutable zkEVM' })
    .setTimestamp();
}

/**
 * Simple confirmation/status embed.
 */
export function statusEmbed(title: string, description: string, success = true): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(success ? SUCCESS_COLOR : WHALE_COLOR)
    .setTimestamp();
}
