import { logger } from '../utils/logger';

/** Default: 0.001 MORBIUS per engine chip (10^15 wei when MORBIUS uses 18 decimals). */
export const DEFAULT_POKER_CHIP_WEI = 10n ** 15n;

export function getPokerChipWei(): bigint {
  const raw = process.env.POKER_CHIP_WEI?.trim();
  if (!raw) return DEFAULT_POKER_CHIP_WEI;
  try {
    const v = BigInt(raw);
    if (v <= 0n) return DEFAULT_POKER_CHIP_WEI;
    return v;
  } catch {
    logger.warn('Invalid POKER_CHIP_WEI env, using default');
    return DEFAULT_POKER_CHIP_WEI;
  }
}

const DEFAULT_RAKE_WALLET = '0x2D6f6a61cFDc7C7d000C9279bD7a743D277736bB'.toLowerCase();

export function getPokerRakeWallet(): string {
  const raw = process.env.POKER_RAKE_WALLET?.trim();
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return DEFAULT_RAKE_WALLET;
  }
  return raw.toLowerCase();
}

export const MAX_ENGINE_CHIPS_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export function assertCashBlindsValid(smallBlindWei: bigint, bigBlindWei: bigint): void {
  const cw = getPokerChipWei();
  if (smallBlindWei <= 0n || bigBlindWei <= 0n) throw new Error('Blinds must be positive');
  if (smallBlindWei % cw !== 0n || bigBlindWei % cw !== 0n) {
    throw new Error(
      `Blinds must be multiples of poker chip size (${cw.toString()} wei). Run migration 083 or update poker_tables.`
    );
  }
  if (bigBlindWei < smallBlindWei) throw new Error('bigBlind must be >= smallBlind');
}

export function assertCashChipMultiple(amountWei: bigint, label: string): void {
  const cw = getPokerChipWei();
  if (amountWei <= 0n) throw new Error(`${label} must be positive`);
  if (amountWei % cw !== 0n) {
    throw new Error(`${label} must be a multiple of one poker chip (${cw.toString()} wei)`);
  }
  if (amountWei / cw > MAX_ENGINE_CHIPS_BIGINT) throw new Error(`${label} too large for poker engine`);
}

export function weiToEngineChips(amountWei: bigint): number {
  assertCashChipMultiple(amountWei, 'Amount');
  const cw = getPokerChipWei();
  const chips = amountWei / cw;
  return Number(chips);
}

export function engineChipsToWeiRounded(chips: number): bigint {
  if (!Number.isFinite(chips) || chips <= 0) return 0n;
  const rounded = Math.round(chips);
  if (BigInt(rounded) > MAX_ENGINE_CHIPS_BIGINT) throw new Error('Stack overflow in poker engine');
  return BigInt(rounded) * getPokerChipWei();
}

export function enginePotChipsToPotWei(totalChipsFloat: number, chipWei: bigint): bigint {
  if (!Number.isFinite(totalChipsFloat) || totalChipsFloat <= 0) return 0n;
  const chips = BigInt(Math.max(0, Math.round(totalChipsFloat)));
  return chips * chipWei;
}

export function totalPotChips(table: {
  pots: { amount: number }[];
  players: ({ bet?: number } | null)[];
}): number {
  const potSum = table.pots.reduce((sum, p) => sum + p.amount, 0);
  const betSum = table.players.reduce((sum, p) => sum + (p?.bet ?? 0), 0);
  return potSum + betSum;
}

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
