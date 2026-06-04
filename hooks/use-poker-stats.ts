'use client';

import { useQuery } from '@tanstack/react-query';
import type { VerifyHand } from '@/lib/poker-replay';

export interface PokerHandListEntry {
  id: string;
  table_id: string | null;
  /** Set when the hand was played on a tournament table (retained after SNG table delete). */
  tournamentId: string | null;
  tournamentName: string | null;
  hand_number: number;
  pot_amount: string;
  community_cards: number[];
  result: { winners: Array<{ address: string; amount: string; handName?: string }> } | null;
  completed_at: string;
  myContributed: string;
  myWon: string;
  resultType: 'win' | 'loss' | 'fold';
}

export interface PokerPositionWinRate {
  hands: number;
  win_rate: number;
}

export interface PokerPlayerStats {
  total_hands: number;
  hands_won: number;
  win_rate: number;
  total_wagered: string;
  total_won: string;
  profit_loss: string;
  roi: number;
  current_streak: number;
  best_streak: number;
  biggest_pot_won: string;
  biggest_loss: string;
  // HUD 6
  vpip_pct: number;
  pfr_pct: number;
  three_bet_pct: number;
  wtsd_pct: number;
  wsd_pct: number;
  aggression_factor: number | null;
  // Add-ons
  bb_per_100: number | null;
  showdown_win_rate: number;
  non_showdown_win_rate: number;
  tournament_hands: number;
  position_win_rates: {
    button: PokerPositionWinRate;
    small_blind: PokerPositionWinRate;
    big_blind: PokerPositionWinRate;
    other: PokerPositionWinRate;
  };
  winning_hand_breakdown: Array<{ hand_name: string; count: number }>;
}

export interface PokerHandDetail {
  id: string;
  table_id: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  hand_number: number;
  pot_amount: string;
  community_cards: number[];
  result: { winners: Array<{ address: string; amount: string; handName?: string }> } | null;
  completed_at: string;
  actions: Array<{ street: string; player_address: string; action: string; amount: string }>;
  holeCards: number[] | null;
}

function parseHandEntry(raw: any): PokerHandListEntry {
  return {
    id: raw.id,
    table_id: raw.table_id ?? null,
    tournamentId: raw.tournamentId ?? raw.tournament_id ?? null,
    tournamentName: raw.tournamentName ?? raw.tournament_name ?? null,
    hand_number: raw.hand_number ?? 0,
    pot_amount: String(raw.pot_amount ?? '0'),
    community_cards: Array.isArray(raw.community_cards) ? raw.community_cards : [],
    result: raw.result ?? null,
    completed_at: raw.completed_at ?? '',
    myContributed: String(raw.myContributed ?? raw.my_contributed ?? '0'),
    myWon: String(raw.myWon ?? raw.my_won ?? '0'),
    resultType: raw.resultType ?? raw.result_type ?? 'loss',
  };
}

export function usePokerPlayerHands(address: string | null, limit: number = 100) {
  return useQuery<PokerHandListEntry[]>({
    queryKey: ['pokerPlayerHands', address, limit],
    queryFn: async () => {
      if (!address) throw new Error('Address required');
      const res = await fetch(`/api/poker/player/${address}/hands?limit=${limit}&offset=0`);
      if (!res.ok) throw new Error('Failed to fetch poker hands');
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.hands ?? [];
      return list.map(parseHandEntry);
    },
    enabled: !!address,
  });
}

function parsePosition(raw: any): PokerPositionWinRate {
  return {
    hands: Number(raw?.hands ?? 0),
    win_rate: Number(raw?.win_rate ?? 0),
  };
}

function parsePlayerStats(data: any): PokerPlayerStats {
  const pos = data?.position_win_rates ?? {};
  return {
    total_hands: data.total_hands ?? 0,
    hands_won: data.hands_won ?? 0,
    win_rate: data.win_rate ?? 0,
    total_wagered: String(data.total_wagered ?? '0'),
    total_won: String(data.total_won ?? '0'),
    profit_loss: String(data.profit_loss ?? '0'),
    roi: data.roi ?? 0,
    current_streak: data.current_streak ?? 0,
    best_streak: data.best_streak ?? 0,
    biggest_pot_won: String(data.biggest_pot_won ?? '0'),
    biggest_loss: String(data.biggest_loss ?? '0'),
    vpip_pct: Number(data.vpip_pct ?? 0),
    pfr_pct: Number(data.pfr_pct ?? 0),
    three_bet_pct: Number(data.three_bet_pct ?? 0),
    wtsd_pct: Number(data.wtsd_pct ?? 0),
    wsd_pct: Number(data.wsd_pct ?? 0),
    aggression_factor: data.aggression_factor == null ? null : Number(data.aggression_factor),
    bb_per_100: data.bb_per_100 == null ? null : Number(data.bb_per_100),
    showdown_win_rate: Number(data.showdown_win_rate ?? 0),
    non_showdown_win_rate: Number(data.non_showdown_win_rate ?? 0),
    tournament_hands: Number(data.tournament_hands ?? 0),
    position_win_rates: {
      button: parsePosition(pos.button),
      small_blind: parsePosition(pos.small_blind),
      big_blind: parsePosition(pos.big_blind),
      other: parsePosition(pos.other),
    },
    winning_hand_breakdown: Array.isArray(data.winning_hand_breakdown)
      ? data.winning_hand_breakdown.map((b: any) => ({
          hand_name: String(b?.hand_name ?? ''),
          count: Number(b?.count ?? 0),
        }))
      : [],
  };
}

