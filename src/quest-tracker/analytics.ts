/**
 * QUEST analytics — supply breakdown, buy/sell pressure, holder stats,
 * volume trends, and weekly summaries.
 */
import { EmbedBuilder } from 'discord.js';
import * as imx from './imx-service';
import { getTokenPrices } from './nft-service';
import { KNOWN_ADDRESSES } from './known-addresses';

// ─── Supply Breakdown ───────────────────────────────────────────────────────

interface SupplyBreakdown {
  totalSupply: number;
  burned: number;
  inPools: number;
  inTreasury: number;
  inKnownWallets: number; // other identified wallets (bots, distributors)
  publicFloat: number; // everything not accounted for above
  holders: number;
  price: number;
}

export async function getSupplyBreakdown(): Promise<SupplyBreakdown> {
  const info = await imx.getTokenInfo();
  const prices = await getTokenPrices();

  // Get QUEST balances for all known wallets
  const buckets = { burned: 0, pools: 0, treasury: 0, other: 0 };

  for (const addr of KNOWN_ADDRESSES) {
    // 2s between each Blockscout call — unauthenticated public API
    if (addr !== KNOWN_ADDRESSES[0]) await new Promise((r) => setTimeout(r, 2000));

    const balance = await imx.getWalletBalance(addr.address);
    switch (addr.type) {
      case 'burn':
        buckets.burned += balance;
        break;
      case 'liquidity':
        buckets.pools += balance;
        break;
      case 'treasury':
      case 'game':
        buckets.treasury += balance;
        break;
    }
  }

  const accounted = buckets.burned + buckets.pools + buckets.treasury;
  const publicFloat = Math.max(0, info.totalSupply - accounted);

  return {
    totalSupply: info.totalSupply,
    burned: buckets.burned,
    inPools: buckets.pools,
    inTreasury: buckets.treasury,
    inKnownWallets: 0, // reserved for future identified wallets
    publicFloat,
    holders: info.holders,
    price: prices.quest || 0,
  };
}

export function supplyEmbed(s: SupplyBreakdown): EmbedBuilder {
  const pct = (n: number): string => ((n / s.totalSupply) * 100).toFixed(1) + '%';
  const fmt = (n: number): string => {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  };
  const mcap = s.publicFloat * s.price;

  const bar = (n: number): string => {
    const filled = Math.round((n / s.totalSupply) * 20);
    return '█'.repeat(filled) + '░'.repeat(20 - filled);
  };

  return new EmbedBuilder()
    .setTitle('📊 QUEST Supply Breakdown')
    .setColor(0xc9a959)
    .setDescription(
      `Total Supply: **${fmt(s.totalSupply)}** QUEST\n` +
        `Price: **$${s.price.toFixed(4)}** · MCap: **$${fmt(mcap)}**\n` +
        `Holders: **${s.holders.toLocaleString()}**`
    )
    .addFields(
      {
        name: '🔥 Burned',
        value: `\`${bar(s.burned)}\` **${fmt(s.burned)}** (${pct(s.burned)})`,
      },
      {
        name: '💧 Liquidity Pools',
        value: `\`${bar(s.inPools)}\` **${fmt(s.inPools)}** (${pct(s.inPools)})`,
      },
      {
        name: '🏦 Team / Treasury',
        value: `\`${bar(s.inTreasury)}\` **${fmt(s.inTreasury)}** (${pct(s.inTreasury)})`,
      },
      {
        name: '🌊 Public Float',
        value: `\`${bar(s.publicFloat)}\` **${fmt(s.publicFloat)}** (${pct(s.publicFloat)})`,
      }
    )
    .setFooter({
      text: 'Public Float = Total − Burned − Pools − Team wallets · QUEST on Immutable zkEVM',
    })
    .setTimestamp();
}

// ─── Buy/Sell Pressure ──────────────────────────────────────────────────────

interface PressureData {
  period: string;
  intoPool: number; // QUEST entering pools = sell pressure
  outOfPool: number; // QUEST leaving pools = buy pressure
  netPressure: number; // positive = buy pressure
  transferCount: number;
  uniqueBuyers: number;
  uniqueSellers: number;
}

const POOL_ADDRESSES = new Set(
  KNOWN_ADDRESSES.filter((a) => a.type === 'liquidity').map((a) => a.address.toLowerCase())
);

