'use client'

import React, { useEffect, useState } from 'react'
import { ExternalLink, Copy } from 'lucide-react'
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'

const SWAP_PAGE_URL = '/swap'
const VIEW_ON_MORBIUS_BASE = 'https://scan.morbius.io/geicko?address='

interface DexScreenerPair {
  url?: string
  dexId?: string
  pairAddress?: string
  baseToken?: { address: string; name: string; symbol: string }
  quoteToken?: { name: string; symbol: string }
  labels?: string[]
  info?: {
    imageUrl?: string
    websites?: { url: string; label: string }[]
    socials?: { url: string; type: string }[]
  }
}

interface DexScreenerTokenResponse {
  pairs?: DexScreenerPair[]
}

export interface TableProfileProps {
  /** Token contract address (default: MORBIUS) */
  tokenAddress?: string
  /** Optional token symbol/name override when API hasn't loaded */
  tokenSymbol?: string
  /** Optional description (placeholder for later) */
  description?: string
  /** Buy link (default: /swap - Internet Money Swap) */
  buyLink?: string
  /** Optional logo URL (overrides DexScreener when set) */
  logoUrl?: string
  /** Optional ticker/symbol override (overrides DexScreener when set) */
  ticker?: string
  /** Optional website URL (admin-configured, shown as "Website" link) */
  websiteUrl?: string
  /** Optional iframe URL (e.g. Morbius/Geicko chart). When unset, defaults to scan.morbius.io/geicko?address=tokenAddress when tokenAddress is present. */
  iframeUrl?: string
}

export function TableProfile({
  tokenAddress = MORBIUS_TOKEN_ADDRESS,
  tokenSymbol,
  description,
  buyLink = SWAP_PAGE_URL,
  logoUrl: logoUrlProp,
  ticker: tickerProp,
  websiteUrl: websiteUrlProp,
  iframeUrl: iframeUrlProp,
}: TableProfileProps) {
  const [data, setData] = useState<DexScreenerTokenResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const normalizedAddress = tokenAddress?.toLowerCase()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`)
      .then((res) => {
        if (!res.ok) throw new Error(`DexScreener ${res.status}`)
        return res.json()
      })
      .then((json: DexScreenerTokenResponse) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [tokenAddress])

  const pairs = data?.pairs ?? []
  const tokenPairs = pairs.filter(
    (p) => p.baseToken?.address?.toLowerCase() === normalizedAddress
  )
  const logoUrl = logoUrlProp ?? tokenPairs[0]?.info?.imageUrl
  // Prefer table-specific ticker/name over DexScreener so Token Profile updates when user changes table
  const name = tickerProp ?? tokenSymbol ?? tokenPairs[0]?.baseToken?.name ?? 'Token'
  const symbol = tickerProp ?? tokenPairs[0]?.baseToken?.symbol ?? tokenSymbol ?? '—'
  const socials = tokenPairs[0]?.info?.socials ?? []
  const websites = tokenPairs[0]?.info?.websites ?? []
  const morbiusUrl = `${VIEW_ON_MORBIUS_BASE}${encodeURIComponent(tokenAddress)}`
  const iframeSrc = iframeUrlProp?.trim() || (tokenAddress ? `${VIEW_ON_MORBIUS_BASE}${encodeURIComponent(tokenAddress)}` : '')

  const panelStyle = {
    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(34, 211, 238, 0.35)',
  }

  return (
    <section className="w-full pt-1 pb-2 px-2 sm:px-4">
      <div
        className="rounded-2xl overflow-hidden border-2 border-cyan-500/30 max-w-4xl mx-auto"
        style={panelStyle}
      >
        <div className="flex flex-col">
          {/* Token info: logo, name, ticker, description, buy + dex links */}
          <div className="p-3 sm:p-4 flex flex-col justify-center gap-3">
            <div className="flex items-center gap-3">
              {loading && !logoUrlProp ? (
                <div className="w-12 h-12 rounded-full bg-slate-700 animate-pulse shrink-0" />
              ) : logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border border-cyan-500/30 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                  {(symbol || name).slice(0, 1)}
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-white">{name}</h2>
                <p className="text-cyan-400/90 text-sm">{symbol}</p>
              </div>
            </div>
            {description && (
              <p className="text-gray-400 text-sm max-w-md">{description}</p>
            )}
            {tokenAddress && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500 text-xs">Contract</span>
                <span className="font-mono text-xs text-slate-300 truncate max-w-[200px]" title={tokenAddress}>
                  {tokenAddress}
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(tokenAddress)}
                  className="p-1.5 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-slate-700/50 transition-colors"
                  title="Copy address"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={morbiusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Scan. View on Morbius
              </a>
              {websiteUrlProp && (
                <a
                  href={websiteUrlProp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-600/80 text-cyan-300 text-sm border border-cyan-500/30 transition-colors"
                >
                  <span className="text-xs">Website</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              )}
              {socials.map((s, i) => (
                <a
                  key={`s-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-600/80 text-cyan-300 text-sm border border-cyan-500/30 transition-colors"
                >
                  <span className="capitalize text-xs">{s.type || 'Social'}</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              ))}
              {websites.map((w, i) => (
                <a
                  key={`w-${i}`}
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-600/80 text-cyan-300 text-sm border border-cyan-500/30 transition-colors"
                >
                  <span className="text-xs">{w.label || 'Website'}</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              ))}
              {error && (
                <span className="text-red-400/80 text-xs">Token data unavailable</span>
              )}
            </div>
            {iframeSrc && (
              <div className="w-full rounded-lg overflow-hidden border border-cyan-500/30 bg-slate-900/80">
                <iframe
                  src={iframeSrc}
                  title="MORBIUS token chart"
                  className="w-full aspect-video min-h-[180px] border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
