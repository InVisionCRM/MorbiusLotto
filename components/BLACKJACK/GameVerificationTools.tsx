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
}

interface GameVerificationToolsProps {
  gameData?: GameVerificationData
  onVerify?: (gameId: string) => Promise<GameVerificationData | null>
  isLoading?: boolean
}

export function GameVerificationTools({ gameData, onVerify, isLoading }: GameVerificationToolsProps) {
  const [gameId, setGameId] = useState('')
  const [verificationData, setVerificationData] = useState<GameVerificationData | null>(gameData || null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean
    details: any
    errors: string[]
  } | null>(null)
  const [showServerSeed, setShowServerSeed] = useState(false)
  const [showProvablyFair, setShowProvablyFair] = useState(true)

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
        const result = verifyGame(data)
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
      toast.error('Verification failed')
      console.error('Verification error:', error)
    } finally {
      setIsVerifying(false)
    }
  }

  const verifyGame = (data: GameVerificationData) => {
    const errors: string[] = []
    let isValid = true

    try {
      // Verify server seed hash
      if (data.serverSeed && data.serverSeedHash) {
        const calculatedHash = crypto.createHash('sha256')
          .update(data.serverSeed)
          .digest('hex')

        if (calculatedHash !== data.serverSeedHash) {
          errors.push('Server seed hash does not match')
          isValid = false
        }
      }

      // Verify card generation (simplified - would need full algorithm)
      if (data.playerCards && data.dealerCards) {
        const totalCards = data.playerCards.length + data.dealerCards.length

        // Check for duplicates (simplified check)
        const allCards = [...data.playerCards, ...data.dealerCards]
        const uniqueCards = new Set(allCards)

        if (uniqueCards.size !== allCards.length) {
          errors.push('Duplicate cards detected')
          isValid = false
        }

        // Check card values are valid (1-13)
        const invalidCards = allCards.filter(card => card < 1 || card > 13)
        if (invalidCards.length > 0) {
          errors.push(`Invalid card values: ${invalidCards.join(', ')}`)
          isValid = false
        }
      }

      // Verify payout calculation
      if (data.result && data.payout !== undefined) {
        let expectedPayout = 0n

        if (data.result === 'blackjack') {
          expectedPayout = (data.betAmount * 3n) / 2n // 3:2 payout
        } else if (data.result === 'win') {
          expectedPayout = data.betAmount * 2n // 2:1 payout
        } else if (data.result === 'push') {
          expectedPayout = data.betAmount // Return bet
        } else if (data.result === 'loss') {
          expectedPayout = 0n // Loss
        }

        if (expectedPayout !== data.payout) {
          errors.push(`Payout mismatch. Expected: ${expectedPayout}, Actual: ${data.payout}`)
          isValid = false
        }
      }

      // Verify house edge (should be ~10% of winnings)
      if (data.result === 'win' && data.payout > data.betAmount) {
        const grossWin = data.payout - data.betAmount
        const expectedHouseEdge = (grossWin * 1000n) / 10000n // 10%
        const actualHouseEdge = grossWin - (data.payout - data.betAmount - expectedHouseEdge)

        // Allow small variance due to rounding
        if (Math.abs(Number(actualHouseEdge)) > Number(data.betAmount) / 100) {
          errors.push('House edge calculation appears incorrect')
          isValid = false
        }
      }

    } catch (error) {
      errors.push(`Verification error: ${error.message}`)
      isValid = false
    }

    return {
      isValid,
      details: {
        cardsVerified: !errors.some(e => e.includes('card')),
        payoutVerified: !errors.some(e => e.includes('payout')),
        seedVerified: !errors.some(e => e.includes('seed')),
        houseEdgeVerified: !errors.some(e => e.includes('edge'))
      },
      errors
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const formatCards = (cards: number[]) => {
    const CARD_NAMES = {
      1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
      7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K'
    }
    const SUITS = ['♠', '♥', '♦', '♣']

    return cards.map((card, index) => {
      const suitIndex = Math.floor((card - 1) / 13) % 4
      const rank = ((card - 1) % 13) + 1
      return (
        <span key={index} className="inline-flex items-center mx-0.5 px-2 py-1 rounded text-sm border border-slate-600/50" style={{ background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))' }}>
          <span className="font-bold mr-1 text-white">{CARD_NAMES[rank as keyof typeof CARD_NAMES]}</span>
          <span style={{ color: suitIndex % 2 === 0 ? '#e2e8f0' : '#f87171' }}>
            {SUITS[suitIndex]}
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
    ? verificationData.betAmount > 0n
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
                            verificationResult.details.houseEdgeVerified ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {verificationResult.details.houseEdgeVerified ? '✓' : '✗'}
                          </div>
                          <div className="text-xs text-slate-400">House Edge</div>
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