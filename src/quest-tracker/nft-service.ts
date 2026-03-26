/**
 * NFT portfolio lookup for RavenQuest collections on Immutable zkEVM.
 * Streamlined version of ravenquest-companion's portfolio-service for Discord.
 */
import * as knownAddresses from './known-addresses';

const CHAIN = 'imtbl-zkevm-mainnet';
const IMX_BASE = 'https://api.immutable.com/v1/chains';
/** RavenQuest NFT collections on Immutable zkEVM */
export const RQ_COLLECTIONS: Record<string, { name: string; category: string; slug: string }> = {
  '0x62f2966c417df805d2bc3b685a87c2ab3800fee9': {
    name: 'Land',
    category: 'land',
    slug: 'RavenQuestLand',
  },
  '0xb254d62afe0432214db60c457a4d751c655cfbde': {
    name: 'RavenCards',
    category: 'cards',
    slug: 'RavenQuestRavenCards',
  },
  '0x924904fbcd172b79261307063518d12310ab1bb8': {
    name: 'Cosmetics',
    category: 'cosmetics',
    slug: 'RavenQuestCosmetics',
  },
  '0x024720ccabf02a002c279b0e84b62b572cfeeaa0': {
    name: 'Munks',
    category: 'munks',
    slug: 'RavenQuestMunks',
  },
  '0xb43b3eb53a09abef18eed9d9901a7df1bd3f327a': {
    name: 'Moas',
    category: 'moas',
    slug: 'RavenQuestMoas',
  },
};

/** ERC-20 token addresses on Immutable zkEVM */
const ERC20_MAP: Record<string, { symbol: string; decimals: number }> = {
  '0x6de8acc0d406837030ce4dd28e7c08c5a96a30d2': { symbol: 'USDC', decimals: 6 },
  '0x52a6c53869ce09a731cd772f245b97a4401d3348': { symbol: 'USDC', decimals: 6 },
  '0x3a0c2ba54d6cbd3121f01b96dfd20e99d1696c9d': { symbol: 'IMX', decimals: 18 },
  '0x8a1e8cf52954c8d72907774d4b2b81f38dd1c5c4': { symbol: 'QUEST', decimals: 6 },
};

/** Game deposit custody addresses */
const DEPOSIT_ADDRESSES = new Set([
  '0xe597f8370e99fe87de34e0c0fa863920cb39ca02',
  '0x7959c306cce2f25d4553b2c786a852d0801a3638',
]);

