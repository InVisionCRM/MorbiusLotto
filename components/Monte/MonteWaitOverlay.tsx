'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, Loader2, X as CloseIcon } from 'lucide-react'
import { useWaitForTransactionReceipt } from 'wagmi'
import type { Hash } from 'viem'
import { MonteGame } from './MonteGame'

export interface MonteWaitOverlayProps {
  open: boolean
  txHash?: Hash
  title?: string
  subtitle?: string
  onClose?: () => void
  onConfirmed?: () => void
  /** If true, user can close while pending. Defaults to true. */
  dismissibleWhilePending?: boolean
}

function truncateHash(hash?: string) {
  if (!hash) return ''
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

export function MonteWaitOverlay({
  open,
  txHash,
  title = 'TRANSACTION IN PROGRESS',
  subtitle,
  onClose,
  onConfirmed,
  dismissibleWhilePending = true,
}: MonteWaitOverlayProps) {
  const { isLoading, isSuccess, isError } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash && open },
  })

  const [showSuccessFlash, setShowSuccessFlash] = useState(false)

  useEffect(() => {
    if (!open) {
      setShowSuccessFlash(false)
      return
    }
    if (isSuccess) {
      setShowSuccessFlash(true)
      onConfirmed?.()
      const t = setTimeout(() => {
        onClose?.()
      }, 1800)
      return () => clearTimeout(t)
    }
  }, [open, isSuccess, onConfirmed, onClose])

  const canDismiss = dismissibleWhilePending || !isLoading || isSuccess || isError

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[120] backdrop-blur-md bg-black/70 flex items-center justify-center p-4 font-mono"
          role="dialog"
          aria-modal="true"
          aria-label="Transaction pending — play Monte while you wait"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-[640px] max-w-[92vw] border border-cyan-400/20 rounded-md bg-zinc-950/95 shadow-[0_0_60px_rgba(34,211,238,0.15)] overflow-hidden"
          >
            {canDismiss && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-sm text-zinc-500 hover:text-cyan-400 hover:bg-zinc-900 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-400"
                aria-label="Close"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-900">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-zinc-500 tracking-[0.3em] uppercase truncate">{title}</div>
                {subtitle && (
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">{subtitle}</div>
                )}
              </div>
            </div>

            <div className="px-6 py-6">
              <MonteGame variant="embedded" />
            </div>

            <div className="border-t border-zinc-900 px-6 py-4 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3 min-w-0">
                {isSuccess ? (
                  <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                ) : isError ? (
                  <CloseIcon className="w-4 h-4 text-red-500 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-[10px] text-zinc-500 tracking-widest">
                    {isSuccess
                      ? 'CONFIRMED'
                      : isError
                      ? 'TRANSACTION FAILED'
                      : 'WAITING FOR CONFIRMATION'}
                  </div>
                  {txHash && (
                    <div className="text-[11px] text-zinc-600 mt-0.5 font-mono truncate">
                      {truncateHash(txHash)}
                    </div>
                  )}
                </div>
              </div>
              {showSuccessFlash && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-[10px] text-cyan-400 tracking-widest"
                >
                  CLOSING…
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
