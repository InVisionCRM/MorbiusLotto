'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * Deposit / withdrawal transaction history, backed by /api/players/:address/transactions
 * (player_deposits + pending_withdrawals, with statuses). `amount` is a WEI string —
 * format with formatEther for MORBIUS.
 */
export interface PlayerTransaction {
  type: 'deposit' | 'withdrawal'
  amount: string // wei
  status: string // 'completed' | 'expired' | 'pending' | ...
  txHash: string | null
  createdAt: string // ISO
}

function parse(raw: any): PlayerTransaction {
  return {
    type: raw?.type === 'withdrawal' ? 'withdrawal' : 'deposit',
    amount: String(raw?.amount ?? '0'),
    status: String(raw?.status ?? 'completed'),
    txHash: raw?.tx_hash ?? raw?.txHash ?? null,
    createdAt: String(raw?.created_at ?? raw?.createdAt ?? ''),
  }
}

export function usePlayerTransactions(address: string | null, limit = 1000) {
  return useQuery<PlayerTransaction[]>({
    queryKey: ['playerTransactions', address, limit],
    enabled: !!address,
    staleTime: 30_000,
    queryFn: async () => {
      if (!address) throw new Error('Address required')
      const res = await fetch(`/api/players/${address}/transactions?limit=${limit}`)
      if (!res.ok) throw new Error('Failed to fetch transactions')
      const data = await res.json()
      return Array.isArray(data) ? data.map(parse) : []
    },
  })
}
