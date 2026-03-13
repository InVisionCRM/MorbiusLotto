'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, ChevronRight, AlertCircle, Loader2, MessagesSquare } from 'lucide-react'
import { WPLS_TOKEN_ADDRESS } from '@/lib/contracts'

// ── Configure your payment wallet here ──────────────────────────────────────
export const PAYMENT_WALLET = '0xEdEe8515897281CcF27999a121A90d76E3Cde016'
// ────────────────────────────────────────────────────────────────────────────

interface DexPair {
  baseToken?: { address?: string }
  priceUsd?: string
  liquidity?: { usd?: number }
}

const PLS_PRICE_REFRESH_MS = 60_000 // refresh every 60s for near real-time amount

export function usePlsUsdPrice() {
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchPrice = () => {
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${WPLS_TOKEN_ADDRESS}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return
          const pairs: DexPair[] = data.pairs ?? []
          const wplsPairs = pairs
            .filter(
              (p) =>
                p.baseToken?.address?.toLowerCase() === WPLS_TOKEN_ADDRESS.toLowerCase() &&
                p.priceUsd
            )
            .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
          if (wplsPairs[0]?.priceUsd) {
            setPrice(parseFloat(wplsPairs[0].priceUsd))
            setError(false)
          } else {
            setError(true)
          }
        })
        .catch(() => {
          if (!cancelled) setError(true)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    setLoading(true)
    fetchPrice()
    const interval = setInterval(fetchPrice, PLS_PRICE_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return { price, loading, error }
}

function CopyButton({ text, accent = 'cyan' }: { text: string; accent?: 'cyan' | 'amber' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const colorClass =
    accent === 'amber'
      ? 'bg-amber-600/20 hover:bg-amber-600/35 border-amber-500/40 text-amber-300'
      : 'bg-cyan-600/20 hover:bg-cyan-600/35 border-cyan-500/40 text-cyan-300'

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all shrink-0 ${colorClass}`}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          Copy
        </>
      )}
    </button>
  )
}

interface CryptoPaymentPanelProps {
  /** USD price to charge. Defaults to 99 (custom table deal). */
  usdPrice?: number
  /** Panel heading. */
  title?: string
  /** Panel sub-heading. */
  subtitle?: string
  /**
   * Pre-filled Telegram message so you get notified with context.
   * Defaults to a generic message.
   */
  telegramText?: string
  /** Accent color scheme. */
  accent?: 'cyan' | 'amber'
}

export function CryptoPaymentPanel({
  usdPrice = 49,
  title = 'Payment for Custom Blackjack Table',
  subtitle = 'One-time setup fee — 24hr turnaround guaranteed',
  telegramText,
  accent = 'cyan',
}: CryptoPaymentPanelProps = {}) {
  const { price: plsUsdPrice, loading, error } = usePlsUsdPrice()

  const plsAmount = plsUsdPrice ? usdPrice / plsUsdPrice : null
  const plsAmountFormatted = plsAmount
    ? plsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : null

  const defaultTelegramText = telegramText ?? `Hi! I just sent payment for: ${title} ($${usdPrice} USD). My TX Hash: `
  const telegramLink = `https://t.me/kylecruise?text=${encodeURIComponent(defaultTelegramText)}`

  const isAmber = accent === 'amber'

  const borderColor = isAmber ? 'rgba(245,158,11,0.35)' : 'rgba(6,182,212,0.25)'
  const glowColor  = isAmber ? 'rgba(245,158,11,0.08)' : 'rgba(6,182,212,0.08)'
  const accentCalloutBg     = isAmber ? 'bg-amber-950/30 border-amber-500/20' : 'bg-cyan-950/30 border-cyan-500/20'
  const accentCalloutText   = isAmber ? 'text-amber-400' : 'text-cyan-400'
  const accentCalloutBody   = isAmber ? 'text-amber-300 font-semibold' : 'text-cyan-300 font-semibold'
  const stepActiveClass     = isAmber ? 'bg-amber-500 text-slate-900' : 'bg-cyan-500 text-slate-900'

  return (
    <div
      className="w-full max-w-lg mx-auto rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(10,15,30,0.97) 0%, rgba(15,25,50,0.97) 100%)',
        boxShadow: `0 0 40px ${glowColor}, 0 8px 32px rgba(0,0,0,0.6)`,
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Step bar */}
      <div className="flex items-center justify-center gap-2 px-6 py-4 border-b border-white/10 bg-white/[0.03]">
        {(['Pay', 'Verify', 'Confirm'] as const).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                i === 0 ? stepActiveClass : 'bg-slate-700 text-slate-400'
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-sm font-medium ${i === 0 ? 'text-white' : 'text-slate-500'}`}>
              {label}
            </span>
            {i < 2 && <ChevronRight className="w-4 h-4 text-slate-600" />}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="p-6 space-y-5">
        {/* Title */}
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
        </div>

        {/* Amount row */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Amount to send (PLS)
          </label>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 px-4 py-3 rounded-xl font-mono text-base text-white bg-slate-800/60 border border-slate-600/50"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {loading ? (
                <span className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Fetching live price…
                </span>
              ) : error || !plsAmountFormatted ? (
                <span className="text-red-400 text-sm">Price unavailable — check DexScreener</span>
              ) : (
                `${plsAmountFormatted} PLS`
              )}
            </div>
            {plsAmountFormatted && <CopyButton text={plsAmountFormatted} accent={accent} />}
          </div>
          {plsAmount && (
            <p className="text-xs text-slate-500 pl-1">
              ~${usdPrice}.00 USD at current PLS price
              {plsUsdPrice && (
                <span className="ml-1 text-slate-600">
                  (1 PLS ≈ ${plsUsdPrice.toFixed(6)})
                </span>
              )}
            </p>
          )}
        </div>

        {/* Address row */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Send to address
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-4 py-3 rounded-xl font-mono text-sm text-slate-200 bg-slate-800/60 border border-slate-600/50 truncate">
              {PAYMENT_WALLET}
            </div>
            <CopyButton text={PAYMENT_WALLET} accent={accent} />
          </div>
        </div>

        {/* Helper callout */}
        <div className={`flex gap-3 p-4 rounded-xl border ${accentCalloutBg}`}>
          <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${accentCalloutText}`} />
          <p className="text-sm text-slate-300 leading-relaxed">
            Send <span className="text-white font-semibold">exactly</span> the amount above on the{' '}
            <span className={accentCalloutBody}>PulseChain network</span>. Network fees are paid by
            the sender. Double-check the address before sending.
          </p>
        </div>

        {/* After payment instructions */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">After payment</p>
          <ol className="space-y-2 text-sm text-slate-300">
            <li className="flex gap-2">
              <span className={`font-bold shrink-0 ${accentCalloutText}`}>1.</span>
              Copy your transaction hash from your wallet
            </li>
            <li className="flex gap-2">
              <span className={`font-bold shrink-0 ${accentCalloutText}`}>2.</span>
              <span>
                Message us on Telegram with your tx hash — tap below and it&apos;ll be pre-filled:
              </span>
            </li>
          </ol>
          <a
            href={telegramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{
              background: isAmber
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : 'linear-gradient(135deg, #0ea5e9, #0369a1)',
              boxShadow: isAmber
                ? '0 4px 16px rgba(245,158,11,0.3)'
                : '0 4px 16px rgba(14,165,233,0.25)',
            }}
          >
            <MessagesSquare className="w-4 h-4" />
            Notify Us on Telegram
          </a>
          <p className="text-xs text-slate-600 text-center">
            We&apos;ll confirm and get your order live ASAP.
          </p>
        </div>

        {/* PulseChain network warning */}
        <p className="text-xs text-slate-600 text-center">
          Make sure you are on the <span className="text-slate-500">PulseChain</span> network.
          Sending on the wrong chain will result in lost funds.
        </p>
      </div>
    </div>
  )
}
