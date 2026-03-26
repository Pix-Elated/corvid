/**
 * Immutable zkEVM API client for QUEST token tracking.
 * Uses the Blockchain Data API + Blockscout Explorer API.
 */

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
  const res = await fetch(url, { headers: headers || getHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
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

/** Shorten a wallet address */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || 'unknown';
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

  return (data.items || []).slice(0, limit).map((item) => {
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
  try {
    const url = `${BLOCKSCOUT_BASE}/addresses/${wallet}/tokens?type=ERC-20`;
    const data = await fetchJson<{
      items: Array<{
        token: { address: string };
        value: string;
      }>;
    }>(url, {});

    const questToken = (data.items || []).find(
      (item) => item.token.address.toLowerCase() === QUEST_CONTRACT.toLowerCase()
    );
    return questToken ? rawToQuest(questToken.value) : 0;
  } catch {
    return 0;
  }
}

// ─── Aggregation Helpers ────────────────────────────────────────────────────

/**
 * Identify large transfers (whale movements) above a threshold.
 */
export function filterWhaleTransfers(
  transfers: QuestTransfer[],
  thresholdQuest = 10_000
): QuestTransfer[] {
  return transfers.filter((t) => t.amount >= thresholdQuest).sort((a, b) => b.amount - a.amount);
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