function getHeaders(): Record<string, string> {
  const key = process.env['immutable-key'] || '';
  return {
    Accept: 'application/json',
    ...(key ? { 'x-immutable-api-key': key } : {}),
  };
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers: headers || getHeaders() });

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const baseDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, attempt);
      const delay = baseDelay + Math.random() * 500;
      console.warn(
        `[NFTService] 429 rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }
  throw new Error(`Rate limited after ${maxRetries} retries`);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NFTItem {
  tokenId: string;
  name: string;
  contractAddress: string;
  category: string;
  image: string | null;
  attributes: Record<string, string>;
  depositState: 'blockchain' | 'deposited';
  // Purchase info (from sale activities)
  purchasePriceImx: number | null;
  purchasePriceUsd: number | null;
  purchaseCurrency: string | null;
}

export interface CollectionFloor {
  contractAddress: string;
  category: string;
  floorImx: number | null;
  floorUsd: number | null;
  listings: number;
}

export interface PortfolioCategory {
  category: string;
  name: string;
  count: number;
  items: NFTItem[];
  floor: CollectionFloor | null;
  totalCostImx: number;
  totalCostUsd: number;
  priceKnownCount: number;
}

export interface Portfolio {
  wallet: string;
  totalNFTs: number;
  categories: PortfolioCategory[];
  totalValueImx: number;
  totalValueUsd: number;
  totalCostImx: number;
  totalCostUsd: number;
  priceKnownCount: number;
  imxPrice: number;
}

// ─── Token Prices ───────────────────────────────────────────────────────────

let cachedPrices: { imx: number; usdc: number; quest: number; fetchedAt: number } | null = null;

export async function getTokenPrices(): Promise<{ imx: number; usdc: number; quest: number }> {
  if (cachedPrices && Date.now() - cachedPrices.fetchedAt < 5 * 60 * 1000) {
    return cachedPrices;
  }
  try {
    const data = await fetchJson<Record<string, { usd?: number }>>(
      'https://api.coingecko.com/api/v3/simple/price?ids=immutable-x,usd-coin,ravenquest&vs_currencies=usd',
      {}
    );
    cachedPrices = {
      imx: data['immutable-x']?.usd || 0,
      usdc: data['usd-coin']?.usd || 1,
      quest: data['ravenquest']?.usd || 0,
      fetchedAt: Date.now(),
    };
    return cachedPrices;
  } catch (error) {
    console.error('[NFTService] Failed to fetch token prices:', error);
    return cachedPrices || { imx: 0, usdc: 1, quest: 0 };
  }
}

// ─── Wallet NFT Inventory ───────────────────────────────────────────────────

interface RawNFT {
  token_id: string;
  contract_address: string;
  name?: string;
  image?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fetch all RavenQuest NFTs owned by a wallet.
 */
export async function getWalletNFTs(wallet: string): Promise<NFTItem[]> {
  const allNFTs: NFTItem[] = [];
  const contractAddresses = Object.keys(RQ_COLLECTIONS);

  // Fetch deposited token IDs (transferred to game custody)
  const depositedIds = await getDepositedTokenIds(wallet);

  for (const contractAddr of contractAddresses) {
    const collection = RQ_COLLECTIONS[contractAddr];
    let cursor: string | null = null;

    // Fetch NFTs in wallet
    do {
      const params = new URLSearchParams({
        account_address: wallet,
        contract_address: contractAddr,
        page_size: '200',
      });
      if (cursor) params.set('page_cursor', cursor);

      const url = `${IMX_BASE}/${CHAIN}/nfts?${params}`;
      const data = await fetchJson<{
        result: RawNFT[];
        page?: { next_cursor?: string };
      }>(url);

      for (const nft of data.result || []) {
        const attrs = extractAttributes(nft);
        allNFTs.push({
          tokenId: nft.token_id,
          name: nft.name || attrs['Name'] || `${collection.name} #${nft.token_id}`,
          contractAddress: contractAddr,
          category: collection.category,
          image: nft.image || null,
          attributes: attrs,
          depositState: 'blockchain',
          purchasePriceImx: null,
          purchasePriceUsd: null,
          purchaseCurrency: null,
        });
      }

      cursor = data.page?.next_cursor || null;
    } while (cursor);

    // Add deposited NFTs (in game custody but still "owned")
    const depositedForContract = depositedIds.get(contractAddr) || [];
    for (const tokenId of depositedForContract) {
      // Skip if already in wallet (shouldn't happen, but safety check)
      if (allNFTs.some((n) => n.contractAddress === contractAddr && n.tokenId === tokenId))
        continue;

      allNFTs.push({
        tokenId,
        name: `${collection.name} #${tokenId}`,
        contractAddress: contractAddr,
        category: collection.category,
        image: null,
        attributes: {},
        depositState: 'deposited',
        purchasePriceImx: null,
        purchasePriceUsd: null,
        purchaseCurrency: null,
      });
    }
  }

  return allNFTs;
}

/**
 * Get token IDs deposited into game custody for a wallet.
 */
async function getDepositedTokenIds(wallet: string): Promise<Map<string, string[]>> {
  const deposited = new Map<string, string[]>();

  for (const contractAddr of Object.keys(RQ_COLLECTIONS)) {
    try {
      const params = new URLSearchParams({
        account_address: wallet,
        activity_type: 'transfer',
        contract_address: contractAddr,
        page_size: '200',
      });

      const url = `${IMX_BASE}/${CHAIN}/activities?${params}`;
      const data = await fetchJson<{
        result: Array<{
          details?: {
            from?: string;
            to?: string;
            asset?: { token_id?: string };
          };
        }>;
      }>(url);

      const ids: string[] = [];
      for (const act of data.result || []) {
        const d = act.details;
        if (!d) continue;
        // Wallet sent NFT to a game custody address
        if (
          d.from?.toLowerCase() === wallet.toLowerCase() &&
          d.to &&
          DEPOSIT_ADDRESSES.has(d.to.toLowerCase()) &&
          d.asset?.token_id
        ) {
          ids.push(d.asset.token_id);
        }
      }
      if (ids.length > 0) deposited.set(contractAddr, ids);
    } catch {
      // Non-critical — continue without deposit detection
    }
  }

  return deposited;
}

// ─── Purchase Price Detection ───────────────────────────────────────────────

/**
 * Detect purchase prices from sale activity history.
 */
