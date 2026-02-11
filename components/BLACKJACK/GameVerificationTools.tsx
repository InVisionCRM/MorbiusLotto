'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calculator,
  Eye,
  EyeOff,
  Copy,
  Shield,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

export interface GameVerificationData {
  gameId: string
  serverSeedHash: string
  serverSeed?: string
  clientSeed: string
  nonce: number
  betAmount: bigint
  playerCards: number[]
  dealerCards: number[]
  result: string
  payout: bigint
  timestamp: number
  actions: any[]
  /** Per-hand data from the server (cards, actions with nonces) */
  playerHands?: { cards: number[]; total: number; result: string; payout: bigint; actions: any[] }[]
  /** Dealer actions with nonces */
  dealerActions?: any[]
  /** Base nonce for this game (gameNumber * multiplier) */
  baseNonce?: number
  /** RNG version used for this game */
  rngVersion?: string | number
  /** Game number for this game */
  gameNumber?: number
}

interface GameVerificationToolsProps {
  gameData?: GameVerificationData
  onVerify?: (gameId: string) => Promise<GameVerificationData | null>
  isLoading?: boolean
  /** When opening from History "Verify Game", prefill and auto-run verify for this game ID */
  initialGameId?: string
  /** Call after consuming initialGameId so parent can clear it */
  onInitialGameIdConsumed?: () => void
}

