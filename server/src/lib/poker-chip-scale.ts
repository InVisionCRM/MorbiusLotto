/**
 * Unified poker-chip scale.
 *
 * The poker engine and all `poker_*` tables (stacks, blinds, pots, bets, rake)
 * store raw chip integers. MORBIUS (wei) only appears at named boundary points:
 *   - Cash join buy-in (wei debited from balance → chips on seat)
 *   - Cash leave / re-up / rake credit (chips → wei to balance)
 *   - Tournament buy-in / prize payout (wei; chips stay virtual in-tournament)
 *
 * One chip = 10^18 wei (1 MORBIUS). Hardcoded — do not make configurable.
 */

/** 10^18 wei per chip (1 chip = 1 MORBIUS). */
export const POKER_CHIP_WEI = 10n ** 18n;

/** Chip values feed directly into the chevtek engine, which uses JS `number`. */
export const MAX_ENGINE_CHIPS_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

const DEFAULT_RAKE_WALLET = '0x2D6f6a61cFDc7C7d000C9279bD7a743D277736bB'.toLowerCase();

export function getPokerRakeWallet(): string {
  const raw = process.env.POKER_RAKE_WALLET?.trim();
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return DEFAULT_RAKE_WALLET;
  }
  return raw.toLowerCase();
}

/** Convert MORBIUS wei to chips. Throws if not a whole number of chips. */
export function weiToChips(amountWei: bigint, label = 'Amount'): number {
  if (amountWei < 0n) throw new Error(`${label} must be non-negative`);
  if (amountWei % POKER_CHIP_WEI !== 0n) {
    throw new Error(
      `${label} must be a whole number of chips (${POKER_CHIP_WEI.toString()} wei each)`,
    );
  }
  const chips = amountWei / POKER_CHIP_WEI;
  if (chips > MAX_ENGINE_CHIPS_BIGINT) throw new Error(`${label} exceeds max engine chips`);
  return Number(chips);
}

/** Convert chip count back to MORBIUS wei. */
export function chipsToWei(chips: number): bigint {
  if (!Number.isFinite(chips)) throw new Error('Chips must be finite');
  if (chips < 0) throw new Error('Chips must be non-negative');
  const rounded = Math.round(chips);
  if (BigInt(rounded) > MAX_ENGINE_CHIPS_BIGINT) throw new Error('Chip stack overflow');
  return BigInt(rounded) * POKER_CHIP_WEI;
}

/** Total chips across a chevtek Table's pots + live bets. */
export function totalPotChips(table: {
  pots: { amount: number }[];
  players: ({ bet?: number } | null)[];
}): number {
  const potSum = table.pots.reduce((sum, p) => sum + p.amount, 0);
  const betSum = table.players.reduce((sum, p) => sum + (p?.bet ?? 0), 0);
  return potSum + betSum;
}

/** Split a bigint `total` into `n` near-equal parts (remainder goes to first recipients). */
export function splitBigIntEqually(total: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const bn = BigInt(n);
  const base = total / bn;
  let rem = total % bn;
  const arr: bigint[] = [];
  for (let i = 0; i < n; i++) {
    arr.push(base + (rem > 0n ? 1n : 0n));
    if (rem > 0n) rem -= 1n;
  }
  return arr;
}
