'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * Poker-room-style history (cash sessions + tournament entries), backed by
 * /api/poker/player/:address/history. Poker is kept separate from the flat Activity
 * feed because a hand has many bets — poker rooms present sessions/tournaments, not
 * per-bet rows. All amounts are WEI strings (format with formatEther for MORBIUS).
 */
export interface PokerCashSession {
  id: string
  tableId: string
  stakes: string | null // "smallBlind / bigBlind" (whole chips), null if table was cleaned up
  buyIn: string // wei
  rebuys: string // wei
  rebuyCount: number
  cashOut: string | null // wei, null while still seated
  net: string | null // wei, null while still seated
  startedAt: string
  endedAt: string | null
  ongoing: boolean
}

export interface PokerTournamentEntry {
  tournamentId: string
  name: string
  status: string
  buyIn: string // wei
  prizeWon: string // wei
  net: string // wei
  finalRank: number | null
  rebuyCount: number
  handsPlayed: number
  boughtInAt: string
  finishedAt: string | null
}

export interface PokerHistory {
  cashSessions: PokerCashSession[]
  tournaments: PokerTournamentEntry[]
}

export function usePokerHistory(address: string | null) {
  return useQuery<PokerHistory>({
    queryKey: ['pokerHistory', address],
    enabled: !!address,
    queryFn: async () => {
      if (!address) throw new Error('Address required')
      const res = await fetch(`/api/poker/player/${address}/history`)
      if (!res.ok) throw new Error('Failed to fetch poker history')
      const d = await res.json()
      return {
        cashSessions: Array.isArray(d?.cashSessions) ? d.cashSessions : [],
        tournaments: Array.isArray(d?.tournaments) ? d.tournaments : [],
      }
    },
    staleTime: 30_000,
  })
}
