'use client';

import { useQuery } from '@tanstack/react-query';

export interface PokerHandListEntry {
  id: string;
  table_id: string;
  hand_number: number;
  pot_amount: string;
  community_cards: number[];
  result: { winners: Array<{ address: string; amount: string; handName?: string }> } | null;
  completed_at: string;
  myContributed: string;
  myWon: string;
  resultType: 'win' | 'loss' | 'fold';
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
}

export interface PokerHandDetail {
  id: string;
  table_id: string;
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
    table_id: raw.table_id,
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

export function usePokerPlayerStats(address: string | null) {
  return useQuery<PokerPlayerStats>({
    queryKey: ['pokerPlayerStats', address],
    queryFn: async () => {
      if (!address) throw new Error('Address required');
      const res = await fetch(`/api/poker/player/${address}/stats`);
      if (!res.ok) throw new Error('Failed to fetch poker stats');
      const data = await res.json();
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
      };
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
        table_id: data.table_id,
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
