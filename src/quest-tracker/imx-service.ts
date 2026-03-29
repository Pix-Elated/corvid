/**
 * Immutable zkEVM API client for QUEST token tracking.
 * Uses the Blockchain Data API + Blockscout Explorer API.
 */
import * as knownAddresses from './known-addresses';

const CHAIN = 'imtbl-zkevm-mainnet';
const QUEST_CONTRACT = '0x8a1e8cf52954c8d72907774d4b2b81f38dd1c5c4';
const IMX_BASE = 'https://api.immutable.com';
const BLOCKSCOUT_BASE = 'https://explorer.immutable.com/api/v2';
const QUEST_DECIMALS = 6;

function getApiKey(): string {
  return process.env['immutable-key'] || '';
}

function getHeaders(): Record<string, string> {
  const key = getApiKey();
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
      // Rate limited — exponential backoff with jitter
      const retryAfter = res.headers.get('retry-after');
      const baseDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, attempt);
      const jitter = Math.random() * 500;
      const delay = baseDelay + jitter;
      console.warn(
        `[IMX] 429 rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }
  throw new Error(`Rate limited after ${maxRetries} retries: ${url}`);
}

/** Convert raw QUEST amount (6 decimals) to human-readable */
export function formatQuest(rawAmount: string | number): string {
  const num = typeof rawAmount === 'string' ? parseFloat(rawAmount) : rawAmount;
  const quest = num / Math.pow(10, QUEST_DECIMALS);
  if (quest >= 1_000_000) return `${(quest / 1_000_000).toFixed(2)}M`;
  if (quest >= 1_000) return `${(quest / 1_000).toFixed(1)}K`;
  return quest.toFixed(2);
}

/** Convert raw to number */
export function rawToQuest(rawAmount: string | number): number {
  const num = typeof rawAmount === 'string' ? parseFloat(rawAmount) : rawAmount;
  return num / Math.pow(10, QUEST_DECIMALS);
}

/** Shorten a wallet address, using known label if available */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || 'unknown';
  const label = knownAddresses.getKnownLabel(addr);
  if (label) return label;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ─── Transfer Activity Types ────────────────────────────────────────────────

export interface QuestTransfer {
  from: string;
  to: string;
  amount: number; // Human-readable QUEST
  rawAmount: string;
  txHash: string;
  blockNumber: number;
  timestamp: string; // ISO
  type: string; // 'transfer', 'mint', 'burn', etc.
}

export interface QuestHolder {
  address: string;
  balance: number; // Human-readable QUEST
  rawBalance: string;
  percentOfSupply: number;
  isContract: boolean;
  name?: string;
}

export interface QuestTokenInfo {
  totalSupply: number;
  holders: number;
  transfers: number;
  price?: number;
}

// ─── Immutable Blockchain Data API ──────────────────────────────────────────

/**
 * Fetch QUEST transfer activities within a time range.
 * Uses the activity-history endpoint for time-sorted results.
 */
export async function getTransfers(opts: {
  fromDate?: Date;
  toDate?: Date;
  wallet?: string;
  limit?: number;
}): Promise<QuestTransfer[]> {
  const transfers: QuestTransfer[] = [];
  const maxItems = opts.limit || 500;
  let cursor: string | null = null;

  while (transfers.length < maxItems) {
    const params = new URLSearchParams();
    params.set('contract_address', QUEST_CONTRACT);
    params.set('activity_type', 'transfer');
    params.set('page_size', String(Math.min(200, maxItems - transfers.length)));

    if (opts.wallet) params.set('account_address', opts.wallet);
    if (opts.fromDate) params.set('from_updated_at', opts.fromDate.toISOString());
    if (opts.toDate) params.set('to_updated_at', opts.toDate.toISOString());
    if (cursor) params.set('page_cursor', cursor);

    const url = `${IMX_BASE}/v1/chains/${CHAIN}/activity-history?${params}`;
    const data = await fetchJson<{
      result: Array<{
        type: string;
        details: {
          from: string;
          to: string;
          amount: string;
          asset?: { contract_address?: string };
        };
        blockchain_metadata?: {
          transaction_hash?: string;
          block_number?: number;
        };
        indexed_at?: string;
        updated_at?: string;
      }>;
      page?: { next_cursor?: string };
    }>(url);

    if (!data.result || data.result.length === 0) break;

    for (const activity of data.result) {
      const d = activity.details;
      if (!d) continue;
      transfers.push({
        from: d.from || '',
        to: d.to || '',
        amount: rawToQuest(d.amount || '0'),
        rawAmount: d.amount || '0',
        txHash: activity.blockchain_metadata?.transaction_hash || '',
        blockNumber: activity.blockchain_metadata?.block_number || 0,
        timestamp: activity.indexed_at || activity.updated_at || '',
        type: activity.type || 'transfer',
      });
    }

    cursor = data.page?.next_cursor || null;
    if (!cursor) break;
  }

  return transfers;
}

/**
 * Fetch transfers for a specific wallet (both sent and received).
 */
export async function getWalletTransfers(wallet: string, limit = 50): Promise<QuestTransfer[]> {
  return getTransfers({ wallet, limit });
}

// ─── Blockscout Explorer API ────────────────────────────────────────────────

/**
 * Fetch top QUEST token holders from Blockscout.
 * Filters out known RQ ecosystem addresses (vaults, pools, burn).
 */
export async function getHolders(limit = 20): Promise<QuestHolder[]> {
  const url = `${BLOCKSCOUT_BASE}/tokens/${QUEST_CONTRACT}/holders`;
  const data = await fetchJson<{
    items: Array<{
      address: {
        hash: string;
        is_contract: boolean;
        name?: string | null;
        is_verified?: boolean;
      };
      value: string;
    }>;
    next_page_params?: unknown;
  }>(url, {}); // Blockscout doesn't need the IMX key

  // Get total supply for percentage calc
  const info = await getTokenInfo();
  const totalSupply = info.totalSupply;

  // Filter out known ecosystem addresses, then take top N
  return (data.items || [])
    .filter((item) => !knownAddresses.isKnownAddress(item.address.hash))
    .slice(0, limit)
    .map((item) => {
      const balance = rawToQuest(item.value);
      return {
        address: item.address.hash,
        balance,
        rawBalance: item.value,
        percentOfSupply: totalSupply > 0 ? (balance / totalSupply) * 100 : 0,
        isContract: item.address.is_contract,
        name: item.address.name || undefined,
      };
    });
}

/**
 * Get QUEST token metadata (supply, holders, transfers).
 */
export async function getTokenInfo(): Promise<QuestTokenInfo> {
  const [tokenData, counters] = await Promise.all([
    fetchJson<{
      total_supply?: string;
      exchange_rate?: string;
    }>(`${BLOCKSCOUT_BASE}/tokens/${QUEST_CONTRACT}`, {}),
    fetchJson<{
      token_holders_count?: string;
      transfers_count?: string;
    }>(`${BLOCKSCOUT_BASE}/tokens/${QUEST_CONTRACT}/counters`, {}),
  ]);

  return {
    totalSupply: rawToQuest(tokenData.total_supply || '0'),
    holders: parseInt(counters.token_holders_count || '0', 10),
    transfers: parseInt(counters.transfers_count || '0', 10),
    price: tokenData.exchange_rate ? parseFloat(tokenData.exchange_rate) : undefined,
  };
}

/**
 * Get the QUEST balance for a specific wallet via Blockscout.
 */
export async function getWalletBalance(wallet: string): Promise<number> {
  const url = `${BLOCKSCOUT_BASE}/addresses/${wallet}/tokens?type=ERC-20`;

  // Blockscout is unauthenticated — retry aggressively until we get real data
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });

      if (res.status === 429 || !res.ok) {
        const text = await res.text().catch(() => '');
        const delay = 3000 * Math.pow(2, Math.min(attempt, 4)) + Math.random() * 1000;
        console.warn(
          `[IMX] Blockscout ${res.status} for ${wallet.slice(0, 10)}, retry ${attempt + 1}/10 in ${Math.round(delay)}ms: ${text.slice(0, 100)}`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      const data = (await res.json()) as {
        items: Array<{ token: { address: string }; value: string }>;
      };

      const questToken = (data.items || []).find(
        (item) => item.token.address.toLowerCase() === QUEST_CONTRACT.toLowerCase()
      );
      return questToken ? rawToQuest(questToken.value) : 0;
    } catch {
      const delay = 2000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // After 10 retries, throw so callers know something is wrong
  throw new Error(`Failed to get balance for ${wallet.slice(0, 10)} after 10 retries`);
}

// ─── Aggregation Helpers ────────────────────────────────────────────────────

/**
 * Identify large transfers (whale movements) above a threshold.
 * Excludes internal ecosystem shuffling (known→known) but keeps
 * transfers between known and private wallets.
 */
export function filterWhaleTransfers(
  transfers: QuestTransfer[],
  thresholdQuest = 10_000
): QuestTransfer[] {
  return transfers
    .filter((t) => {
      if (t.amount < thresholdQuest) return false;
      // Skip internal ecosystem transfers (vault ↔ vault, pool ↔ treasury)
      const fromKnown = knownAddresses.isKnownAddress(t.from);
      const toKnown = knownAddresses.isKnownAddress(t.to);
      if (fromKnown && toKnown) return false;
      return true;
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Calculate net flow for a wallet from a list of transfers.
 * Positive = net inflow, negative = net outflow.
 */
export function calculateNetFlow(transfers: QuestTransfer[], wallet: string): number {
  let net = 0;
  const addr = wallet.toLowerCase();
  for (const t of transfers) {
    if (t.to.toLowerCase() === addr) net += t.amount;
    if (t.from.toLowerCase() === addr) net -= t.amount;
  }
  return net;
}

/**
 * Get volume summary: total transferred, unique senders/receivers, count.
 */
export function getVolumeSummary(transfers: QuestTransfer[]): {
  totalVolume: number;
  transferCount: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  largestTransfer: QuestTransfer | null;
} {
  const senders = new Set<string>();
  const receivers = new Set<string>();
  let totalVolume = 0;
  let largest: QuestTransfer | null = null;

  for (const t of transfers) {
    totalVolume += t.amount;
    senders.add(t.from.toLowerCase());
    receivers.add(t.to.toLowerCase());
    if (!largest || t.amount > largest.amount) largest = t;
  }

  return {
    totalVolume,
    transferCount: transfers.length,
    uniqueSenders: senders.size,
    uniqueReceivers: receivers.size,
    largestTransfer: largest,
  };
}