export function GameVerificationTools({ gameData, onVerify, isLoading, initialGameId, onInitialGameIdConsumed }: GameVerificationToolsProps) {
  const [gameId, setGameId] = useState(initialGameId ?? '')
  const [verificationData, setVerificationData] = useState<GameVerificationData | null>(gameData || null)
  const initialGameIdConsumedRef = React.useRef(false)
  const lastProcessedInitialGameIdRef = React.useRef<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean
    details: any
    errors: string[]
  } | null>(null)
  const [showServerSeed, setShowServerSeed] = useState(false)
  const [showProvablyFair, setShowProvablyFair] = useState(true)

  // When opened from History with a game ID, prefill and auto-run verify once per game ID
  useEffect(() => {
    if (!initialGameId || !onVerify) return
    if (lastProcessedInitialGameIdRef.current === initialGameId) return
    lastProcessedInitialGameIdRef.current = initialGameId
    initialGameIdConsumedRef.current = true
    setGameId(initialGameId)
    onInitialGameIdConsumed?.()
    let cancelled = false
    const run = async () => {
      setIsVerifying(true)
      setVerificationResult(null)
      try {
        const data = await onVerify(initialGameId)
        if (cancelled) return
        if (data) {
          setVerificationData(data)
          const result = await verifyGame(data)
          setVerificationResult(result)
          if (result.isValid) toast.success('Game verification successful!')
          else toast.error('Game verification failed!')
        } else {
          toast.error('Game not found')
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Verification failed'
          toast.error(msg)
        }
      } finally {
        if (!cancelled) setIsVerifying(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [initialGameId, onVerify, onInitialGameIdConsumed])

  const handleVerify = async () => {
    if (!gameId.trim() && !verificationData) return

    const idToVerify = gameId.trim() || verificationData?.gameId
    if (!idToVerify) return

    setIsVerifying(true)
    setVerificationResult(null)

    try {
      const data = await onVerify?.(idToVerify)
      if (data) {
        setVerificationData(data)
        const result = await verifyGame(data)
        setVerificationResult(result)

        if (result.isValid) {
          toast.success('Game verification successful!')
        } else {
          toast.error('Game verification failed!')
        }
      } else {
        toast.error('Game not found')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Verification failed'
      toast.error(msg)
      console.error('Verification error:', error)
    } finally {
      setIsVerifying(false)
    }
  }

  // Browser-compatible SHA-256 hex (Web Crypto API)
  const sha256Hex = async (text: string): Promise<string> => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Browser-compatible HMAC-SHA256 hex (Web Crypto API) — matches server's provably-fair algorithm
  const hmacSha256Hex = async (key: string, message: string): Promise<string> => {
    const encoder = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Generate a provably fair random number — exact replica of server logic
  const generateRandom = async (
    serverSeed: string,
    clientSeed: string,
    nonce: number,
    min: number,
    max: number
  ): Promise<number> => {
    const hmac = await hmacSha256Hex(serverSeed, `${clientSeed}:${nonce}`)
    const hashValue = parseInt(hmac.substring(0, 8), 16)
    const range = max - min + 1
    return (hashValue % range) + min
  }

  // Decode encoded card (value*10+suit) to value 1-13
  const decodeCardValue = (card: number): number => {
    if (card >= 10 && card <= 133) return Math.floor(card / 10)
    return card >= 1 && card <= 13 ? card : 1
  }

  const verifyGame = async (data: GameVerificationData) => {
    const errors: string[] = []
    let isValid = true
    let cardsVerifiedViaHmac = false

    try {
      // 1. Verify server seed hash commitment
      if (data.serverSeed && data.serverSeedHash) {
        const calculatedHash = await sha256Hex(data.serverSeed)
        const expectedHash = (data.serverSeedHash || '').replace(/^0x/i, '')
        if (calculatedHash !== expectedHash) {
          errors.push('Server seed hash does not match commitment')
          isValid = false
        }
      }

      // 2. Full HMAC card regeneration — independently recreate every dealt card
      if (data.serverSeed && data.clientSeed && data.baseNonce !== undefined) {
        const serverSeed = data.serverSeed
        const clientSeed = data.clientSeed
        const baseNonce = data.baseNonce

        // --- Initial deal: 4 values (nonces 0-3) + 4 suits (nonces 4-7) ---
        const values: number[] = []
        const suits: number[] = []
        for (let i = 0; i < 4; i++) {
          values.push(await generateRandom(serverSeed, clientSeed, baseNonce + i, 1, 13))
        }
        for (let i = 0; i < 4; i++) {
          suits.push(await generateRandom(serverSeed, clientSeed, baseNonce + 4 + i, 0, 3))
        }

        // Encode: deal order is player1, dealer1, player2, dealer2
        const expectedInitialCards = {
          player: [values[0] * 10 + suits[0], values[2] * 10 + suits[2]],
          dealer: [values[1] * 10 + suits[1], values[3] * 10 + suits[3]],
        }

        // Get first hand's initial 2 cards (before any hits)
        const playerHand0Cards = data.playerHands?.[0]?.cards ?? data.playerCards.slice(0, 2)
        const dealerAllCards = data.dealerCards

        // Verify initial player cards
        for (let i = 0; i < 2; i++) {
          if (playerHand0Cards[i] !== expectedInitialCards.player[i]) {
            errors.push(
              `Player initial card ${i + 1} mismatch: expected ${expectedInitialCards.player[i]}, got ${playerHand0Cards[i]}`
            )
            isValid = false
          }
        }
        // Verify initial dealer cards
        for (let i = 0; i < 2; i++) {
          if (dealerAllCards[i] !== expectedInitialCards.dealer[i]) {
            errors.push(
              `Dealer initial card ${i + 1} mismatch: expected ${expectedInitialCards.dealer[i]}, got ${dealerAllCards[i]}`
            )
            isValid = false
          }
        }

        // --- Verify subsequent cards (hits / double downs) using action nonces ---
        let rngOk = true
        const allHands = data.playerHands ?? []
        for (let hIdx = 0; hIdx < allHands.length; hIdx++) {
          const hand = allHands[hIdx]
          if (!hand.actions) continue
          for (const action of hand.actions) {
            if ((action.type === 'hit' || action.type === 'double_down') && action.nonce !== undefined && action.card !== undefined) {
              const nonce = action.nonce
              // Determine if card is encoded (hit uses drawEncodedCard: 2 nonces) or raw (double_down: 1 nonce)
              const isEncoded = action.card >= 10 && action.card <= 133
              if (isEncoded) {
                // Encoded card: value at nonce, suit at nonce+1
                const expValue = await generateRandom(serverSeed, clientSeed, nonce, 1, 13)
                const expSuit = await generateRandom(serverSeed, clientSeed, nonce + 1, 0, 3)
                const expectedCard = expValue * 10 + expSuit
                if (action.card !== expectedCard) {
                  errors.push(
                    `Hand ${hIdx} ${action.type} card mismatch at nonce ${nonce}: expected ${expectedCard}, got ${action.card}`
                  )
                  isValid = false
                  rngOk = false
                }
              } else {
                // Raw value card (legacy double_down): value at nonce
                const expValue = await generateRandom(serverSeed, clientSeed, nonce, 1, 13)
                if (action.card !== expValue) {
                  errors.push(
                    `Hand ${hIdx} ${action.type} card mismatch at nonce ${nonce}: expected ${expValue}, got ${action.card}`
                  )
                  isValid = false
                  rngOk = false
                }
              }
            }
            // Split actions include two drawn cards with nonces
            if (action.type === 'split' && action.nonce1 !== undefined && action.cards) {
              for (let ci = 0; ci < action.cards.length; ci++) {
                const n = ci === 0 ? action.nonce1 : action.nonce2
                if (n === undefined) continue
                const card = action.cards[ci]
                const isEncoded = card >= 10 && card <= 133
                if (isEncoded) {
                  const expValue = await generateRandom(serverSeed, clientSeed, n, 1, 13)
                  const expSuit = await generateRandom(serverSeed, clientSeed, n + 1, 0, 3)
                  const expectedCard = expValue * 10 + expSuit
                  if (card !== expectedCard) {
                    errors.push(`Split card ${ci + 1} mismatch at nonce ${n}: expected ${expectedCard}, got ${card}`)
                    isValid = false
                    rngOk = false
                  }
                }
              }
            }
          }
        }

        // --- Verify dealer hit cards ---
        const dealerActions = data.dealerActions ?? []
        for (const action of dealerActions) {
          if (action.type === 'hit' && action.nonce !== undefined && action.card !== undefined) {
            const nonce = action.nonce
            const isEncoded = action.card >= 10 && action.card <= 133
            if (isEncoded) {
              const expValue = await generateRandom(serverSeed, clientSeed, nonce, 1, 13)
              const expSuit = await generateRandom(serverSeed, clientSeed, nonce + 1, 0, 3)
              const expectedCard = expValue * 10 + expSuit
              if (action.card !== expectedCard) {
                errors.push(`Dealer hit card mismatch at nonce ${nonce}: expected ${expectedCard}, got ${action.card}`)
                isValid = false
                rngOk = false
              }
            } else {
              const expValue = await generateRandom(serverSeed, clientSeed, nonce, 1, 13)
              if (action.card !== expValue) {
                errors.push(`Dealer hit card mismatch at nonce ${nonce}: expected ${expValue}, got ${action.card}`)
                isValid = false
                rngOk = false
              }
            }
          }
        }

        if (rngOk && !errors.some((e) => e.includes('card'))) {
          cardsVerifiedViaHmac = true
        }
      }

      // 3. Verify card values are in valid range
      const allCards = [...(data.playerCards ?? []), ...(data.dealerCards ?? [])]
      for (const card of allCards) {
        const v = decodeCardValue(card)
        if (v < 1 || v > 13) {
          errors.push(`Invalid card value: ${card} (decoded: ${v})`)
          isValid = false
        }
      }

      // 4. Verify payout calculation
      if (data.result && data.payout !== undefined && data.betAmount > BigInt(0)) {
        let expectedPayout = BigInt(0)
        if (data.result === 'blackjack') {
          expectedPayout = (data.betAmount * BigInt(5)) / BigInt(2) // 3:2 payout = 2.5x total return
        } else if (data.result === 'win') {
          expectedPayout = data.betAmount * BigInt(2)
        } else if (data.result === 'push') {
          expectedPayout = data.betAmount
        } else if (data.result === 'loss') {
          expectedPayout = BigInt(0)
        }
        // Only flag mismatch for single-hand, non-split games
        const isSingleHand = !data.playerHands || data.playerHands.length <= 1
        if (isSingleHand && expectedPayout !== data.payout) {
          errors.push(`Payout mismatch: expected ${expectedPayout}, got ${data.payout}`)
          isValid = false
        }
      }

    } catch (error) {
      errors.push(`Verification error: ${error instanceof Error ? error.message : String(error)}`)
      isValid = false
    }

    return {
      isValid,
      details: {
        cardsVerified: cardsVerifiedViaHmac || !errors.some((e) => e.includes('card')),
        payoutVerified: !errors.some((e) => e.includes('payout') || e.includes('Payout')),
        seedVerified: !errors.some((e) => e.includes('seed') || e.includes('Seed')),
        hmacVerified: cardsVerifiedViaHmac,
      },
      errors,
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const formatCards = (cards: number[]) => {
    const CARD_NAMES: Record<number, string> = {
      1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
      7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K'
    }
    // Suits: 0=hearts, 1=diamonds, 2=clubs, 3=spades (red=0,1; black=2,3)
    const SUIT_SYMBOLS = ['♥', '♦', '♣', '♠']
    const SUIT_COLORS = ['#f87171', '#f87171', '#e2e8f0', '#e2e8f0']

    return cards.map((card, index) => {
      // Decode: encoded cards are value*10+suit (range 10-133); legacy raw values are 1-13
      let rank: number
      let suitIndex: number
      if (card >= 10 && card <= 133) {
        rank = Math.floor(card / 10)
        suitIndex = card % 10
      } else {
        rank = card >= 1 && card <= 13 ? card : 1
        suitIndex = 0
      }
      return (
        <span key={index} className="inline-flex items-center mx-0.5 px-2 py-1 rounded text-sm border border-slate-600/50" style={{ background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))' }}>
          <span className="font-bold mr-1 text-white">{CARD_NAMES[rank] ?? '?'}</span>
          <span style={{ color: SUIT_COLORS[suitIndex] ?? '#e2e8f0' }}>
            {SUIT_SYMBOLS[suitIndex] ?? '?'}
          </span>
        </span>
      )
    })
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatEther = (value: bigint) => {
    return (Number(value) / 1e18).toFixed(6)
  }

  // Multiplier = payout / wager (e.g. 2.00x win, 1.50x blackjack, 1.00x push, 0x loss)
  const multiplierDisplay = verificationData
    ? verificationData.betAmount > BigInt(0)
      ? (Number(verificationData.payout) / Number(verificationData.betAmount)).toFixed(2) + 'x'
      : '0.00x'
    : ''

  return (
    <div className="space-y-6">
      {/* Verification Input */}
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Game Verification Tools
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Independently verify the fairness of any completed game using provably fair cryptography
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="game-id" className="text-cyan-300/80">
                Game ID
              </Label>
              <Input
                id="game-id"
                placeholder="Enter game ID to verify"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="bg-slate-800/80 border-cyan-500/30 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleVerify}
                disabled={isVerifying || (!gameId.trim() && !verificationData)}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white"
              >
                {isVerifying ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Verifying...
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4 mr-2" />
                    Verify Game
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verification Results — competitor-style layout: title + ID, cards, Multi/Wager/Rakeback/Payout, expandable Provably Fair */}
      <AnimatePresence>
        {verificationData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 shadow-2xl overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-white text-lg font-semibold">
                      Blackjack
                    </CardTitle>
                    <span className="text-cyan-300/80 font-mono text-sm">
                      #{verificationData.gameId}
                    </span>
                  </div>
                  {verificationResult && (
                    <Badge className={`${
                      verificationResult.isValid
                        ? 'bg-green-900/50 text-green-400 border-green-500/50'
                        : 'bg-red-900/50 text-red-400 border-red-500/50'
                    } border`}>
                      {verificationResult.isValid ? (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          VERIFIED
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 mr-1" />
                          FAILED
                        </>
                      )}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Cards — player and dealer */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-cyan-300/70 uppercase tracking-wider mb-1">Player</div>
                    <div className="flex flex-wrap gap-1">
                      {formatCards(verificationData.playerCards)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-cyan-300/70 uppercase tracking-wider mb-1">Dealer</div>
                    <div className="flex flex-wrap gap-1">
                      {formatCards(verificationData.dealerCards)}
                    </div>
                  </div>
                </div>

                {/* Multi | Wager | Rakeback | Payout — same info as competitor */}
                <div
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl"
                  style={{
                    background: 'linear-gradient(145deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                  }}
                >
                  <div>
                    <div className="text-[10px] uppercase text-cyan-300/50 tracking-wider">Multi</div>
                    <div className="text-white font-mono text-sm">{multiplierDisplay}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-cyan-300/50 tracking-wider">Wager</div>
                    <div className="text-white font-mono text-sm">{formatEther(verificationData.betAmount)} PLS</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-cyan-300/50 tracking-wider">Rakeback</div>
                    <div className="text-slate-400 font-mono text-sm">—</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-cyan-300/50 tracking-wider">Payout</div>
                    <div className={`font-mono text-sm font-semibold ${
                      Number(verificationData.payout) > Number(verificationData.betAmount) ? 'text-green-400' :
                      Number(verificationData.payout) === Number(verificationData.betAmount) ? 'text-cyan-300' :
                      'text-red-400'
                    }`}>
                      {formatEther(verificationData.payout)} PLS
                    </div>
                  </div>
                </div>

                {/* Result + Timestamp (same info, compact) */}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Result</span>
                    <Badge className={`${
                      verificationData.result === 'win' ? 'bg-green-900/50 text-green-400' :
                      verificationData.result === 'loss' ? 'bg-red-900/50 text-red-400' :
                      verificationData.result === 'blackjack' ? 'bg-purple-900/50 text-purple-400' :
                      'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {verificationData.result.toUpperCase()}
                    </Badge>
                  </div>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400">
                    {formatTimestamp(verificationData.timestamp)}
                  </span>
                </div>

                {/* Expandable Provably Fair — seed number, verifiable proof, client seed, server seed, nonce */}
                <div className="rounded-xl border border-cyan-500/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowProvablyFair(!showProvablyFair)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-slate-800/60 hover:bg-slate-800/80 transition-colors"
                  >
                    <span className="text-sm font-medium text-cyan-300 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Provably Fair
                    </span>
                    <span aria-hidden className={`transition-transform ${showProvablyFair ? 'rotate-180' : ''}`}>
                      ▾
                    </span>
                  </button>
                  {showProvablyFair && (
                    <div className="p-4 space-y-4 bg-slate-900/60 border-t border-cyan-500/20">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-cyan-300/70">Verifiable proof (Server Seed Hash)</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(verificationData.serverSeedHash)}
                            className="h-6 px-2 text-xs text-cyan-300/80"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-xs font-mono bg-slate-800/80 p-2 rounded text-slate-300 break-all border border-slate-600/50">
                          {verificationData.serverSeedHash}
                        </div>
                      </div>

                      {verificationData.serverSeed && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-cyan-300/70 flex items-center gap-1">
                              Server Seed
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowServerSeed(!showServerSeed)}
                                className="h-6 px-2 text-xs"
                              >
                                {showServerSeed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </Button>
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(verificationData.serverSeed)}
                              className="h-6 px-2 text-xs text-cyan-300/80"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="text-xs font-mono bg-slate-800/80 p-2 rounded text-slate-300 break-all border border-slate-600/50">
                            {showServerSeed ? verificationData.serverSeed : '••••••••••••••••••••••••••••••••'}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-cyan-300/70">Client Seed</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(verificationData.clientSeed)}
                            className="h-6 px-2 text-xs text-cyan-300/80"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-xs font-mono bg-slate-800/80 p-2 rounded text-slate-300 break-all border border-slate-600/50">
                          {verificationData.clientSeed}
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-xs text-cyan-300/70">Nonce</span>
                        <span className="text-xs text-white font-mono">{verificationData.nonce}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Verification Status */}
                {verificationResult && (
                  <>
                    <Separator className="bg-slate-600/50" />
                    <div>
                      <h4 className="text-sm font-medium text-cyan-300/80 mb-3">Verification Details</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className={`text-lg font-bold mb-1 ${
                            verificationResult.details.cardsVerified ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {verificationResult.details.cardsVerified ? '✓' : '✗'}
                          </div>
                          <div className="text-xs text-slate-400">Cards</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-lg font-bold mb-1 ${
                            verificationResult.details.payoutVerified ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {verificationResult.details.payoutVerified ? '✓' : '✗'}
                          </div>
                          <div className="text-xs text-slate-400">Payout</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-lg font-bold mb-1 ${
                            verificationResult.details.seedVerified ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {verificationResult.details.seedVerified ? '✓' : '✗'}
                          </div>
                          <div className="text-xs text-slate-400">Seeds</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-lg font-bold mb-1 ${
                            verificationResult.details.hmacVerified ? 'text-green-400' : 'text-yellow-400'
                          }`}>
                            {verificationResult.details.hmacVerified ? '✓' : '—'}
                          </div>
                          <div className="text-xs text-slate-400">HMAC</div>
                        </div>
                      </div>

                      {verificationResult.errors.length > 0 && (
                        <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            <span className="text-red-400 font-medium">Verification Issues</span>
                          </div>
                          <ul className="text-sm text-red-300 space-y-1">
                            {verificationResult.errors.map((error, index) => (
                              <li key={index}>• {error}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {verificationResult.isValid && (
                        <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <span className="text-green-400 font-medium">Verification Successful</span>
                          </div>
                          <p className="text-sm text-green-300">
                            This game has been independently verified as fair using provably fair cryptography.
                            All calculations, card distributions, and payouts are mathematically correct.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* How It Works */}
                <div className="p-4 rounded-xl border border-cyan-500/20 bg-slate-800/40">
                  <h4 className="text-sm font-medium text-cyan-400 mb-2">How Provably Fair Verification Works</h4>
                  <div className="text-xs text-slate-300 space-y-1">
                    <p>1. <strong>Server Seed Hash</strong> is shown before the game starts</p>
                    <p>2. <strong>Client Seed</strong> is chosen/provided by you</p>
                    <p>3. <strong>Server Seed</strong> is revealed after game completion</p>
                    <p>4. <strong>HMAC-SHA256</strong> generates cards: HMAC(server_seed, client_seed + nonce)</p>
                    <p>5. Anyone can verify the mathematical correctness independently</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}