export type PokerStatsScope = 'cash' | 'tournament' | 'all';

export function usePokerPlayerStats(address: string | null, scope: PokerStatsScope = 'cash') {
  return useQuery<PokerPlayerStats>({
    queryKey: ['pokerPlayerStats', address, scope],
    queryFn: async () => {
      if (!address) throw new Error('Address required');
      const res = await fetch(`/api/poker/player/${address}/stats?scope=${scope}`);
      if (!res.ok) throw new Error('Failed to fetch poker stats');
      const data = await res.json();
      return parsePlayerStats(data);
    },
    enabled: !!address,
    refetchInterval: 30_000,
  });
}

export interface PokerPlayerTableStats extends PokerPlayerStats {
  hands_history: Array<{
    hand_number: number;
    completed_at: string;
    my_contributed: string;
    my_won: string;
    result_type: 'win' | 'loss' | 'fold';
  }>;
}

export function usePokerPlayerTableStats(tableId: string | null, address: string | null) {
  return useQuery<PokerPlayerTableStats>({
    queryKey: ['pokerPlayerTableStats', tableId, address],
    queryFn: async () => {
      if (!tableId || !address) throw new Error('Table ID and address required');
      const res = await fetch(`/api/poker/table/${tableId}/player/${address}/stats`);
      if (!res.ok) throw new Error('Failed to fetch poker table stats');
      const data = await res.json();
      return {
        ...parsePlayerStats(data),
        hands_history: Array.isArray(data.hands_history)
          ? data.hands_history.map((h: any) => ({
              hand_number: h.hand_number ?? 0,
              completed_at: h.completed_at ?? '',
              my_contributed: String(h.my_contributed ?? '0'),
              my_won: String(h.my_won ?? '0'),
              result_type: h.result_type ?? 'loss',
            }))
          : [],
      };
    },
    enabled: !!tableId && !!address,
    refetchInterval: 15_000,
  });
}

export function usePokerHandDetail(handId: string | null, playerAddress: string | null) {
  return useQuery<PokerHandDetail | null>({
    queryKey: ['pokerHandDetail', handId, playerAddress],
    queryFn: async () => {
      if (!handId || !playerAddress) return null;
      const res = await fetch(
        `/api/poker/hands/${handId}?playerAddress=${encodeURIComponent(playerAddress)}`
      );
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch hand detail');
      }
      const data = await res.json();
      return {
        id: data.id,
        table_id: data.table_id ?? null,
        tournamentId: data.tournamentId ?? data.tournament_id ?? null,
        tournamentName: data.tournamentName ?? data.tournament_name ?? null,
        hand_number: data.hand_number ?? 0,
        pot_amount: String(data.pot_amount ?? '0'),
        community_cards: Array.isArray(data.community_cards) ? data.community_cards : [],
        result: data.result ?? null,
        completed_at: data.completed_at ?? '',
        actions: Array.isArray(data.actions) ? data.actions : [],
        holeCards: data.holeCards ?? null,
      };
    },
    enabled: !!handId && !!playerAddress,
  });
}

/**
 * Full replay payload for a completed hand from the PUBLIC provably-fair verify endpoint —
 * every dealt-in player's hole cards, the board, the action log, and the winners. Drives the
 * off-turn dock Replay (winner + all showdown). Completed hands are immutable, so cache forever.
 */
export function usePokerHandVerify(handId: string | null) {
  return useQuery<VerifyHand | null>({
    queryKey: ['pokerHandVerify', handId],
    queryFn: async () => {
      if (!handId) return null;
      const res = await fetch(`/api/poker/verify/${handId}`);
      if (!res.ok) return null;
      const d = await res.json();
      return {
        handId: d.handId,
        handNumber: Number(d.handNumber ?? 0),
        communityCards: Array.isArray(d.communityCards) ? d.communityCards : [],
        players: Array.isArray(d.players)
          ? d.players.map((p: any) => ({
              address: String(p.address ?? ''),
              seatPosition: p.seatPosition != null ? Number(p.seatPosition) : null,
              holeCards: Array.isArray(p.holeCards) ? p.holeCards : [],
            }))
          : [],
        actions: Array.isArray(d.actions)
          ? d.actions.map((a: any) => ({
              order: Number(a.order ?? 0),
              street: String(a.street ?? 'preflop'),
              address: String(a.address ?? ''),
              action: String(a.action ?? ''),
              amount: String(a.amount ?? '0'),
            }))
          : [],
        result: d.result ?? null,
      };
    },
    enabled: !!handId,
    staleTime: Infinity,
  });
}
