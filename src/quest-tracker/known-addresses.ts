/**
 * Known RavenQuest ecosystem addresses on Immutable zkEVM.
 *
 * These are excluded from whale leaderboards and holder rankings,
 * but transfers TO/FROM them are flagged as notable events in digests.
 */

export interface KnownAddress {
  address: string;
  label: string;
  type: 'game' | 'liquidity' | 'treasury' | 'burn';
}

/** All known RQ ecosystem/infrastructure addresses */
export const KNOWN_ADDRESSES: KnownAddress[] = [
  // Game custody — NFTs and tokens deposited in-game
  {
    address: '0xe597f8370e99fe87de34e0c0fa863920cb39ca02',
    label: 'ItemVault (In-Game)',
    type: 'game',
  },
  {
    address: '0x7959c306cce2f25d4553b2c786a852d0801a3638',
    label: 'ItemDepositter (Relay)',
    type: 'game',
  },

  // TokenVaults — RQ-controlled token reserves
  {
    address: '0x44fab810139db5ad8a2c367a55f1c497e7548f5d',
    label: 'TokenVault #1',
    type: 'treasury',
  },
  {
    address: '0xfb19d0a211916d3cc692960e8224aed53678bce8',
    label: 'TokenVault #2',
    type: 'treasury',
  },

  // Safe (multisig) — likely team/treasury wallet
  {
    address: '0xca2a5f5306dec0ae30e1cb6e3058ba2b31ec6509',
    label: 'RQ Safe (Treasury)',
    type: 'treasury',
  },

  // Liquidity pools — DEX, not a "holder"
  {
    address: '0xbe2930d274f862542740dcdc95257b3163172343',
    label: 'QUEST/WIMX Pool (UniV3)',
    type: 'liquidity',
  },
  {
    address: '0x47e3cb5e2e8de2e94b25a972dbe3037916a4e653',
    label: 'QUEST/USDC Pool (UniV3)',
    type: 'liquidity',
  },

  // DEX swap router
  {
    address: '0xd67cc11151dbcccc424a16f8963ece3d0539bd61',
    label: 'ImmutableSwapProxy (DEX)',
    type: 'liquidity',
  },

  // Burn address
  {
    address: '0x000000000000000000000000000000000000dead',
    label: 'Burn Address',
    type: 'burn',
  },
];

/** Set of all known addresses (lowercase) for fast lookup */
export const KNOWN_ADDRESS_SET = new Set(KNOWN_ADDRESSES.map((a) => a.address.toLowerCase()));

/** Look up a known address label, returns undefined if not known */
export function getKnownLabel(address: string): string | undefined {
  const entry = KNOWN_ADDRESSES.find((a) => a.address.toLowerCase() === address.toLowerCase());
  return entry?.label;
}

/** Check if an address is a known ecosystem address */
export function isKnownAddress(address: string): boolean {
  return KNOWN_ADDRESS_SET.has(address.toLowerCase());
}

/** Check if an address is specifically a game custody address */
export function isGameAddress(address: string): boolean {
  const entry = KNOWN_ADDRESSES.find((a) => a.address.toLowerCase() === address.toLowerCase());
  return entry?.type === 'game';
}