export async function detectPurchasePrices(wallet: string, nfts: NFTItem[]): Promise<void> {
  const prices = await getTokenPrices();

  for (const contractAddr of Object.keys(RQ_COLLECTIONS)) {
    const contractNfts = nfts.filter((n) => n.contractAddress === contractAddr);
    if (contractNfts.length === 0) continue;

    try {
      const params = new URLSearchParams({
        account_address: wallet,
        activity_type: 'sale',
        contract_address: contractAddr,
        page_size: '200',
      });

      const url = `${IMX_BASE}/${CHAIN}/activities?${params}`;
      const data = await fetchJson<{
        result: Array<{
          details?: {
            to?: string;
            payment?: {
              token?: { contract_address?: string };
              price_excluding_fees?: string;
              price_including_fees?: string;
            };
            asset?: { token_id?: string; contract_address?: string };
          };
        }>;
      }>(url);

      for (const act of data.result || []) {
        const d = act.details;
        if (!d || d.to?.toLowerCase() !== wallet.toLowerCase()) continue;

        const tokenId = d.asset?.token_id;
        if (!tokenId) continue;

        const nft = contractNfts.find((n) => n.tokenId === tokenId);
        if (!nft || nft.purchasePriceImx !== null) continue; // Already has price

        const rawPrice = d.payment?.price_including_fees || d.payment?.price_excluding_fees || '0';
        const paymentAddr = d.payment?.token?.contract_address?.toLowerCase() || '';
        const tokenInfo = ERC20_MAP[paymentAddr];

        if (!tokenInfo) continue;

        const amount = parseFloat(rawPrice) / Math.pow(10, tokenInfo.decimals);

        if (tokenInfo.symbol === 'IMX') {
          nft.purchasePriceImx = amount;
          nft.purchasePriceUsd = amount * prices.imx;
          nft.purchaseCurrency = 'IMX';
        } else if (tokenInfo.symbol === 'USDC') {
          nft.purchasePriceUsd = amount;
          nft.purchasePriceImx = prices.imx > 0 ? amount / prices.imx : null;
          nft.purchaseCurrency = 'USDC';
        } else if (tokenInfo.symbol === 'QUEST') {
          nft.purchasePriceUsd = amount * prices.quest;
          nft.purchasePriceImx = prices.imx > 0 ? (amount * prices.quest) / prices.imx : null;
          nft.purchaseCurrency = 'QUEST';
        }
      }
    } catch (error) {
      console.error(`[NFTService] Failed to detect prices for ${contractAddr}:`, error);
    }
  }
}

// ─── Floor Prices ───────────────────────────────────────────────────────────

/**
 * Get collection floor prices using the Immutable Orderbook.
 */
export async function getCollectionFloors(): Promise<Map<string, CollectionFloor>> {
  const floors = new Map<string, CollectionFloor>();
  const prices = await getTokenPrices();

  for (const [contractAddr, collection] of Object.entries(RQ_COLLECTIONS)) {
    try {
      const params = new URLSearchParams({
        sell_item_contract_address: contractAddr,
        status: 'ACTIVE',
        page_size: '10',
        sort_by: 'buy_item_amount',
        sort_direction: 'asc',
      });

      const url = `${IMX_BASE}/${CHAIN}/orders?${params}`;
      const data = await fetchJson<{
        result: Array<{
          buy: Array<{
            item_type?: string;
            contract_address?: string;
            amount?: string;
          }>;
        }>;
      }>(url);

      let floorImx: number | null = null;
      let listingCount = 0;

      for (const order of data.result || []) {
        listingCount++;
        const buyItem = order.buy?.[0];
        if (!buyItem?.amount) continue;

        const tokenAddr = buyItem.contract_address?.toLowerCase() || '';
        const tokenInfo = ERC20_MAP[tokenAddr];
        if (!tokenInfo) continue;

        const amount = parseFloat(buyItem.amount) / Math.pow(10, tokenInfo.decimals);
        let imxAmount: number;

        if (tokenInfo.symbol === 'IMX') {
          imxAmount = amount;
        } else if (tokenInfo.symbol === 'USDC') {
          imxAmount = prices.imx > 0 ? amount / prices.imx : 0;
        } else {
          continue;
        }

        if (floorImx === null || imxAmount < floorImx) {
          floorImx = imxAmount;
        }
      }

      floors.set(contractAddr, {
        contractAddress: contractAddr,
        category: collection.category,
        floorImx,
        floorUsd: floorImx !== null ? floorImx * prices.imx : null,
        listings: listingCount,
      });
    } catch (error) {
      console.error(`[NFTService] Failed to get floor for ${collection.name}:`, error);
      floors.set(contractAddr, {
        contractAddress: contractAddr,
        category: collection.category,
        floorImx: null,
        floorUsd: null,
        listings: 0,
      });
    }
  }

  return floors;
}

// ─── Full Portfolio ─────────────────────────────────────────────────────────

/**
 * Build complete portfolio for a wallet address.
 */