export async function getBuySellPressure(hours = 24): Promise<PressureData> {
  const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  const transfers = await imx.getTransfers({ fromDate, limit: 500 });

  let intoPool = 0;
  let outOfPool = 0;
  const buyers = new Set<string>();
  const sellers = new Set<string>();

  for (const t of transfers) {
    const fromPool = POOL_ADDRESSES.has(t.from.toLowerCase());
    const toPool = POOL_ADDRESSES.has(t.to.toLowerCase());

    if (toPool && !fromPool) {
      // User sending TO pool = selling QUEST
      intoPool += t.amount;
      sellers.add(t.from.toLowerCase());
    }
    if (fromPool && !toPool) {
      // Pool sending TO user = user buying QUEST
      outOfPool += t.amount;
      buyers.add(t.to.toLowerCase());
    }
  }

  const period = hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`;

  return {
    period,
    intoPool,
    outOfPool,
    netPressure: outOfPool - intoPool,
    transferCount: transfers.length,
    uniqueBuyers: buyers.size,
    uniqueSellers: sellers.size,
  };
}

export function pressureEmbed(p: PressureData): EmbedBuilder {
  const fmt = (n: number): string => {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  };

  const bullish = p.netPressure > 0;
  const icon = bullish ? '🟢' : '🔴';
  const label = bullish ? 'Net Buy Pressure' : 'Net Sell Pressure';
  const ratio =
    p.intoPool > 0 ? (p.outOfPool / p.intoPool).toFixed(2) : p.outOfPool > 0 ? '∞' : '—';

  return new EmbedBuilder()
    .setTitle(`📈 QUEST Buy/Sell Pressure — Last ${p.period}`)
    .setColor(bullish ? 0x22c55e : 0xef4444)
    .addFields(
      {
        name: '🟢 Buy Volume (out of pools)',
        value: `**${fmt(p.outOfPool)}** QUEST · ${p.uniqueBuyers} buyers`,
        inline: true,
      },
      {
        name: '🔴 Sell Volume (into pools)',
        value: `**${fmt(p.intoPool)}** QUEST · ${p.uniqueSellers} sellers`,
        inline: true,
      },
      {
        name: `${icon} ${label}`,
        value: `**${fmt(Math.abs(p.netPressure))}** QUEST\nBuy/Sell ratio: **${ratio}**`,
        inline: true,
      }
    )
    .addFields({
      name: 'Activity',
      value: `${p.transferCount} transfers in period`,
    })
    .setFooter({ text: 'Based on QUEST flows to/from liquidity pools' })
    .setTimestamp();
}

// ─── Holder Stats ───────────────────────────────────────────────────────────

interface HolderStats {
  totalHolders: number;
  top10Pct: number;
  top50Pct: number;
  top100Pct: number;
  totalSupply: number;
}

export async function getHolderStats(): Promise<HolderStats> {
  const info = await imx.getTokenInfo();
  const holders = await imx.getHolders(50); // Top 50 (already filters known addresses)

  const top10 = holders.slice(0, 10).reduce((s, h) => s + h.balance, 0);
  const top50 = holders.reduce((s, h) => s + h.balance, 0);

  return {
    totalHolders: info.holders,
    top10Pct: info.totalSupply > 0 ? (top10 / info.totalSupply) * 100 : 0,
    top50Pct: info.totalSupply > 0 ? (top50 / info.totalSupply) * 100 : 0,
    top100Pct: 0, // Would need 100 holders — skip for now
    totalSupply: info.totalSupply,
  };
}

export function holderStatsEmbed(s: HolderStats): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('👥 QUEST Holder Distribution')
    .setColor(0x3498db)
    .addFields(
      { name: 'Total Holders', value: `**${s.totalHolders.toLocaleString()}**`, inline: true },
      {
        name: 'Top 10 Concentration',
        value: `**${s.top10Pct.toFixed(1)}%** of supply`,
        inline: true,
      },
      {
        name: 'Top 50 Concentration',
        value: `**${s.top50Pct.toFixed(1)}%** of supply`,
        inline: true,
      }
    )
    .setFooter({ text: 'Excludes ecosystem wallets (pools, vaults, burn)' })
    .setTimestamp();
}

// ─── Weekly Summary ─────────────────────────────────────────────────────────

export async function getWeeklySummary(): Promise<EmbedBuilder> {
  const [supply, pressure7d, pressure24h, holderStats] = await Promise.all([
    getSupplyBreakdown(),
    getBuySellPressure(168), // 7 days
    getBuySellPressure(24),
    getHolderStats(),
  ]);

  const fmt = (n: number): string => {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  };

  const bullish7d = pressure7d.netPressure > 0;
  const bullish24h = pressure24h.netPressure > 0;

  const embed = new EmbedBuilder().setTitle('📋 QUEST Weekly Summary').setColor(0xc9a959);

  const mcap = supply.publicFloat * supply.price;
  embed
    .setDescription(
      `Price: **$${supply.price.toFixed(4)}** · MCap: **$${fmt(mcap)}**\n` +
        `Holders: **${supply.holders.toLocaleString()}** · Supply: **${fmt(supply.totalSupply)}**`
    )
    .addFields(
      {
        name: '🌊 Supply Distribution',
        value: [
          `Public Float: **${fmt(supply.publicFloat)}** (${((supply.publicFloat / supply.totalSupply) * 100).toFixed(1)}%)`,
          `Pools: ${fmt(supply.inPools)} · Team: ${fmt(supply.inTreasury)}`,
          `Burned: ${fmt(supply.burned)}`,
        ].join('\n'),
      },
      {
        name: `${bullish7d ? '🟢' : '🔴'} 7-Day Pressure`,
        value: `Buy: **${fmt(pressure7d.outOfPool)}** (${pressure7d.uniqueBuyers} buyers)\nSell: **${fmt(pressure7d.intoPool)}** (${pressure7d.uniqueSellers} sellers)\nNet: **${bullish7d ? '+' : ''}${fmt(pressure7d.netPressure)}**`,
        inline: true,
      },
      {
        name: `${bullish24h ? '🟢' : '🔴'} 24h Pressure`,
        value: `Buy: **${fmt(pressure24h.outOfPool)}** (${pressure24h.uniqueBuyers} buyers)\nSell: **${fmt(pressure24h.intoPool)}** (${pressure24h.uniqueSellers} sellers)\nNet: **${bullish24h ? '+' : ''}${fmt(pressure24h.netPressure)}**`,
        inline: true,
      },
      {
        name: '👥 Concentration',
        value: `Top 10: **${holderStats.top10Pct.toFixed(1)}%** · Top 50: **${holderStats.top50Pct.toFixed(1)}%**`,
      }
    )
    .setFooter({ text: 'QUEST on Immutable zkEVM · Excludes ecosystem wallets' })
    .setTimestamp();

  return embed;
}
