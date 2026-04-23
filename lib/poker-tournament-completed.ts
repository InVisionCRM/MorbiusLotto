/**
 * WebSocket payload for `poker_tournament_completed` (server + client).
 * Keep in sync with `PokerTournamentService.completeTournament` broadcast.
 * Amounts are whole poker chips (off-chain ledger), not MORBIUS wei.
 */

import { POKER_CHIP_WEI } from './poker-buy-in';

export interface PokerTournamentStandingRow {
  address: string;
  rank: number;
  /** Prize in whole chips credited to the player chip wallet. */
  prizeAmount: string;
}

export interface PokerTournamentCompletedPayload {
  tournamentId: string;
  name: string;
  /** Buy-in per entry in whole chips (0 for freerolls). */
  buyInAmount: string;
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

  const standings: PokerTournamentStandingRow[] = (listRaw as unknown[]).map((row) => {
    const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const rawPrize = r.prizeAmount;
    const prizeChips = hasNewPool
      ? numString(rawPrize)
      : legacyWeiToChipsString(rawPrize);
    return {
      address: String(r.address ?? '').toLowerCase(),
      rank: Number(r.rank ?? 0),
      prizeAmount: prizeChips,
    };
  }).filter((s) => s.address.length > 0 && Number.isFinite(s.rank) && s.rank > 0);

  const sorted = [...standings].sort((a, b) => a.rank - b.rank);

  const grossPrizePoolChips = hasNewPool
    ? numString(p.grossPrizePoolChips)
    : legacyWeiToChipsString(p.grossPrizePoolWei);
  const platformFeeChips = typeof p.platformFeeChips === 'string' && p.platformFeeChips.length > 0
    ? numString(p.platformFeeChips)
    : legacyWeiToChipsString(p.platformFeeWei);
  const creatorFeeChips = typeof p.creatorFeeChips === 'string' && p.creatorFeeChips.length > 0
    ? numString(p.creatorFeeChips)
    : legacyWeiToChipsString(p.creatorFeeWei);
  const handRakeTotalChips = typeof p.handRakeTotalChips === 'string' && p.handRakeTotalChips.length > 0
    ? numString(p.handRakeTotalChips)
    : legacyWeiToChipsString(p.handRakeTotalWei);

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
  };
}