export async function getPortfolio(wallet: string): Promise<Portfolio> {
  const [nfts, floors, prices] = await Promise.all([
    getWalletNFTs(wallet),
    getCollectionFloors(),
    getTokenPrices(),
  ]);

  // Detect purchase prices (mutates nfts in place)
  await detectPurchasePrices(wallet, nfts);

  // Group by category
  const categoryMap = new Map<string, NFTItem[]>();
  for (const nft of nfts) {
    const list = categoryMap.get(nft.contractAddress) || [];
    list.push(nft);
    categoryMap.set(nft.contractAddress, list);
  }

  const categories: PortfolioCategory[] = [];
  let totalValueImx = 0;
  let totalValueUsd = 0;
  let totalCostImx = 0;
  let totalCostUsd = 0;
  let totalPriceKnown = 0;

  for (const [contractAddr, items] of categoryMap) {
    const collection = RQ_COLLECTIONS[contractAddr];
    if (!collection) continue;

    const floor = floors.get(contractAddr) || null;

    let catCostImx = 0;
    let catCostUsd = 0;
    let priceKnown = 0;

    for (const item of items) {
      if (item.purchasePriceImx !== null) {
        catCostImx += item.purchasePriceImx;
        priceKnown++;
      }
      if (item.purchasePriceUsd !== null) {
        catCostUsd += item.purchasePriceUsd;
      }
    }

    // Value = count × floor price
    const catValueImx = floor?.floorImx ? items.length * floor.floorImx : 0;
    const catValueUsd = floor?.floorUsd ? items.length * floor.floorUsd : 0;

    totalValueImx += catValueImx;
    totalValueUsd += catValueUsd;
    totalCostImx += catCostImx;
    totalCostUsd += catCostUsd;
    totalPriceKnown += priceKnown;

    categories.push({
      category: collection.category,
      name: collection.name,
      count: items.length,
      items,
      floor,
      totalCostImx: catCostImx,
      totalCostUsd: catCostUsd,
      priceKnownCount: priceKnown,
    });
  }

  // Sort: Land first, then by count desc
  const categoryOrder = ['land', 'munks', 'moas', 'cards', 'cosmetics'];
  categories.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

  return {
    wallet,
    totalNFTs: nfts.length,
    categories,
    totalValueImx,
    totalValueUsd,
    totalCostImx,
    totalCostUsd,
    priceKnownCount: totalPriceKnown,
    imxPrice: prices.imx,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractAttributes(nft: RawNFT): Record<string, string> {
  const attrs: Record<string, string> = {};
  const meta = nft.metadata;
  if (!meta) return attrs;

  // Standard attributes array
  if (Array.isArray(meta.attributes)) {
    for (const attr of meta.attributes) {
      if (attr && typeof attr === 'object' && 'trait_type' in attr && 'value' in attr) {
        attrs[String(attr.trait_type)] = String(attr.value);
      }
    }
  }

  // Direct properties (some NFTs use this)
  for (const key of ['Size', 'Rarity', 'Perk', 'Bonus', 'Tier', 'Breed', 'Name']) {
    if (meta[key] && typeof meta[key] === 'string') {
      attrs[key] = meta[key] as string;
    }
    // Also check lowercase
    const lower = key.toLowerCase();
    if (meta[lower] && typeof meta[lower] === 'string' && !attrs[key]) {
      attrs[key] = meta[lower] as string;
    }
  }

  return attrs;
}

// ─── NFT Whale Leaderboard ──────────────────────────────────────────────────

export interface NFTWhale {
  wallet: string;
  totalNFTs: number;
  /** Breakdown by category name → count */
  breakdown: Record<string, number>;
}

/**
 * Get the top NFT holders, optionally filtered to a specific collection.
 * @param limit Max results
 * @param category Filter to a single category (e.g. 'land', 'cards'). Omit for all.
 */
export async function getNFTWhales(limit = 15, category?: string): Promise<NFTWhale[]> {
  const walletTotals = new Map<string, { total: number; breakdown: Record<string, number> }>();

  const collections = Object.entries(RQ_COLLECTIONS).filter(
    ([, col]) => !category || col.category === category
  );

  for (const [contractAddr, collection] of collections) {
    try {
      const url = `https://explorer.immutable.com/api/v2/tokens/${contractAddr}/holders`;
      const data = await fetchJson<{
        items: Array<{
          address: { hash: string };
          value: string;
        }>;
      }>(url, {});

      for (const holder of data.items || []) {
        const addr = holder.address.hash.toLowerCase();
        if (knownAddresses.isKnownAddress(addr)) continue;

        const count = parseInt(holder.value, 10);
        if (isNaN(count) || count <= 0) continue;

        const existing = walletTotals.get(addr) || { total: 0, breakdown: {} };
        existing.total += count;
        existing.breakdown[collection.name] = (existing.breakdown[collection.name] || 0) + count;
        walletTotals.set(addr, existing);
      }
    } catch (error) {
      console.error(`[NFTService] Failed to fetch holders for ${collection.name}:`, error);
    }
  }

  // Sort by total NFTs desc, take top N
  return [...walletTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, limit)
    .map(([wallet, data]) => ({
      wallet,
      totalNFTs: data.total,
      breakdown: data.breakdown,
    }));
}
