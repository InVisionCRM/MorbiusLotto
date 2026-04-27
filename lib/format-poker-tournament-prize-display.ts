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
};

export type PayoutFormatMeta = PrizePoolFormatMeta & {
  gameType?: string | null;
};

function safeTokenDecimals(raw: number | null | undefined): number {
  const n = Number(raw ?? 18);
  if (!Number.isFinite(n)) return 18;
  return Math.min(36, Math.max(0, Math.floor(n)));
}

/**
 * Gross / listed prize pool: matches lobby — chips when no ERC-20 prize token,
 * else human amount + ticker (from symbol or shortened address).
 */
export function formatPrizePoolDisplay(prizePoolRaw: string, meta: PrizePoolFormatMeta): string {
  try {
    const raw = BigInt(prizePoolRaw || '0');
    if (!meta.prizeTokenAddress) {
      return `${formatChips(raw)} chips`;
    }
    const decimals = safeTokenDecimals(meta.prizeTokenDecimals);
    const human = trimNumericTrailingZeros(formatUnits(raw, decimals));
    const ticker =
      meta.prizeTokenSymbol?.trim() ||
      `${meta.prizeTokenAddress.slice(0, 6)}…${meta.prizeTokenAddress.slice(-4)}`;
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
    if (meta.prizeTokenAddress) {
      const decimals = safeTokenDecimals(meta.prizeTokenDecimals);
      const human = trimNumericTrailingZeros(formatUnits(raw, decimals));
      const ticker =
        meta.prizeTokenSymbol?.trim() ||
        `${meta.prizeTokenAddress.slice(0, 6)}…${meta.prizeTokenAddress.slice(-4)}`;
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
 * Buy-in display: poker uses whole chip counts; blackjack / on-chain use MORBIUS wei.
 * Zero → Free.
 */
export function formatTournamentBuyInDisplay(
  buyInRaw: string,
  meta?: { gameType?: string | null },
): string {
  try {
    const raw = BigInt(buyInRaw || '0');
    if (raw === 0n) return 'Free';
    if (meta?.gameType === 'poker') {
      return `${formatChips(raw)} chips`;
    }
    return `${formatMorbiusFloor(raw)} MORBIUS`;
  } catch {
    return '—';
  }
}
