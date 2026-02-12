'use client'

import React, { useEffect, useState } from 'react'
import { ExternalLink, ShoppingCart, BarChart3 } from 'lucide-react'
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'

const MORBIUS_GEICKO_IFRAME = 'https://morbius.io/geicko?address=0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1&tab=chart'
const SWAP_PAGE_URL = '/swap'

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
  /** Geicko iframe URL for token profile (default: MORBIUS on morbius.io) */
  geickoIframeUrl?: string
  /** Buy link (default: /swap - Internet Money Swap) */
  buyLink?: string
}

export function TableProfile({
  tokenAddress = MORBIUS_TOKEN_ADDRESS,
  tokenSymbol,
  description,
  geickoIframeUrl = MORBIUS_GEICKO_IFRAME,
  buyLink = SWAP_PAGE_URL,
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
  const uniqueUrls = Array.from(
    new Map(tokenPairs.map((p) => [p.url ?? p.pairAddress, p]).filter(([, p]) => p.url)).values()
  ).slice(0, 6)
  const logoUrl = tokenPairs[0]?.info?.imageUrl
  const name = tokenPairs[0]?.baseToken?.name ?? tokenSymbol ?? 'Token'
  const symbol = tokenPairs[0]?.baseToken?.symbol ?? tokenSymbol ?? '—'

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
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            {loading ? (
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
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <a
              href={buyLink}
              target={buyLink.startsWith('http') ? '_blank' : undefined}
              rel={buyLink.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-medium transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              Buy (Internet Money Swap)
            </a>
            {uniqueUrls.slice(0, 4).map((pair) => (
              <a
                key={pair.url ?? pair.pairAddress}
                href={pair.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-600/80 text-cyan-300 text-sm border border-cyan-500/30 transition-colors"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="capitalize">{pair.dexId ?? 'Dex'}</span>
                {Array.isArray(pair.labels) && pair.labels[0] && (
                  <span className="text-xs text-gray-400">{pair.labels[0]}</span>
                )}
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
            ))}
            {error && (
              <span className="text-red-400/80 text-xs">Links unavailable</span>
            )}
          </div>
        </div>

        <div className="relative w-full aspect-video min-h-[320px] bg-black/30">
          <iframe
            src={geickoIframeUrl}
            title={`${name} token profile`}
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </section>
  )
}
