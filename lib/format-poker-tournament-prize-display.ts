import { formatUnits } from 'viem';
import { formatChips } from '@/lib/format-poker-chips';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';

function trimNumericTrailingZeros(human: string): string {
  if (!human.includes('.')) return human;
  return human.replace(/\.?0+$/, '');
}

export type PrizePoolFormatMeta = {
  prizeTokenAddress: string | null;
  prizeTokenDecimals?: number | null;
  prizeTokenSymbol?: string | null;
  /** Human-readable token name (e.g. from picker); preferred over symbol in UI. */
  prizeTokenName?: string | null;
};

export type PayoutFormatMeta = PrizePoolFormatMeta & {
  gameType?: string | null;
};

/** Normalize prize-token fields from API rows (camelCase and/or snake_case). */
export function coalescePrizeTokenMeta(r: Record<string, unknown>): PrizePoolFormatMeta {
  const rawAddr = r.prizeTokenAddress ?? r.prize_token_address;
  const addrStr = typeof rawAddr === 'string' ? rawAddr.trim() : '';
  const prizeTokenAddress =
    addrStr &&
    /^0x[a-fA-F0-9]{40}$/i.test(addrStr) &&
    !/^0x0{40}$/i.test(addrStr)
      ? addrStr
      : null;

  const rawDec = r.prizeTokenDecimals ?? r.prize_token_decimals;
  let prizeTokenDecimals: number | null = null;
  if (rawDec != null && rawDec !== '') {
    const n = Number(rawDec);
    prizeTokenDecimals = Number.isFinite(n) ? n : null;
  }

  const rawSym = r.prizeTokenSymbol ?? r.prize_token_symbol;
  const prizeTokenSymbol =
    typeof rawSym === 'string' && rawSym.trim() ? rawSym.trim() : null;

  const rawName = r.prizeTokenName ?? r.prize_token_name;
  const prizeTokenName =
    typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null;

  return { prizeTokenAddress, prizeTokenDecimals, prizeTokenSymbol, prizeTokenName };
}

/** Label after a formatted amount for custom-token prizes: name → symbol → generic (never a raw address). */
export function formatPrizeTokenUnitLabel(meta: Pick<PrizePoolFormatMeta, 'prizeTokenName' | 'prizeTokenSymbol' | 'prizeTokenAddress'>): string {
  const name = meta.prizeTokenName?.trim();
  if (name) return name;
  const sym = meta.prizeTokenSymbol?.trim();
  if (sym) return sym;
  if (meta.prizeTokenAddress?.trim()) return 'Token';
  return 'Token';
}

export function prizePoolMetaFromHistoryRow(r: Record<string, unknown>): PrizePoolFormatMeta {
  return coalescePrizeTokenMeta(r);
}

export function payoutMetaFromHistoryRow(r: Record<string, unknown>): PayoutFormatMeta {
  const base = coalescePrizeTokenMeta(r);
  const gt = r.gameType ?? r.game_type;
  const gameType = typeof gt === 'string' && gt.trim() ? gt.trim() : null;
  return { ...base, gameType };
}

function safeTokenDecimals(raw: number | null | undefined): number {
  const n = Number(raw ?? 18);
  if (!Number.isFinite(n)) return 18;
  return Math.min(36, Math.max(0, Math.floor(n)));
}

/**
 * Gross / listed prize pool: matches lobby — chips when no ERC-20 prize token,
 * else human amount + unit label (token name, else symbol, else "Token").
 */
export function formatPrizePoolDisplay(prizePoolRaw: string, meta: PrizePoolFormatMeta): string {
  try {
    const raw = BigInt(prizePoolRaw || '0');
    const tokenAddr = meta.prizeTokenAddress?.trim();
    if (!tokenAddr) {
      return `${formatChips(raw)} chips`;
    }
    const decimals = safeTokenDecimals(meta.prizeTokenDecimals);
    const human = trimNumericTrailingZeros(formatUnits(raw, decimals));
    const ticker = formatPrizeTokenUnitLabel(meta);
    return `${human} ${ticker}`;
  } catch {
    return '—';
  }
}

/**
 * Settlement unit for a payout (prize_won): token wei, poker chips, or MORBIUS wei.
 */
export function formatTournamentPayoutDisplay(amountRaw: string, meta: PayoutFormatMeta): string {
  try {
    const raw = BigInt(amountRaw || '0');
    if (raw === 0n) return '—';
    const tokenAddr = meta.prizeTokenAddress?.trim();
    if (tokenAddr) {
      const decimals = safeTokenDecimals(meta.prizeTokenDecimals);
      const human = trimNumericTrailingZeros(formatUnits(raw, decimals));
      const ticker = formatPrizeTokenUnitLabel(meta);
      return `${human} ${ticker}`;
    }
    if (meta.gameType === 'poker') {
      return `${formatChips(raw)} chips`;
    }
    return `${formatMorbiusFloor(raw)} MORBIUS`;
  } catch {
    return '—';
  }
}

/**
 * Buy-in display:
 *  - custom on-chain token (any game) → human amount + ticker, decimal-adjusted
 *  - poker chips → formatted chip count
 *  - default → MORBIUS wei
 * Zero → Free.
 */
export function formatTournamentBuyInDisplay(
  buyInRaw: string,
  meta?: { gameType?: string | null } & Partial<PrizePoolFormatMeta>,
): string {
  try {
    const raw = BigInt(buyInRaw || '0');
    if (raw === 0n) return 'Free';
    const tokenAddr = meta?.prizeTokenAddress?.trim();
    if (tokenAddr) {
      const decimals = safeTokenDecimals(meta?.prizeTokenDecimals);
      const human = trimNumericTrailingZeros(formatUnits(raw, decimals));
      const ticker = formatPrizeTokenUnitLabel({
        prizeTokenAddress: tokenAddr,
        prizeTokenSymbol: meta?.prizeTokenSymbol ?? null,
        prizeTokenName: meta?.prizeTokenName ?? null,
      });
      return `${human} ${ticker}`;
    }
    if (meta?.gameType === 'poker') {
      return `${formatChips(raw)} chips`;
    }
    return `${formatMorbiusFloor(raw)} MORBIUS`;
  } catch {
    return '—';
  }
}

/** Convenience: derive buy-in meta from a history row (snake/camel agnostic). */
export function buyInMetaFromHistoryRow(r: Record<string, unknown>): { gameType: string | null } & PrizePoolFormatMeta {
  const base = coalescePrizeTokenMeta(r);
  const gt = r.gameType ?? r.game_type;
  const gameType = typeof gt === 'string' && gt.trim() ? gt.trim() : null;
  return { ...base, gameType };
}
