'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Check, ChevronDown, ShieldOff, AlertTriangle, RefreshCw } from 'lucide-react'
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

  const { current, legacy, legacyActiveCount, totalActive } = useMemo(() => {
    const active = rows.filter((r) => r.allowance > 0n)
    const current = active.filter((r) => !r.isLegacy)
    const legacy = active.filter((r) => r.isLegacy)
    return {
      current,
      legacy,
      legacyActiveCount: legacy.length,
      totalActive: active.length,
    }
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

  if (!mounted) return null

  const renderRow = (row: AllowanceRow) => {
    const status = statusOf(row.token, row.spender)
    const busy = status === 'submitting' || status === 'confirming'
    const done = status === 'confirmed' || row.allowance === 0n
    const err = errorOf(row.token, row.spender)
    return (
      <div
        key={`${row.token}:${row.spender}`}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-50/80 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-900 font-semibold truncate">
            {row.tokenLabel} <span className="text-gray-400 font-normal">→</span> {row.spenderLabel}
          </div>
          <div className="text-[11px] text-gray-400 font-mono truncate" title={row.spender}>
            {row.spender}
          </div>
          {err && <div className="text-[11px] text-red-500 mt-0.5 truncate">{err}</div>}
        </div>
        <div className="text-xs text-cyan-600 font-mono whitespace-nowrap">
          {formatAllowance(row.allowance)}
        </div>
        <button
          type="button"
          disabled={busy || done || onWrongChain}
          onClick={() => handleRevoke(row)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4"
          >
            <div className="bg-white text-gray-900 p-6 sm:p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md relative border border-gray-100 pointer-events-auto overflow-y-auto max-h-[90vh]">
              <button
                onClick={onClose}
                className="absolute top-6 right-6 z-20 text-gray-400 hover:text-black bg-gray-100 p-2 rounded-full transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>

              <div className="text-center mt-2 mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-500 mb-3">
                  <ShieldOff size={22} />
                </div>
                <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold mb-1">
                  Manage Approvals
                </p>
                <div className="flex items-center justify-center gap-2">
                  <h4 className="text-4xl font-light tracking-tight text-gray-900">
                    {isLoading && rows.length === 0 ? (
                      <Loader2 className="w-7 h-7 animate-spin text-gray-300 inline" />
                    ) : (
                      totalActive
                    )}
                  </h4>
                  {isConnected && !onWrongChain && (
                    <button
                      onClick={() => void refetch()}
                      disabled={isLoading}
                      className="text-gray-300 hover:text-gray-600 transition-colors mt-1"
                      aria-label="Refresh approvals"
                    >
                      <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                  )}
                </div>
                <p className="text-gray-400 font-medium mt-1 text-sm">
                  Active {totalActive === 1 ? 'approval' : 'approvals'}
                </p>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed text-center px-2 mb-5">
                Token allowances you&apos;ve granted to MORBIUS contracts. Revoking sets the
                allowance to 0 — you&apos;ll re-approve next time you play.
              </p>

              <div className="space-y-3">
                {!isConnected && (
                  <div className="text-sm text-gray-500 py-8 text-center border border-gray-100 rounded-2xl bg-gray-50">
                    Connect a wallet to view approvals.
                  </div>
                )}

                {onWrongChain && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span className="flex-1">Switch to PulseChain to view and revoke approvals.</span>
                    <button
                      type="button"
                      onClick={() => switchChainAsync({ chainId: pulsechain.id }).catch(() => {})}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors"
                    >
                      Switch
                    </button>
                  </div>
                )}

                {isConnected && !onWrongChain && isLoading && rows.length === 0 && (
                  <div className="flex items-center justify-center gap-2 text-gray-500 py-8 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    Loading approvals…
                  </div>
                )}

                {isConnected && !onWrongChain && !isLoading && current.length === 0 && legacy.length === 0 && (
                  <div className="text-sm text-gray-500 py-8 text-center border border-gray-100 rounded-2xl bg-gray-50">
                    No active approvals — you&apos;re all set.
                  </div>
                )}

                {current.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold px-1">
                      Current contracts
                    </div>
                    <div className="space-y-1.5">{current.map(renderRow)}</div>
                  </div>
                )}

                {legacy.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setLegacyOpen((o) => !o)}
                      className="w-full flex items-center gap-2 text-[11px] uppercase tracking-widest text-gray-400 hover:text-gray-600 font-semibold px-1 py-1 transition-colors"
                    >
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${legacyOpen ? '' : '-rotate-90'}`}
                      />
                      Legacy contracts
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold normal-case tracking-normal">
                        {legacyActiveCount}
                      </span>
                    </button>
                    {legacyOpen && <div className="space-y-1.5">{legacy.map(renderRow)}</div>}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}

export default RevokeApprovalsModal
