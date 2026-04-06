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
  /** Per-subcategory floors (e.g. "Small" → 100 IMX, "Large" → 5000 IMX) */
  subFloors: Record<string, number>;
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
 * Parallelizes across collections for speed.
 */
export async function getWalletNFTs(wallet: string): Promise<NFTItem[]> {
  const contractAddresses = Object.keys(RQ_COLLECTIONS);

  // Fetch all collections + deposits in parallel
  const results = await Promise.all(
    contractAddresses.map(async (contractAddr) => {
      const collection = RQ_COLLECTIONS[contractAddr];
      const items: NFTItem[] = [];

      try {
        // Fetch NFTs owned by wallet (account-scoped endpoint)
        const params = new URLSearchParams({
          contract_address: contractAddr,
          page_size: '200',
        });
        const url = `${IMX_BASE}/${CHAIN}/accounts/${wallet}/nfts?${params}`;
        const data = await fetchJson<{
          result: RawNFT[];
          page?: { next_cursor?: string };
        }>(url);

        for (const nft of data.result || []) {
          const attrs = extractAttributes(nft);
          items.push({
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
      } catch (error) {
        console.error(`[NFTService] Failed to fetch ${collection.name} NFTs:`, error);
      }

      return items;
    })
  );

  return results.flat();
}

// ─── Purchase Price Detection ───────────────────────────────────────────────

/**
 * Find NFTs the wallet deposited to vault and add them to the list.
 * Queries the wallet's own transfer history (fast — only their transfers).
 */
async function addDepositedNFTs(wallet: string, nfts: NFTItem[]): Promise<void> {
  const vaultAddrs = new Set(GAME_VAULTS);

  await Promise.all(
    Object.entries(RQ_COLLECTIONS).map(async ([contractAddr, collection]) => {
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
            details?: { from?: string; to?: string; asset?: { token_id?: string } };
          }>;
        }>(url);

        for (const act of data.result || []) {
          const d = act.details;
          if (!d || !d.asset?.token_id) continue;
          const from = (d.from || '').toLowerCase();
          const to = (d.to || '').toLowerCase();

          // Wallet sent to vault = deposited to vault
          if (from === wallet.toLowerCase() && vaultAddrs.has(to)) {
            const tokenId = d.asset.token_id;
            // Skip if already in the list
            if (nfts.some((n) => n.contractAddress === contractAddr && n.tokenId === tokenId))
              continue;

            nfts.push({
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
      } catch {
        // Non-critical
      }
    })
  );
}

/** Game custody vault addresses */
const GAME_VAULTS = [
  '0xe597f8370e99fe87de34e0c0fa863920cb39ca02',
  '0x7959c306cce2f25d4553b2c786a852d0801a3638',
];

// ─── Metadata Enrichment ────────────────────────────────────────────────────

const BLOCKSCOUT_BASE = 'https://explorer.immutable.com/api/v2';

/**
 * Enrich NFTs that have empty attributes by fetching metadata from Blockscout.
 * Batches requests per collection, up to 20 per collection to stay within limits.
 */
async function enrichMetadata(nfts: NFTItem[]): Promise<void> {
  const needsEnrichment = nfts.filter((n) => Object.keys(n.attributes).length === 0);
  if (needsEnrichment.length === 0) return;

  const byContract = new Map<string, NFTItem[]>();
  for (const nft of needsEnrichment) {
    const list = byContract.get(nft.contractAddress) || [];
    list.push(nft);
    byContract.set(nft.contractAddress, list);
  }

  await Promise.all(
    [...byContract.entries()].map(async ([contractAddr, items]) => {
      for (const nft of items) {
        try {
          const url = `${BLOCKSCOUT_BASE}/tokens/${contractAddr}/instances/${nft.tokenId}`;
          const data = await fetchJson<{
            metadata?: {
              name?: string;
              image?: string;
              attributes?: Array<{ trait_type?: string; value?: string }>;
            };
          }>(url, {});

          if (data.metadata?.name && nft.name.includes('#')) {
            nft.name = data.metadata.name;
          }
          if (data.metadata?.image) {
            nft.image = data.metadata.image;
          }
          if (data.metadata?.attributes) {
            for (const attr of data.metadata.attributes) {
              if (attr.trait_type && attr.value) {
                nft.attributes[attr.trait_type] = String(attr.value);
              }
            }
          }
        } catch {
          // Non-critical — name parsing fallback will handle it
        }
      }
    })
  );
}

/**
 * Detect purchase prices from sale activity history.
 */
export async function detectPurchasePrices(wallet: string, nfts: NFTItem[]): Promise<void> {
  const prices = await getTokenPrices();

  // Parallelize across collections that have NFTs
  await Promise.all(
    Object.keys(RQ_COLLECTIONS).map(async (contractAddr) => {
      const contractNfts = nfts.filter((n) => n.contractAddress === contractAddr);
      if (contractNfts.length === 0) return;

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
                token?: { contract_address?: string; symbol?: string };
                price_excluding_fees?: string;
                price_including_fees?: string;
              };
              asset?:
                | Array<{ token_id?: string; contract_address?: string }>
                | { token_id?: string; contract_address?: string };
            };
          }>;
        }>(url);

        for (const act of data.result || []) {
          const d = act.details;
          if (!d || d.to?.toLowerCase() !== wallet.toLowerCase()) continue;

          // Asset can be an array or object depending on API version
          const assetObj = Array.isArray(d.asset) ? d.asset[0] : d.asset;
          const tokenId = assetObj?.token_id;
          if (!tokenId) continue;

          const nft = contractNfts.find((n) => n.tokenId === tokenId);
          if (!nft || nft.purchasePriceImx !== null) continue;

          const rawPrice = d.payment?.price_excluding_fees || d.payment?.price_including_fees;
          if (!rawPrice) continue;

          const priceRaw = parseFloat(rawPrice);
          const paymentAddr = d.payment?.token?.contract_address?.toLowerCase() || '';
          const tokenInfo = ERC20_MAP[paymentAddr];

          // Fallback: guess decimals from magnitude if token not in map
          let symbol: string;
          let decimals: number;
          if (tokenInfo) {
            symbol = tokenInfo.symbol;
            decimals = tokenInfo.decimals;
          } else if (priceRaw > 1e12) {
            symbol = (d.payment?.token?.symbol || 'IMX').toUpperCase();
            decimals = 18;
          } else {
            symbol = 'USDC';
            decimals = 6;
          }

          const amount = priceRaw / Math.pow(10, decimals);

          if (symbol === 'IMX') {
            nft.purchasePriceImx = amount;
            nft.purchasePriceUsd = amount * prices.imx;
            nft.purchaseCurrency = 'IMX';
          } else if (symbol === 'USDC') {
            nft.purchasePriceUsd = amount;
            nft.purchasePriceImx = prices.imx > 0 ? amount / prices.imx : null;
            nft.purchaseCurrency = 'USDC';
          } else if (symbol === 'QUEST') {
            nft.purchasePriceUsd = amount * prices.quest;
            nft.purchasePriceImx = prices.imx > 0 ? (amount * prices.quest) / prices.imx : null;
            nft.purchaseCurrency = 'QUEST';
          }
        }
      } catch (error) {
        console.error(`[NFTService] Failed to detect prices for ${contractAddr}:`, error);
      }
    })
  );
}

