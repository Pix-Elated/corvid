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

import type { Portfolio, NFTItem, NFTWhale } from './nft-service';

function fmtImx(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(1);
}

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/**
 * Group NFTs by subcategory (e.g. "Small Land", "Medium Land", "Legendary Munk")
 * and return display lines. Only includes groups that have items.
 */
function buildSubcategoryLines(category: string, items: NFTItem[]): string[] {
  const groups = new Map<string, { count: number; paidImx: number; knownCount: number }>();

  for (const item of items) {
    let subKey: string;

    switch (category) {
      case 'land': {
        const size = item.attributes['Size'] || 'Unknown';
        subKey = `${size} Land`;
        break;
      }
      case 'munks': {
        const rarity = item.attributes['Rarity'] || 'Unknown';
        subKey = `${rarity} Munk`;
        break;
      }
      case 'moas': {
        const tier = item.attributes['Tier'];
        subKey = tier ? `Tier ${tier} Moa` : 'Moa';
        break;
      }
      case 'cards': {
        const rarity = item.attributes['Rarity'] || 'Unknown';
        subKey = `${rarity} RavenCard`;
        break;
      }
      case 'cosmetics': {
        const rarity = item.attributes['Rarity'] || '';
        subKey = rarity ? `${rarity} Cosmetic` : 'Cosmetic';
        break;
      }
      default:
        subKey = item.name;
    }

    const existing = groups.get(subKey) || { count: 0, paidImx: 0, knownCount: 0 };
    existing.count++;
    if (item.purchasePriceImx !== null) {
      existing.paidImx += item.purchasePriceImx;
      existing.knownCount++;
    }
    groups.set(subKey, existing);
  }

  // Sort: land by size order, others alphabetically
  const entries = [...groups.entries()];
  if (category === 'land') {
    const sizeOrder = ['Small', 'Medium', 'Large', 'Stronghold', 'Fort'];
    entries.sort((a, b) => {
      const aIdx = sizeOrder.findIndex((s) => a[0].startsWith(s));
      const bIdx = sizeOrder.findIndex((s) => b[0].startsWith(s));
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
  } else if (category === 'moas') {
    entries.sort((a, b) => {
      const aNum = parseInt(a[0].match(/\d+/)?.[0] || '99');
      const bNum = parseInt(b[0].match(/\d+/)?.[0] || '99');
      return aNum - bNum;
    });
  } else {
    const rarityOrder = ['Common', 'Uncommon', 'Grand', 'Rare', 'Arcane', 'Mythic', 'Legendary'];
    entries.sort((a, b) => {
      const aIdx = rarityOrder.findIndex((r) => a[0].startsWith(r));
      const bIdx = rarityOrder.findIndex((r) => b[0].startsWith(r));
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
  }

  return entries.map(([name, data]) => {
    const paidStr = data.knownCount > 0 ? ` — paid **${fmtImx(data.paidImx)} IMX**` : '';
    return `${data.count}× ${name}${paidStr}`;
  });
}

/**
 * Build the portfolio summary embed.
 * Groups by subcategory, only shows what exists.
 */
export function portfolioEmbed(portfolio: Portfolio): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🎒 NFT Portfolio — ${shortAddr(portfolio.wallet)}`)
    .setURL(`${EXPLORER_BASE}/address/${portfolio.wallet}`)
    .setColor(QUEST_COLOR);

  // Build subcategory breakdown per collection (only if items exist)
  for (const cat of portfolio.categories) {
    const emoji = getCategoryEmoji(cat.category);
    const lines = buildSubcategoryLines(cat.category, cat.items);
    if (lines.length === 0) continue;

    const floorStr =
      cat.floor?.floorImx !== null && cat.floor?.floorImx !== undefined
        ? ` · floor ${cat.floor.floorImx.toFixed(1)} IMX`
        : '';

    embed.addFields({
      name: `${emoji} ${cat.name} (${cat.count})${floorStr}`,
      value: lines.join('\n'),
    });
  }

  // Totals
  const totalPaidStr =
    portfolio.priceKnownCount > 0
      ? `**${fmtImx(portfolio.totalCostImx)} IMX** (~${fmtUsd(portfolio.totalCostUsd)})`
      : 'Unknown';

  const currentValueStr =
    portfolio.totalValueImx > 0
      ? `**${fmtImx(portfolio.totalValueImx)} IMX** (~${fmtUsd(portfolio.totalValueUsd)})`
      : 'N/A';

  embed.addFields(
    { name: 'Total Paid', value: totalPaidStr, inline: true },
    { name: 'Current Value', value: currentValueStr, inline: true }
  );

  // P&L if we have both cost and value
  if (portfolio.priceKnownCount > 0 && portfolio.totalValueImx > 0) {
    const pnlImx = portfolio.totalValueImx - portfolio.totalCostImx;
    const pnlUsd = portfolio.totalValueUsd - portfolio.totalCostUsd;
    const sign = pnlImx >= 0 ? '+' : '';
    const icon = pnlImx >= 0 ? '🟢' : '🔴';
    embed.addFields({
      name: `${icon} P&L`,
      value: `${sign}${fmtImx(pnlImx)} IMX (~${sign}${fmtUsd(pnlUsd)})`,
      inline: true,
    });
  }

  embed
    .setFooter({
      text: `IMX: $${portfolio.imxPrice.toFixed(2)} · ${portfolio.priceKnownCount}/${portfolio.totalNFTs} purchase prices known`,
    })
    .setTimestamp();

  return embed;
}

/**
 * Build the NFT whale leaderboard embed.
 */
export function nftWhalesEmbed(whales: NFTWhale[]): EmbedBuilder {
  const lines = whales.map((w, i) => {
    const rank = `\`${String(i + 1).padStart(2)}\``;
    const addr = `[${shortAddr(w.wallet)}](${EXPLORER_BASE}/address/${w.wallet})`;
    const parts = Object.entries(w.breakdown)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${count} ${name}`)
      .join(', ');
    return `${rank} ${addr} — **${w.totalNFTs}** NFTs\n${' '.repeat(5)}${parts}`;
  });

  return new EmbedBuilder()
    .setTitle('🐋 Top RavenQuest NFT Holders')
    .setColor(QUEST_COLOR)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Excludes ecosystem wallets (vaults, pools, burn)' })
    .setTimestamp();
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
