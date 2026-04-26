/**
 * WebSocket payload for `poker_tournament_completed` (server + client).
 * Keep in sync with `PokerTournamentService.completeTournament` broadcast.
 * Amounts are whole poker chips (off-chain ledger), not MORBIUS wei.
 */

import { POKER_CHIP_WEI } from './poker-buy-in';
import { toChipInt } from './format-poker-chips';

export interface PokerTournamentStandingRow {
  address: string;
  rank: number;
  /**
   * Chip-int when the tournament prize is chips/promo.
   * Token-wei when `prizeTokenAddress` is set on the parent payload (pair with `prizeTokenDecimals`).
   */
  prizeAmount: string;
}

export interface PokerTournamentCompletedPayload {
  tournamentId: string;
  name: string;
  /** Buy-in per entry in whole chips (0 for freerolls). */
  buyInAmount: string;
  /** Chip-int OR token-wei depending on `prizeTokenAddress`. The "Chips" suffix is historical. */
  grossPrizePoolChips: string;
  platformFeeChips: string;
  creatorFeeChips: string;
  handRakeTotalChips: string;
  totalHands: number;
  elapsedMs: number | null;
  firstHandAt: string | null;
  lastHandAt: string | null;
  endedAt: string | null;
  standings: PokerTournamentStandingRow[];
  /** Set for custom-token freerolls; null/undefined for chip/promo tournaments. */
  prizeTokenAddress?: string | null;
  prizeTokenDecimals?: number | null;
  prizeTokenSymbol?: string | null;
}

function numString(v: unknown, fallback = '0'): string {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  return fallback;
}

/** Legacy server payloads used *Wei suffix with wei strings; convert to chip integers. */
function legacyWeiToChipsString(wei: unknown): string {
  const w = numString(wei, '0');
  try {
    return (BigInt(w) / POKER_CHIP_WEI).toString();
  } catch {
    return '0';
  }
}

export function normalizePokerTournamentCompletedPayload(raw: unknown): PokerTournamentCompletedPayload {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const tid = typeof p.tournamentId === 'string' ? p.tournamentId : '';
  const listRaw = Array.isArray(p.standings) ? p.standings : Array.isArray(p.winners) ? p.winners : [];
  const hasNewPool = typeof p.grossPrizePoolChips === 'string' && p.grossPrizePoolChips.length > 0;

  // Custom-token tournaments carry token-wei, not chips. Skip the chip-int coercion so
  // we don't risk losing precision on huge wei values down the road, and so the formatter
  // can branch on `prizeTokenAddress` without re-parsing.
  const prizeTokenAddress = typeof p.prizeTokenAddress === 'string' && p.prizeTokenAddress.length > 0
    ? p.prizeTokenAddress
    : null;
  const prizeTokenDecimals = p.prizeTokenDecimals != null && Number.isFinite(Number(p.prizeTokenDecimals))
    ? Number(p.prizeTokenDecimals)
    : null;
  const prizeTokenSymbol = typeof p.prizeTokenSymbol === 'string' && p.prizeTokenSymbol.length > 0
    ? p.prizeTokenSymbol
    : null;
  const isCustomToken = !!prizeTokenAddress;

  const standings: PokerTournamentStandingRow[] = (listRaw as unknown[]).map((row) => {
    const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const rawPrize = r.prizeAmount ?? r.prize_amount;
    let prizeAmount: string;
    if (isCustomToken) prizeAmount = numString(rawPrize, '0');
    else if (hasNewPool) prizeAmount = toChipInt(rawPrize).toString();
    else prizeAmount = legacyWeiToChipsString(rawPrize);
    return {
      address: String(r.address ?? r.player_address ?? '').toLowerCase(),
      rank: Number(r.rank ?? r.final_rank ?? 0),
      prizeAmount,
    };
  }).filter((s) => s.address.length > 0 && Number.isFinite(s.rank) && s.rank > 0);

  const sorted = [...standings].sort((a, b) => a.rank - b.rank);

  // Pool/fee fields keep their stringified amounts as-is for custom-token; the consumer formats.
  const passThrough = (key: string, legacyKey: string): string => {
    if (isCustomToken) return numString(p[key], '0');
    if (hasNewPool && typeof p[key] === 'string' && (p[key] as string).length > 0) return numString(p[key]);
    return legacyWeiToChipsString(p[legacyKey]);
  };
  const grossPrizePoolChips = passThrough('grossPrizePoolChips', 'grossPrizePoolWei');
  const platformFeeChips = passThrough('platformFeeChips', 'platformFeeWei');
  const creatorFeeChips = passThrough('creatorFeeChips', 'creatorFeeWei');
  const handRakeTotalChips = passThrough('handRakeTotalChips', 'handRakeTotalWei');

  return {
    tournamentId: tid,
    name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Tournament',
    buyInAmount: hasNewPool ? numString(p.buyInAmount) : legacyWeiToChipsString(p.buyInAmount),
    grossPrizePoolChips,
    platformFeeChips,
    creatorFeeChips,
    handRakeTotalChips,
    totalHands: typeof p.totalHands === 'number' ? p.totalHands : Number(p.totalHands) || 0,
    elapsedMs: p.elapsedMs == null || p.elapsedMs === '' ? null : Number(p.elapsedMs),
    firstHandAt: typeof p.firstHandAt === 'string' ? p.firstHandAt : null,
    lastHandAt: typeof p.lastHandAt === 'string' ? p.lastHandAt : null,
    endedAt: typeof p.endedAt === 'string' ? p.endedAt : null,
    standings: sorted,
    prizeTokenAddress,
    prizeTokenDecimals,
    prizeTokenSymbol,
  };
}