// ─── Floor Prices ───────────────────────────────────────────────────────────

/**
 * Get collection floor prices using the Immutable Orderbook.
 * Fetches listings with metadata to build per-subcategory floors
 * (e.g. Small Land floor vs Large Land floor).
 */
export async function getCollectionFloors(): Promise<Map<string, CollectionFloor>> {
  const floors = new Map<string, CollectionFloor>();
  const prices = await getTokenPrices();

  await Promise.all(
    Object.entries(RQ_COLLECTIONS).map(async ([contractAddr, collection]) => {
      try {
        // Fetch more listings to get subcategory diversity
        const params = new URLSearchParams({
          sell_item_contract_address: contractAddr,
          status: 'ACTIVE',
          page_size: '200',
        });

        const url = `${IMX_BASE}/${CHAIN}/orders/listings?${params}`;
        const data = await fetchJson<{
          result: Array<{
            sell: Array<{ token_id?: string; contract_address?: string }>;
            buy: Array<{
              item_type?: string;
              contract_address?: string;
              amount?: string;
            }>;
          }>;
        }>(url);

        let floorImx: number | null = null;
        let listingCount = 0;

        // Parse all listings with their prices
        const listingsWithPrice: Array<{ tokenId: string; imxAmount: number }> = [];

        for (const order of data.result || []) {
          listingCount++;
          const buyItem = order.buy?.[0];
          const sellItem = order.sell?.[0];
          if (!buyItem?.amount || !sellItem?.token_id) continue;

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
          listingsWithPrice.push({ tokenId: sellItem.token_id, imxAmount });
        }

        const subFloors: Record<string, number> = {};

        floors.set(contractAddr, {
          contractAddress: contractAddr,
          category: collection.category,
          floorImx,
          floorUsd: floorImx !== null ? floorImx * prices.imx : null,
          listings: listingCount,
          subFloors,
        });
      } catch (error) {
        console.error(`[NFTService] Failed to get floor for ${collection.name}:`, error);
        floors.set(contractAddr, {
          contractAddress: contractAddr,
          category: collection.category,
          floorImx: null,
          floorUsd: null,
          listings: 0,
          subFloors: {},
        });
      }
    })
  );

  return floors;
}

