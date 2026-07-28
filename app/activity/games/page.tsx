'use client'

/**
 * /activity/games — per-game bet limits and performance.
 *
 * Admin-only, same posture as the rest of /activity: the wallet allowlist gates
 * the UI, and every endpoint it reads is session + allowlist gated server-side.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import GameLimitsGrid from '@/components/activity/GameLimitsGrid'
import { isAdminWallet } from '@/lib/admin'
import { useTokenBalance } from '@/hooks/use-token'
import { MORBIUS_VAULT_ADDRESS } from '@/lib/contracts'
import type { DashWindow } from '@/hooks/use-admin-dashboard'

const WINDOWS: Array<{ key: DashWindow; label: string }> = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

export default function GameLimitsPage() {
  const { address } = useAccount()
  const isAdmin = isAdminWallet(address)
  const [win, setWin] = useState<DashWindow>('7d')

  // Bankroll for the exposure %: the on-chain vault, read live rather than
  // hardcoded, so "% of bankroll" means something real.
  const { balanceFormatted: vaultRaw } = useTokenBalance(isAdmin ? MORBIUS_VAULT_ADDRESS : undefined)
  const bankroll = useMemo(() => {
    const n = Math.floor(Number(vaultRaw || '0'))
    return Number.isFinite(n) ? n : 0
  }, [vaultRaw])

  if (!isAdmin) {
    return (
      <GlobalMainNav>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
          <ShieldAlert className="h-10 w-10 text-white/30" />
          <h1 className="text-xl font-bold text-white">Admins only</h1>
          <p className="max-w-sm text-sm text-white/50">Game limits are restricted to admin wallets.</p>
        </div>
      </GlobalMainNav>
    )
  }

  return (
    <GlobalMainNav>
      <div className="relative min-h-screen w-full bg-[#070a12]">
        <div className="mx-auto max-w-[1500px] px-4 py-6 pb-28 sm:py-8">
          <Link
            href="/activity"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white/45 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
          </Link>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Game limits</h1>
              <p className="mt-1 text-sm text-white/50">
                Min and max bet per game · stats for the last{' '}
                {(WINDOWS.find((w) => w.key === win)?.label ?? '').toLowerCase()}
                {bankroll > 0 && <> · bankroll {bankroll.toLocaleString()} MORBIUS</>}
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => setWin(w.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    win === w.key ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <GameLimitsGrid enabled={isAdmin} window={win} bankroll={bankroll} />
        </div>
      </div>
    </GlobalMainNav>
  )
}
