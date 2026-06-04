import { toBigIntSafe } from '@/lib/safe-bigint';
import type { PokerHandListEntry } from '@/hooks/use-poker-stats';

/**
 * Shapes + computation for the portrait dock's "My Stats" and "Table" pages.
 *
 * Session stats are derived CLIENT-SIDE from the player's recent hand list (already fetched for
 * the Replay picker) filtered to this sitting — by tournament when in one (so it survives table
 * moves), otherwise by table. Table stats come from the server (usePokerPlayerTableStats).
 */

export interface DockSessionStats {
  hands: number;
  won: number;
  folded: number;
  /** Signed chip-int (Σ won − Σ contributed) over the session. */
  netChips: string;
  /** Largest pot taken down this session, chip-int. */
  biggestPotChips: string;
}

export interface DockTableStats {
  hands: number;
  winRatePct: number; // 0–100
  profitLossChips: string; // signed chip-int
  biggestPotChips: string;
  vpipPct: number; // 0–100
  pfrPct: number; // 0–100
}

export interface DockStatsData {
  session: DockSessionStats | null;
  table: DockTableStats | null;
  loadingTable: boolean;
}

export type DockTableInfo =
  | {
      kind: 'cash';
      smallBlind: string; // display-formatted
      bigBlind: string; // display-formatted
      minBuyIn: string; // display-formatted (40 BB)
      maxBuyIn: string; // display-formatted (100 BB)
      seatsLabel: string; // "6 / 9"
      potChips: string;
      sponsor: string | null;
    }
  | {
      kind: 'tournament';
      name: string;
      level: number;
      blinds: string | null;
      nextLevel: string | null; // "MM:SS" until the next level
      rank: number | null;
      playersLeft: number | null;
      prizePool: string; // already display-formatted (incl. token symbol)
      myStackBB: string | null; // "32 BB"
    };

/** Filter the recent hands to this sitting and fold them into the session summary. */
export function computeSessionStats(
  hands: PokerHandListEntry[] | undefined,
  scope: { tournamentId: string | null; tableId: string },
  sinceIso: string,
): DockSessionStats {
  let count = 0;
  let won = 0;
  let folded = 0;
  let net = 0n;
  let biggest = 0n;
  for (const h of hands ?? []) {
    const inScope = scope.tournamentId
      ? h.tournamentId === scope.tournamentId
      : h.table_id === scope.tableId;
    if (!inScope) continue;
    if (sinceIso && h.completed_at && h.completed_at < sinceIso) continue;
    count += 1;
    net += toBigIntSafe(h.myWon) - toBigIntSafe(h.myContributed);
    if (h.resultType === 'win') {
      won += 1;
      const pot = toBigIntSafe(h.pot_amount);
      if (pot > biggest) biggest = pot;
    } else if (h.resultType === 'fold') {
      folded += 1;
    }
  }
  return {
    hands: count,
    won,
    folded,
    netChips: net.toString(),
    biggestPotChips: biggest.toString(),
  };
}