/**
 * Enrich floor data with per-subcategory prices.
 * Fetches metadata for cheap listings from Blockscout — slow but accurate.
 * Called as a separate phase so basic floors are available immediately.
 */
export async function enrichSubFloors(floors: Map<string, CollectionFloor>): Promise<void> {
  const prices = await getTokenPrices();

  for (const [contractAddr, floor] of floors) {
    if (floor.listings === 0) continue;
    const collection = RQ_COLLECTIONS[contractAddr];
    if (!collection) continue;

    try {
      // Re-fetch cheapest listings for this collection
      const params = new URLSearchParams({
        sell_item_contract_address: contractAddr,
        status: 'ACTIVE',
        page_size: '30',
      });
      const url = `${IMX_BASE}/${CHAIN}/orders/listings?${params}`;
      const data = await fetchJson<{
        result: Array<{
          sell: Array<{ token_id?: string }>;
          buy: Array<{ contract_address?: string; amount?: string }>;
        }>;
      }>(url);

      const listings: Array<{ tokenId: string; imxAmount: number }> = [];
      for (const order of data.result || []) {
        const sellItem = order.sell?.[0];
        const buyItem = order.buy?.[0];
        if (!sellItem?.token_id || !buyItem?.amount) continue;

        const tokenAddr = buyItem.contract_address?.toLowerCase() || '';
        const tokenInfo = ERC20_MAP[tokenAddr];
        if (!tokenInfo) continue;

        const amount = parseFloat(buyItem.amount) / Math.pow(10, tokenInfo.decimals);
        const imxAmount =
          tokenInfo.symbol === 'IMX'
            ? amount
            : tokenInfo.symbol === 'USDC' && prices.imx > 0
              ? amount / prices.imx
              : 0;
        if (imxAmount > 0) listings.push({ tokenId: sellItem.token_id, imxAmount });
      }

      // Sample across the full price range to catch all subcategories
      // (cheapest 15 are often all the same type, e.g. all Small Land)
      const sorted = listings.sort((a, b) => a.imxAmount - b.imxAmount);
      const indices = new Set<number>();
      // First 5 cheapest
      for (let i = 0; i < Math.min(5, sorted.length); i++) indices.add(i);
      // Sample every ~5% of the range to catch all subcategories
      for (let pct = 0.05; pct <= 1.0; pct += 0.05) {
        indices.add(Math.min(Math.floor(pct * sorted.length), sorted.length - 1));
      }
      const sampled = [...indices].sort((a, b) => a - b).map((i) => sorted[i]);

      for (const listing of sampled) {
        try {
          const metaUrl = `${BLOCKSCOUT_BASE}/tokens/${contractAddr}/instances/${listing.tokenId}`;
          const meta = await fetchJson<{
            metadata?: {
              name?: string;
              attributes?: Array<{ trait_type?: string; value?: string }>;
            };
          }>(metaUrl, {});

          const attrMap: Record<string, string> = {};
          for (const a of meta.metadata?.attributes || []) {
            if (a.trait_type && a.value) attrMap[a.trait_type] = a.value;
          }

          let subKey = '';
          switch (collection.category) {
            case 'land':
              subKey = parseLandSize(
                attrMap['Tier'] || attrMap['Size'] || meta.metadata?.name || ''
              );
              break;
            case 'munks':
            case 'cards':
            case 'cosmetics':
              subKey = attrMap['Rarity'] || '';
              break;
            case 'moas':
              subKey = attrMap['Tier'] ? `Tier ${attrMap['Tier']}` : '';
              break;
          }

          if (
            subKey &&
            (!(subKey in floor.subFloors) || listing.imxAmount < floor.subFloors[subKey])
          ) {
            floor.subFloors[subKey] = listing.imxAmount;
          }
        } catch {
          // Skip individual metadata failures
        }
      }
    } catch {
      // Skip collection failures
    }
  }
}

