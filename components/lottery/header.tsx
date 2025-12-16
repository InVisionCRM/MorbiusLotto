'use client'

import { useEffect, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import Link from 'next/link'

interface HeaderProps {
  nextDrawEndTime?: bigint
  fallbackRemaining?: bigint
}

const DISPLAY_OFFSET_SECONDS = 15

const formatSeconds = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function Header({ nextDrawEndTime, fallbackRemaining = BigInt(0) }: HeaderProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (!nextDrawEndTime || nextDrawEndTime === BigInt(0)) return Number(fallbackRemaining) + DISPLAY_OFFSET_SECONDS
    const fromEnd = Number(nextDrawEndTime) * 1000 - Date.now()
    if (!Number.isNaN(fromEnd) && fromEnd > 0) return Math.floor(fromEnd / 1000) + DISPLAY_OFFSET_SECONDS
    return Number(fallbackRemaining) + DISPLAY_OFFSET_SECONDS
  })

  useEffect(() => {
    if (!nextDrawEndTime || nextDrawEndTime === BigInt(0)) {
      setRemaining(Number(fallbackRemaining) + DISPLAY_OFFSET_SECONDS)
      return
    }
    const update = () => {
      const ms = Number(nextDrawEndTime) * 1000 - Date.now()
      if (!Number.isNaN(ms)) {
        setRemaining(Math.max(0, Math.floor(ms / 1000) + DISPLAY_OFFSET_SECONDS))
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [nextDrawEndTime, fallbackRemaining])

  return (
    <header className="border-b border-white/30 bg-purple-950/10 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-3 py-3 relative">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="text-left">
              <h1 className="text-xl font-bold text-white leading-none">MORBIUS.IO</h1>
            </div>
          </Link>


          <div className="flex items-center gap-2 ml-auto">
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted,
              }) => {
                const ready = mounted && authenticationStatus !== 'loading'
                const connected =
                  ready &&
                  account &&
                  chain &&
                  (!authenticationStatus ||
                    authenticationStatus === 'authenticated')

                return (
                  <div
                    {...(!ready && {
                      'aria-hidden': true,
                      style: {
                        opacity: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            type="button"
                            className="px-3 py-1.5 text-sm font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
                          >
                            Connect
                          </button>
                        )
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                          >
                            Wrong network
                          </button>
                        )
                      }

                      return (
                        <button
                          onClick={openAccountModal}
                          type="button"
                          className="px-3 py-1.5 text-sm font-medium bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors border border-white/20"
                        >
                          {account.displayName}
                        </button>
                      )
                    })()}
                  </div>
                )
              }}
            </ConnectButton.Custom>
          </div>
        </div>

        {/* Centered Next Draw Timer (no label) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent drop-shadow">
            {remaining > 0 ? formatSeconds(remaining) : '--'}
          </div>
        </div>
      </div>
    </header>
  )
}
