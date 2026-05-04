'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Check, ChevronDown, ShieldOff, AlertTriangle } from 'lucide-react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { pulsechain } from 'wagmi/chains'
import { formatUnits } from 'viem'
import { toast } from 'sonner'
import { useAllowances, type AllowanceRow } from '@/hooks/use-allowances'
import { useRevokeApproval } from '@/hooks/use-revoke-approval'

const UNLIMITED_THRESHOLD = 1n << 255n

function formatAllowance(value: bigint): string {
  if (value >= UNLIMITED_THRESHOLD) return 'Unlimited'
  const whole = formatUnits(value, 18)
  const num = Number(whole)
  if (!Number.isFinite(num)) return whole
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export interface RevokeApprovalsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function RevokeApprovalsModal({ isOpen, onClose }: RevokeApprovalsModalProps) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { rows, isLoading, refetch } = useAllowances()
  const { revoke, statusOf, errorOf } = useRevokeApproval()
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const onWrongChain = isConnected && chainId !== pulsechain.id

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const { current, legacy, legacyActiveCount } = useMemo(() => {
    const active = rows.filter((r) => r.allowance > 0n)
    const current = active.filter((r) => !r.isLegacy)
    const legacy = active.filter((r) => r.isLegacy)
    return { current, legacy, legacyActiveCount: legacy.length }
  }, [rows])

  const handleRevoke = async (row: AllowanceRow) => {
    const label = `${row.tokenLabel} → ${row.spenderLabel}`
    const toastId = `revoke-${row.token}-${row.spender}`
    try {
      toast.info(`Revoking ${label}…`, { id: toastId, description: 'Confirm in your wallet.', duration: Infinity })
      await revoke(row.token, row.spender)
      toast.success(`Revoked ${label}`, { id: toastId, duration: 6000 })
      void refetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revoke failed'
      toast.error(`Failed to revoke ${label}`, { id: toastId, description: msg.slice(0, 160), duration: 8000 })
    }
  }

  if (!mounted || !isOpen) return null

  const renderRow = (row: AllowanceRow) => {
    const status = statusOf(row.token, row.spender)
    const busy = status === 'submitting' || status === 'confirming'
    const done = status === 'confirmed' || row.allowance === 0n
    const err = errorOf(row.token, row.spender)
    return (
      <div
        key={`${row.token}:${row.spender}`}
        className="flex items-center gap-3 px-3 py-2 rounded-md border border-white/5 bg-white/[0.03]"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white font-semibold truncate">
            {row.tokenLabel} → {row.spenderLabel}
          </div>
          <div className="text-[11px] text-white/50 font-mono truncate" title={row.spender}>
            {row.spender}
          </div>
          {err && <div className="text-[11px] text-red-400 mt-0.5 truncate">{err}</div>}
        </div>
        <div className="text-xs text-cyan-300/90 font-mono whitespace-nowrap">
          {formatAllowance(row.allowance)}
        </div>
        <button
          type="button"
          disabled={busy || done || onWrongChain}
          onClick={() => handleRevoke(row)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              {status === 'submitting' ? 'Confirm…' : 'Pending'}
            </>
          ) : done ? (
            <>
              <Check size={12} />
              Revoked
            </>
          ) : (
            <>
              <ShieldOff size={12} />
              Revoke
            </>
          )}
        </button>
      </div>
    )
  }

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
            border: '1px solid rgba(6, 182, 212, 0.3)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <ShieldOff size={18} className="text-cyan-300" />
              <h2 className="text-white font-semibold">Manage Approvals</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <p className="text-xs text-white/60 leading-relaxed">
              Token allowances you&apos;ve granted to MORBlotto contracts. Revoking sets the
              allowance to 0 — you&apos;ll re-approve next time you play.
            </p>

            {!isConnected && (
              <div className="text-sm text-white/70 py-6 text-center">Connect a wallet to view approvals.</div>
            )}

            {onWrongChain && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">
                <AlertTriangle size={14} />
                <span className="flex-1">Switch to PulseChain to view and revoke approvals.</span>
                <button
                  type="button"
                  onClick={() => switchChainAsync({ chainId: pulsechain.id }).catch(() => {})}
                  className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 font-semibold"
                >
                  Switch
                </button>
              </div>
            )}

            {isConnected && !onWrongChain && isLoading && rows.length === 0 && (
              <div className="flex items-center justify-center gap-2 text-white/60 py-8 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Loading approvals…
              </div>
            )}

            {isConnected && !onWrongChain && !isLoading && current.length === 0 && legacy.length === 0 && (
              <div className="text-sm text-white/60 py-6 text-center border border-white/5 rounded-md bg-white/[0.02]">
                No active approvals — you&apos;re all set.
              </div>
            )}

            {current.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wider text-cyan-300/70 px-1">Current contracts</div>
                {current.map(renderRow)}
              </div>
            )}

            {legacy.length > 0 && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setLegacyOpen((o) => !o)}
                  className="w-full flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50 hover:text-white/80 px-1 py-1 transition-colors"
                >
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${legacyOpen ? '' : '-rotate-90'}`}
                  />
                  Legacy contracts
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 text-[10px] font-semibold">
                    {legacyActiveCount}
                  </span>
                </button>
                {legacyOpen && <div className="space-y-1.5">{legacy.map(renderRow)}</div>}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}

export default RevokeApprovalsModal