// ─── Full Portfolio ─────────────────────────────────────────────────────────

/**
 * Build complete portfolio for a wallet address.
 * Timeout after 15s to avoid Discord interaction expiry.
 */
export async function getPortfolio(
  wallet: string,
  onProgress?: (phase: string, portfolio: Portfolio) => void
): Promise<Portfolio> {
  const buildPortfolio = (
    nfts: NFTItem[],
    floors: Map<string, CollectionFloor>,
    prices: { imx: number; usdc: number; quest: number }
  ): Portfolio => {
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

      let catValueImx = 0;
      for (const item of items) {
        const subKey = getItemSubKey(collection.category, item);
        const subFloor = subKey && floor?.subFloors[subKey];
        const itemFloor = subFloor || floor?.floorImx || 0;
        catValueImx += itemFloor;
      }
      const catValueUsd = catValueImx * prices.imx;

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

    const categoryOrder = ['land', 'munks', 'moas', 'cards', 'cosmetics'];
    categories.sort(
      (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
    );

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
  };

  // Phase 1: Inventory + basic floors + prices (sequential to respect rate limits)
  const prices = await getTokenPrices();
  const [onChainNfts, floors] = await Promise.all([getWalletNFTs(wallet), getCollectionFloors()]);

  const nfts = [...onChainNfts];

  // Send initial update with on-chain NFTs + basic floors
  if (onProgress) onProgress('inventory', buildPortfolio(nfts, floors, prices));

  // Phase 2: Deposited NFTs
  await addDepositedNFTs(wallet, nfts);
  if (onProgress) onProgress('deposits', buildPortfolio(nfts, floors, prices));

  // Phase 3: Enrich NFT metadata from Blockscout
  await enrichMetadata(nfts);
  if (onProgress) onProgress('metadata', buildPortfolio(nfts, floors, prices));

  // Phase 4: Purchase prices
  await detectPurchasePrices(wallet, nfts);
  if (onProgress) onProgress('prices', buildPortfolio(nfts, floors, prices));

  // Phase 5: Subcategory floor enrichment (slowest — many Blockscout calls)
  await enrichSubFloors(floors);

  return buildPortfolio(nfts, floors, prices);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get the subcategory key for an NFT (matches the keys in subFloors) */
function getItemSubKey(category: string, item: NFTItem): string {
  switch (category) {
    case 'land':
      return parseLandSize(item.attributes['Tier'] || item.attributes['Size'] || item.name || '');
    case 'munks':
    case 'cards':
    case 'cosmetics':
      return item.attributes['Rarity'] || '';
    case 'moas':
      return item.attributes['Tier'] ? `Tier ${item.attributes['Tier']}` : '';
    default:
      return '';
  }
}

/** Extract land size from Tier attribute or name (e.g. "Large Estate" → "Large") */
function parseLandSize(raw: string): string {
  const sizes = ['Small', 'Medium', 'Large', 'Stronghold', 'Fort'];
  for (const s of sizes) {
    if (raw.toLowerCase().includes(s.toLowerCase())) return s;
  }
  return raw;
}

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
  /** Breakdown by collection or subcategory → count */
  breakdown: Record<string, number>;
}

// GAME_VAULTS defined above (near addDepositedNFTs)

/**
 * For a given contract, find who deposited NFTs into game vaults.
 * Gets the vault's NFT inventory, then traces each token's transfer
 * history to find the original depositor. More accurate than scanning
 * vault activities (which hit pagination limits).
 */
async function getDepositedCounts(contractAddr: string): Promise<Map<string, number>> {
  const depositorCounts = new Map<string, number>();

  for (const vaultAddr of GAME_VAULTS) {
    try {
      // Step 1: Get all NFTs the vault currently holds for this contract
      const vaultTokens: string[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          contract_address: contractAddr,
          page_size: '200',
        });
        if (cursor) params.set('page_cursor', cursor);

        const url = `${IMX_BASE}/${CHAIN}/accounts/${vaultAddr}/nfts?${params}`;
        const data = await fetchJson<{
          result: Array<{ token_id: string }>;
          page?: { next_cursor?: string };
        }>(url);

        for (const nft of data.result || []) {
          vaultTokens.push(nft.token_id);
        }
        cursor = data.page?.next_cursor || null;
      } while (cursor);

      if (vaultTokens.length === 0) continue;

      // Step 2: Query vault's transfer activities to map token → depositor
      // The vault received these tokens from the depositors
      const tokenDepositor = new Map<string, string>();
      cursor = null;
      let pages = 0;
      do {
        const params = new URLSearchParams({
          account_address: vaultAddr,
          activity_type: 'transfer',
          contract_address: contractAddr,
          page_size: '200',
        });
        if (cursor) params.set('page_cursor', cursor);

        const url = `${IMX_BASE}/${CHAIN}/activities?${params}`;
        const data = await fetchJson<{
          result: Array<{
            details?: { from?: string; to?: string; asset?: { token_id?: string } };
          }>;
          page?: { next_cursor?: string };
        }>(url);

        for (const act of data.result || []) {
          const d = act.details;
          if (!d || !d.asset?.token_id) continue;
          const from = (d.from || '').toLowerCase();
          const to = (d.to || '').toLowerCase();
          // Only count tokens the vault currently holds
          if (
            to === vaultAddr &&
            from &&
            !knownAddresses.isKnownAddress(from) &&
            vaultTokens.includes(d.asset.token_id)
          ) {
            tokenDepositor.set(d.asset.token_id, from);
          }
        }

        cursor = data.page?.next_cursor || null;
        pages++;
        // Stop early if we've mapped all tokens
        if (tokenDepositor.size >= vaultTokens.length) break;
      } while (cursor && pages < 50); // Up to 10K activities

      for (const depositor of tokenDepositor.values()) {
        depositorCounts.set(depositor, (depositorCounts.get(depositor) || 0) + 1);
      }
    } catch {
      // Non-critical
    }
  }

  return depositorCounts;
}

