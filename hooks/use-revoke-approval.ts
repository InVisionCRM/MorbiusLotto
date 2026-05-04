'use client'

import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { pulsechain } from 'wagmi/chains'
import { ERC20_ABI } from '@/abi/erc20'

export type RevokeStatus = 'idle' | 'submitting' | 'confirming' | 'confirmed' | 'failed'

export function useRevokeApproval() {
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: pulsechain.id })
  const { address } = useAccount()
  const [statuses, setStatuses] = useState<Record<string, RevokeStatus>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const keyOf = (token: `0x${string}`, spender: `0x${string}`) =>
    `${token.toLowerCase()}:${spender.toLowerCase()}`

  const revoke = useCallback(
    async (token: `0x${string}`, spender: `0x${string}`) => {
      const key = keyOf(token, spender)
      setErrors((e) => ({ ...e, [key]: '' }))
      setStatuses((s) => ({ ...s, [key]: 'submitting' }))
      try {
        if (!address) throw new Error('Wallet not connected')
        const hash = await writeContractAsync({
          address: token,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spender, 0n],
          chainId: pulsechain.id,
          chain: pulsechain,
          account: address,
        })
        setStatuses((s) => ({ ...s, [key]: 'confirming' }))
        if (publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({ hash })
          if (receipt.status === 'reverted') throw new Error('Revoke transaction reverted')
        }
        setStatuses((s) => ({ ...s, [key]: 'confirmed' }))
        return hash
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Revoke failed'
        setErrors((e) => ({ ...e, [key]: message }))
        setStatuses((s) => ({ ...s, [key]: 'failed' }))
        throw err
      }
    },
    [writeContractAsync, publicClient, address],
  )

  const statusOf = (token: `0x${string}`, spender: `0x${string}`): RevokeStatus =>
    statuses[keyOf(token, spender)] ?? 'idle'

  const errorOf = (token: `0x${string}`, spender: `0x${string}`): string =>
    errors[keyOf(token, spender)] ?? ''

  return { revoke, statusOf, errorOf }
}
