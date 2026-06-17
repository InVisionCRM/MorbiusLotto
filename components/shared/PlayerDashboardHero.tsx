'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatEther } from 'viem'
import { useAccount } from 'wagmi'
import { Copy, Check, Smile, SquarePen, Wallet, ShieldAlert, HelpCircle, Crown } from 'lucide-react'
import { AvatarView, DEFAULT_AVATAR_CONFIG } from '@/components/avatar'
import { useProfileForAddress } from '@/hooks/use-player-profile'
import { usePlayerStatsSummary } from '@/hooks/use-player-stats-summary'
import { HelpFaqModal } from '@/components/shared/HelpFaqModal'

/** GlobalMainNav (page wrapper) owns these modals and opens them on these events. */
function emit(event: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(event))
}

interface HeroActionBtn {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  ownOnly: boolean
}

const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0) 22%), rgba(8,20,31,0.84)',
  border: '1px solid rgba(34,211,238,0.15)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.055), inset 0 0 0 0.5px rgba(34,211,238,0.07), 0 2px 8px -4px rgba(0,0,0,0.7)',
}

function formatAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function morbiusNumber(wei: string): number {
  try {
    return Number(formatEther(BigInt(wei || '0')))
  } catch {
    return 0
  }
}

function fmt(wei: string): string {
  return morbiusNumber(wei).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function fmtSigned(wei: string): string {
  const n = morbiusNumber(wei)
  const body = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n > 0 ? `+${body}` : n < 0 ? `−${body}` : body
}

interface PlayerDashboardHeroProps {
  address: string
}

export function PlayerDashboardHero({ address }: PlayerDashboardHeroProps) {
  const { displayName, avatarConfig } = useProfileForAddress(address || null)
  const { data: summary } = usePlayerStatsSummary(address || null)
  const { address: connected, isConnected } = useAccount()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const isOwnProfile =
    isConnected && !!connected && !!address && connected.toLowerCase() === address.toLowerCase()

  const actions: HeroActionBtn[] = [
    { key: 'avatar', label: 'Edit avatar', icon: Smile, onClick: () => emit('sophie:open_avatar_editor'), ownOnly: true },
    { key: 'profile', label: 'Edit profile', icon: SquarePen, onClick: () => emit('sophie:open_profile_settings'), ownOnly: true },
    { key: 'wallet', label: 'Deposit / Withdraw', icon: Wallet, onClick: () => emit('sophie:open_game_wallet'), ownOnly: true },
    { key: 'creator', label: 'Creator page', icon: Crown, onClick: () => router.push('/creators'), ownOnly: true },
    { key: 'responsible', label: 'Responsible gaming', icon: ShieldAlert, onClick: () => emit('sophie:open_responsible_gaming'), ownOnly: false },
    { key: 'help', label: 'Help & FAQ', icon: HelpCircle, onClick: () => setHelpOpen(true), ownOnly: false },
  ]
  const visibleActions = actions.filter((a) => !a.ownOnly || isOwnProfile)

  const name = displayName || formatAddress(address)
  const net = summary?.net ?? '0'
  const netNum = morbiusNumber(net)
  const netClass = netNum > 0 ? 'text-emerald-400' : netNum < 0 ? 'text-red-400' : 'text-white/70'
  const roi = summary?.roi ?? 0
  const winRate = summary?.winRate ?? 0

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-3">
      {/* Hero card */}
      <div className="rounded-2xl p-5" style={PANEL_STYLE}>
        {/* Top-right action toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-end gap-1.5">
          {visibleActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              title={a.label}
              aria-label={a.label}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/15 bg-white/[0.03] px-2.5 py-1.5 text-[12px] font-semibold text-white/70 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-300"
            >
              <a.icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{a.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="h-[72px] w-[72px] flex-none overflow-hidden rounded-2xl border"
              style={{ borderColor: 'rgba(34,211,238,0.25)', background: 'linear-gradient(160deg,#16323b,#0e1620)' }}
            >
              <AvatarView config={avatarConfig ?? DEFAULT_AVATAR_CONFIG} compact className="h-full w-full" />
            </div>
            <div className="min-w-0">
              <h1 className="arc-display truncate text-xl font-bold uppercase tracking-[0.04em] text-white">{name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-white/55">
                <button
                  type="button"
                  onClick={copyAddress}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[12px] text-white/75 transition-colors hover:text-white"
                >
                  {formatAddress(address)}
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 opacity-60" />}
                </button>
                {summary && (
                  <>
                    <span className="h-[3px] w-[3px] rounded-full bg-white/30" />
                    <span>
                      <b className="text-cyan-400">{summary.games.toLocaleString()}</b> games
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="sm:text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Balance</div>
            <div className="arc-mono mt-1 text-[30px] font-extrabold leading-none tabular-nums text-white">
              {summary ? fmt(summary.balance) : '—'}
            </div>
            <div className="mt-1 text-[12px] text-white/55">MORBIUS available to play</div>
            <div className="mt-2.5 border-t border-white/10 pt-2.5 text-[12.5px] text-white/55">
              All-time net <span className={`tabular-nums ${netClass}`}>{fmtSigned(net)}</span>
              <span className="mx-1.5 text-white/25">·</span>
              <span className={`tabular-nums ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {roi >= 0 ? '+' : '−'}{Math.abs(roi)}% ROI
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Marquee strip */}
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl" style={PANEL_STYLE}>
        <div className="border-r border-white/10 px-5 py-3.5">
          <div className="text-[11px] uppercase tracking-wide text-white/40">Total wagered</div>
          <div className="arc-mono mt-1 text-[18px] font-bold tabular-nums text-white">{summary ? fmt(summary.totalWagered) : '—'}</div>
        </div>
        <div className="border-r border-white/10 px-5 py-3.5">
          <div className="text-[11px] uppercase tracking-wide text-white/40">Total won</div>
          <div className="arc-mono mt-1 text-[18px] font-bold tabular-nums text-white">{summary ? fmt(summary.totalWon) : '—'}</div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-[11px] uppercase tracking-wide text-white/40">Win rate</div>
          <div className="arc-mono mt-1 text-[18px] font-bold tabular-nums text-white">{summary ? `${winRate}%` : '—'}</div>
        </div>
      </div>

      {helpOpen && <HelpFaqModal onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

export default PlayerDashboardHero