/**
 * Get the top NFT holders, including vault-deposited NFTs.
 * @param limit Max results
 * @param category Filter to a single category. Omit for all.
 */
export async function getNFTWhales(limit = 15, category?: string): Promise<NFTWhale[]> {
  const walletTotals = new Map<string, { total: number; breakdown: Record<string, number> }>();

  const collections = Object.entries(RQ_COLLECTIONS).filter(
    ([, col]) => !category || col.category === category
  );

  // Fetch on-chain holders + deposit credits in parallel per collection
  await Promise.all(
    collections.map(async ([contractAddr, collection]) => {
      try {
        // On-chain holders (Blockscout)
        const holdersPromise = fetchJson<{
          items: Array<{ address: { hash: string }; value: string }>;
        }>(`https://explorer.immutable.com/api/v2/tokens/${contractAddr}/holders`, {});

        // Deposited NFT credits
        const depositsPromise = getDepositedCounts(contractAddr);

        const [holdersData, depositCounts] = await Promise.all([holdersPromise, depositsPromise]);

        // Add on-chain holders (skip known ecosystem addresses)
        for (const holder of holdersData.items || []) {
          const addr = holder.address.hash.toLowerCase();
          if (knownAddresses.isKnownAddress(addr)) continue;

          const count = parseInt(holder.value, 10);
          if (isNaN(count) || count <= 0) continue;

          const existing = walletTotals.get(addr) || { total: 0, breakdown: {} };
          existing.total += count;
          existing.breakdown[collection.name] = (existing.breakdown[collection.name] || 0) + count;
          walletTotals.set(addr, existing);
        }

        // Add deposited NFT credits back to original owners
        for (const [depositor, count] of depositCounts) {
          const existing = walletTotals.get(depositor) || { total: 0, breakdown: {} };
          existing.total += count;
          existing.breakdown[`${collection.name} (deposited)`] =
            (existing.breakdown[`${collection.name} (deposited)`] || 0) + count;
          walletTotals.set(depositor, existing);
        }
      } catch (error) {
        console.error(`[NFTService] Failed to fetch holders for ${collection.name}:`, error);
      }
    })
  );

  return [...walletTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, limit)
    .map(([wallet, data]) => ({
      wallet,
      totalNFTs: data.total,
      breakdown: data.breakdown,
    }));
}
