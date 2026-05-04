'use client'

import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { pulsechain } from 'wagmi/chains'
import { ERC20_ABI } from '@/abi/erc20'
import { REVOKE_TARGETS, type RevokeTarget } from '@/lib/revoke-targets'

export type AllowanceRow = RevokeTarget & {
  allowance: bigint
}

export function useAllowances() {
  const { address, isConnected } = useAccount()

  const contracts = useMemo(
    () =>
      address
        ? REVOKE_TARGETS.map((t) => ({
            address: t.token,
            abi: ERC20_ABI,
            functionName: 'allowance' as const,
            args: [address, t.spender] as const,
            chainId: pulsechain.id,
          }))
        : [],
    [address],
  )

  const { data, isLoading, isFetching, refetch } = useReadContracts({
    contracts,
    query: { enabled: Boolean(address && isConnected), staleTime: 15_000 },
  })

  const rows: AllowanceRow[] = useMemo(() => {
    if (!data) return []
    return REVOKE_TARGETS.map((t, i) => {
      const result = data[i]
      const allowance = result?.status === 'success' ? (result.result as bigint) : 0n
      return { ...t, allowance }
    })
  }, [data])

  return { rows, isLoading: isLoading || isFetching, refetch }
}
