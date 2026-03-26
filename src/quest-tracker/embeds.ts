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

// ─── NFT Portfolio Embeds ───────────────────────────────────────────────────

import type { Portfolio, PortfolioCategory } from './nft-service';

function fmtImx(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(1);
}

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/**
 * Build the main portfolio summary embed.
 */
export function portfolioEmbed(portfolio: Portfolio): EmbedBuilder {
  const pnlImx = portfolio.totalValueImx - portfolio.totalCostImx;
  const pnlUsd = portfolio.totalValueUsd - portfolio.totalCostUsd;
  const roi =
    portfolio.totalCostUsd > 0
      ? ((portfolio.totalValueUsd - portfolio.totalCostUsd) / portfolio.totalCostUsd) * 100
      : null;

  const embed = new EmbedBuilder()
    .setTitle(`🎒 NFT Portfolio — ${shortAddr(portfolio.wallet)}`)
    .setURL(`${EXPLORER_BASE}/address/${portfolio.wallet}`)
    .setColor(QUEST_COLOR)
    .addFields(
      {
        name: 'Total NFTs',
        value: `**${portfolio.totalNFTs}**`,
        inline: true,
      },
      {
        name: 'Current Value',
        value: `**${fmtImx(portfolio.totalValueImx)} IMX**\n~${fmtUsd(portfolio.totalValueUsd)}`,
        inline: true,
      },
      {
        name: 'Total Paid',
        value:
          portfolio.priceKnownCount > 0
            ? `**${fmtImx(portfolio.totalCostImx)} IMX**\n~${fmtUsd(portfolio.totalCostUsd)}`
            : 'Unknown',
        inline: true,
      }
    );

  // P&L if we have cost data
  if (portfolio.priceKnownCount > 0 && roi !== null) {
    const sign = pnlImx >= 0 ? '+' : '';
    const color = pnlImx >= 0 ? '🟢' : '🔴';
    embed.addFields({
      name: `${color} P&L`,
      value: `${sign}${fmtImx(pnlImx)} IMX (~${sign}${fmtUsd(pnlUsd)})\nROI: ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
      inline: false,
    });
  }

  // Category breakdown
  const lines = portfolio.categories.map((cat) => {
    const floorStr = cat.floor?.floorImx
      ? `${cat.floor.floorImx.toFixed(1)} IMX floor`
      : 'no floor';
    const costStr = cat.priceKnownCount > 0 ? ` · paid ${fmtImx(cat.totalCostImx)} IMX` : '';
    return `**${cat.name}** — ${cat.count} NFT${cat.count !== 1 ? 's' : ''} (${floorStr}${costStr})`;
  });

  if (lines.length > 0) {
    embed.addFields({ name: 'Collections', value: lines.join('\n') });
  }

  embed
    .setFooter({
      text: `IMX: $${portfolio.imxPrice.toFixed(2)} · ${portfolio.priceKnownCount}/${portfolio.totalNFTs} prices known`,
    })
    .setTimestamp();

  return embed;
}

/**
 * Build a detailed category embed (for /nft detail <category>).
 */
export function categoryDetailEmbed(
  category: PortfolioCategory,
  wallet: string,
  imxPrice: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${getCategoryEmoji(category.category)} ${category.name} — ${shortAddr(wallet)}`)
    .setURL(`${EXPLORER_BASE}/address/${wallet}`)
    .setColor(getCategoryColor(category.category));

  // Floor info
  if (category.floor) {
    embed.addFields(
      {
        name: 'Floor',
        value: category.floor.floorImx
          ? `${category.floor.floorImx.toFixed(1)} IMX (~${fmtUsd(category.floor.floorUsd || 0)})`
          : 'None listed',
        inline: true,
      },
      {
        name: 'Collection Value',
        value:
          category.floor.floorImx !== null
            ? `${fmtImx(category.count * category.floor.floorImx)} IMX`
            : 'N/A',
        inline: true,
      },
      {
        name: 'Total Paid',
        value:
          category.priceKnownCount > 0
            ? `${fmtImx(category.totalCostImx)} IMX (~${fmtUsd(category.totalCostUsd)})`
            : 'Unknown',
        inline: true,
      }
    );
  }

  // List items (max 15)
  const items = category.items.slice(0, 15);
  const itemLines = items.map((item) => {
    const attrs = [];
    if (item.attributes['Rarity']) attrs.push(item.attributes['Rarity']);
    if (item.attributes['Size']) attrs.push(item.attributes['Size']);
    if (item.attributes['Tier']) attrs.push(`T${item.attributes['Tier']}`);
    if (item.attributes['Perk']) attrs.push(item.attributes['Perk']);
    const attrStr = attrs.length > 0 ? ` (${attrs.join(', ')})` : '';
    const deposit = item.depositState === 'deposited' ? ' 🎮' : '';
    const price =
      item.purchasePriceImx !== null ? ` — paid ${item.purchasePriceImx.toFixed(1)} IMX` : '';
    return `• ${item.name}${attrStr}${deposit}${price}`;
  });

  if (category.items.length > 15) {
    itemLines.push(`*...and ${category.items.length - 15} more*`);
  }

  if (itemLines.length > 0) {
    embed.addFields({ name: `Items (${category.count})`, value: itemLines.join('\n') });
  }

  embed
    .setFooter({
      text: `🎮 = deposited in-game · IMX: $${imxPrice.toFixed(2)}`,
    })
    .setTimestamp();

  return embed;
}

function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    land: '🏡',
    munks: '🐵',
    moas: '🦅',
    cards: '🃏',
    cosmetics: '👗',
  };
  return map[category] || '📦';
}

function getCategoryColor(category: string): number {
  const map: Record<string, number> = {
    land: 0x2ecc71, // Green
    munks: 0xe67e22, // Orange
    moas: 0x3498db, // Blue
    cards: 0x9b59b6, // Purple
    cosmetics: 0xe91e63, // Pink
  };
  return map[category] || QUEST_COLOR;
}
