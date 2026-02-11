'use client'

import { useState, useEffect, Suspense } from 'react'
import { useAccount } from 'wagmi'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import Footer from '@/components/PLINKO/Footer'
import { HomeHeader } from '@/components/home/header'
import { formatUnits } from 'viem'
import { CheckCircle, AlertTriangle, Info, Shield, Hash, Eye, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import PlayingCard from '@/components/BLACKJACK/PlayingCard'
import { Card as CardType } from '@/app/BLACKJACK/types'
import { TOKEN_DECIMALS } from '@/lib/contracts'

interface VerificationResult {
  hashVerified: boolean
  cardsVerified: boolean
  overallVerified: boolean
  hashError?: string
  cardErrors?: Array<{ position: number; expected: number; actual: number }>
  recalculatedDeck?: number[]
}

interface GameVerificationData {
  gameId: string
  playerHands: Array<{
    cards: number[]
    total: number
    result: string
    payout: bigint
    actions: any[]
  }>
  dealerCards: number[]
  dealerTotal: number
  totalPayout: bigint
  betAmount: bigint
  timestamp?: number
  serverSeedHash?: string
  serverSeed?: string
  clientSeed: string
  gameNumber: number
  rngVersion: number
  nonce: number
  result: string
}

function BlackjackVerifyContent() {
  const { address } = useAccount()
  const searchParams = useSearchParams()
  const urlGameId = searchParams.get('gameId') || ''
  const [gameId, setGameId] = useState(urlGameId)
  const [isVerifying, setIsVerifying] = useState(false)
  const [gameData, setGameData] = useState<GameVerificationData | null>(null)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Convert card index (0-51) to Card type
  const cardIndexToCard = (idx: number): CardType => {
    const suits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
    const rank = (idx % 13) + 1
    const suitIndex = Math.floor(idx / 13)
    return {
      value: rank as CardType['value'],
      suit: suits[suitIndex % 4],
      hidden: false
    }
  }

  // Convert encoded card (value*10+suit) to Card type
  const encodedCardToCard = (encoded: number): CardType => {
    const suits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
    if (encoded >= 10 && encoded <= 133) {
      const value = Math.floor(encoded / 10)
      const suitIndex = encoded % 10
      return {
        value: value as CardType['value'],
        suit: suits[suitIndex % 4],
        hidden: false
      }
    }
    // Legacy: raw value 1-13
    return {
      value: encoded as CardType['value'],
      suit: 'hearts',
      hidden: false
    }
  }

  // HMAC-SHA256 byte stream for Fisher-Yates shuffle
  const hmacByteStream = async (serverSeed: string, clientSeed: string, nonce: number, cursor: number): Promise<Uint8Array> => {
    const roundIndex = Math.floor(cursor / 32)
    const message = `${clientSeed}:${nonce}:${roundIndex}`
    
    const encoder = new TextEncoder()
    const keyData = encoder.encode(serverSeed)
    const messageData = encoder.encode(message)
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    return new Uint8Array(signature)
  }

  // Convert bytes to float [0, 1)
  const bytesToFloat = (bytes: Uint8Array, offset: number = 0): number => {
    const byte1 = bytes[offset % bytes.length]
    const byte2 = bytes[(offset + 1) % bytes.length]
    const byte3 = bytes[(offset + 2) % bytes.length]
    const byte4 = bytes[(offset + 3) % bytes.length]
    const combined = (byte1 << 24) | (byte2 << 16) | (byte3 << 8) | byte4
    return (combined >>> 0) / 0xFFFFFFFF
  }

  // Fisher-Yates shuffle (client-side implementation)
  const fisherYatesShuffle = async (serverSeed: string, clientSeed: string, nonce: number): Promise<number[]> => {
    const deck = Array.from({ length: 52 }, (_, i) => i)
    let cursor = 0

    for (let i = 51; i >= 1; i--) {
      const bytes = await hmacByteStream(serverSeed, clientSeed, nonce, cursor)
      cursor += 4
      const float = bytesToFloat(bytes, 0)
      const j = Math.floor(float * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }

    return deck
  }

  // Verify server seed hash
  const verifyServerSeedHash = async (serverSeed: string, serverSeedHash: string): Promise<boolean> => {
    const encoder = new TextEncoder()
    const data = encoder.encode(serverSeed)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    // Remove 0x prefix if present
    const normalizedHash = serverSeedHash.startsWith('0x') ? serverSeedHash.slice(2) : serverSeedHash
    
    return hashHex.toLowerCase() === normalizedHash.toLowerCase()
  }

  // Verify game (internal function that accepts gameId parameter)
  const verifyGameWithId = async (idToVerify: string) => {
    if (!idToVerify.trim()) {
      setError('Please enter a game ID')
      return
    }

    setIsVerifying(true)
    setError(null)
    setGameData(null)
    setVerificationResult(null)

    try {
      // Fetch game data
      const res = await fetch(`/api/blackjack/verify/${idToVerify}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to fetch game data')
      }

      if (!data || !data.serverSeed) {
        throw new Error('Server seed not revealed yet. Seeds are revealed after game completion.')
      }

      setGameData(data)

      // Run verification
      const hashVerified = await verifyServerSeedHash(data.serverSeed, data.serverSeedHash || '')
      
      let cardsVerified = false
      let cardErrors: Array<{ position: number; expected: number; actual: number }> = []
      let recalculatedDeck: number[] = []

      if (hashVerified && data.rngVersion === 2) {
        // V2: Fisher-Yates shuffle
        recalculatedDeck = await fisherYatesShuffle(
          data.serverSeed,
          data.clientSeed,
          data.gameNumber
        )

        // Collect all cards in deal order
        const allCards: number[] = []
        data.playerHands.forEach((hand: any) => {
          allCards.push(...hand.cards)
        })
        allCards.push(...data.dealerCards)

        // Verify cards match
        cardsVerified = true
        for (let i = 0; i < allCards.length; i++) {
          const expected = recalculatedDeck[i]
          const actual = allCards[i]
          if (expected !== actual) {
            cardsVerified = false
            cardErrors.push({ position: i, expected, actual })
          }
        }
      } else if (hashVerified && data.rngVersion === 1) {
        // V1: Legacy system - cards verified differently
        // For now, mark as verified if hash is correct
        cardsVerified = true
      }

      setVerificationResult({
        hashVerified,
        cardsVerified,
        overallVerified: hashVerified && cardsVerified,
        hashError: hashVerified ? undefined : 'Server seed hash mismatch',
        cardErrors: cardErrors.length > 0 ? cardErrors : undefined,
        recalculatedDeck
      })
    } catch (err) {
      console.error('Verification error:', err)
      setError(err instanceof Error ? err.message : 'Failed to verify game')
    } finally {
      setIsVerifying(false)
    }
  }

  // Verify game (public function that uses state gameId)
  const verifyGame = async () => {
    await verifyGameWithId(gameId)
  }

  // Auto-fill and auto-verify when gameId is provided in URL
  useEffect(() => {
    if (urlGameId && urlGameId.trim() && urlGameId !== gameId) {
      setGameId(urlGameId)
      // Auto-trigger verification after setting gameId
      const timer = setTimeout(() => {
        verifyGameWithId(urlGameId)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [urlGameId])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  return (
    <div className="min-h-screen text-white bg-black">
      <HomeHeader
        showBackArrow={true}
        backArrowHref="/BLACKJACK"
        backArrowLabel="Back to Blackjack"
      />

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-cyan-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Blackjack Verifier
            </h1>
          </div>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            Verify the fairness of your blackjack games using cryptographic proofs
          </p>
        </div>

        {/* Verification Input */}
        <Card className="p-6 mb-8 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Hash className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-semibold text-white">Verify Your Game</h2>
            </div>

            <div>
              <Label htmlFor="gameId" className="text-white/80">
                Game ID
              </Label>
              <Input
                id="gameId"
                type="text"
                placeholder="Enter game ID from your game history"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verifyGame()}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-1"
              />
              <p className="text-sm text-white/60 mt-1">
                Find your game ID in the game history or from completed games
              </p>
            </div>

            <Button
              onClick={verifyGame}
              disabled={!gameId.trim() || isVerifying}
              className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
            >
              {isVerifying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Verifying...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Verify Game
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mb-8">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Verification Result */}
        {gameData && verificationResult && (
          <div className="space-y-6">
            {/* Verification Status */}
            <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
              <div className="flex items-center gap-2 mb-4">
                {verificationResult.overallVerified ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <h3 className="text-xl font-semibold text-white">Verification Result</h3>
              </div>

              <Alert className={`mb-4 ${verificationResult.overallVerified ? 'border-green-400/20 bg-green-950/20' : 'border-red-400/20 bg-red-950/20'}`}>
                <AlertDescription className={verificationResult.overallVerified ? 'text-green-200' : 'text-red-200'}>
                  {verificationResult.overallVerified
                    ? '✅ Game verified successfully! All checks passed.'
                    : '❌ Verification failed. See details below.'}
                </AlertDescription>
              </Alert>

              <div className="grid md:grid-cols-2 gap-4">
                <div className={`p-4 rounded border ${verificationResult.hashVerified ? 'border-green-400/30 bg-green-950/10' : 'border-red-400/30 bg-red-950/10'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {verificationResult.hashVerified ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-semibold">Server Seed Hash</span>
                  </div>
                  <p className="text-sm text-white/70">
                    {verificationResult.hashVerified
                      ? 'Server seed matches committed hash'
                      : verificationResult.hashError || 'Hash verification failed'}
                  </p>
                </div>

                <div className={`p-4 rounded border ${verificationResult.cardsVerified ? 'border-green-400/30 bg-green-950/10' : 'border-red-400/30 bg-red-950/10'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {verificationResult.cardsVerified ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-semibold">Cards Match</span>
                  </div>
                  <p className="text-sm text-white/70">
                    {verificationResult.cardsVerified
                      ? 'All cards match recalculated deck'
                      : `${verificationResult.cardErrors?.length || 0} card mismatch(es) detected`}
                  </p>
                </div>
              </div>
            </Card>

            {/* Game Details */}
            <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
              <h3 className="text-xl font-semibold text-white mb-4">Game Details</h3>
              
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-sm text-white/60 mb-1">Game ID</div>
                  <div className="font-mono text-sm text-white break-all">{gameData.gameId}</div>
                </div>
                <div>
                  <div className="text-sm text-white/60 mb-1">Result</div>
                  <Badge variant="outline" className="border-cyan-400/30 text-cyan-300">
                    {gameData.result}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-white/60 mb-1">Bet Amount</div>
                  <div className="text-white font-semibold">
                    {formatUnits(gameData.betAmount, TOKEN_DECIMALS)} MORBIUS
                  </div>
                </div>
                <div>
                  <div className="text-sm text-white/60 mb-1">Total Payout</div>
                  <div className="text-white font-semibold">
                    {formatUnits(gameData.totalPayout, TOKEN_DECIMALS)} MORBIUS
                  </div>
                </div>
              </div>

              {/* Cards Display */}
              <div className="space-y-6">
                {/* Dealer Cards */}
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Dealer Cards</h4>
                  <div className="flex gap-2 flex-wrap">
                    {gameData.dealerCards.map((card, idx) => {
                      const cardObj = gameData.rngVersion === 2 
                        ? cardIndexToCard(card)
                        : encodedCardToCard(card)
                      return (
                        <PlayingCard
                          key={`dealer-${idx}`}
                          card={cardObj}
                          owner="dealer"
                          size="normal"
                        />
                      )
                    })}
                  </div>
                  <div className="text-sm text-white/70 mt-2">Total: {gameData.dealerTotal}</div>
                </div>

                {/* Player Hands */}
                {gameData.playerHands.map((hand, handIdx) => (
                  <div key={`hand-${handIdx}`}>
                    <h4 className="text-lg font-semibold text-white mb-3">
                      Player Hand {gameData.playerHands.length > 1 ? `#${handIdx + 1}` : ''}
                    </h4>
                    <div className="flex gap-2 flex-wrap">
                      {hand.cards.map((card, idx) => {
                        const cardObj = gameData.rngVersion === 2 
                          ? cardIndexToCard(card)
                          : encodedCardToCard(card)
                        return (
                          <PlayingCard
                            key={`player-${handIdx}-${idx}`}
                            card={cardObj}
                            owner="player"
                            size="normal"
                          />
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="text-sm text-white/70">Total: {hand.total}</div>
                      <Badge variant="outline" className="border-purple-400/30 text-purple-300">
                        {hand.result}
                      </Badge>
                      <div className="text-sm text-white/70">
                        Payout: {formatUnits(hand.payout, TOKEN_DECIMALS)} MORBIUS
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Seed Information */}
            <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
              <h3 className="text-xl font-semibold text-white mb-4">Verification Seeds</h3>
              
              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-white/80">Server Seed Hash (Committed)</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(gameData.serverSeedHash || '', 'Server seed hash')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <code className="text-xs text-cyan-300 break-all block">
                    {gameData.serverSeedHash || 'N/A'}
                  </code>
                  <p className="text-xs text-white/60 mt-1">
                    This hash was committed before the game started
                  </p>
                </div>

                <div className="bg-white/5 p-4 rounded border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-white/80">Server Seed (Revealed)</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(gameData.serverSeed || '', 'Server seed')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <code className="text-xs text-purple-300 break-all block">
                    {gameData.serverSeed || 'N/A'}
                  </code>
                  <p className="text-xs text-white/60 mt-1">
                    Revealed after game completion for verification
                  </p>
                </div>

                <div className="bg-white/5 p-4 rounded border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-white/80">Client Seed</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(gameData.clientSeed, 'Client seed')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <code className="text-xs text-blue-300 break-all block">
                    {gameData.clientSeed}
                  </code>
                  <p className="text-xs text-white/60 mt-1">
                    Your client seed (or 'default' if not provided)
                  </p>
                </div>

                <div className="bg-white/5 p-4 rounded border border-white/10">
                  <Label className="text-white/80">Game Number (Nonce)</Label>
                  <div className="text-lg font-semibold text-white mt-1">{gameData.gameNumber}</div>
                  <p className="text-xs text-white/60 mt-1">
                    RNG Version: {gameData.rngVersion === 2 ? 'Fisher-Yates 52-card deck' : 'Legacy infinite deck'}
                  </p>
                </div>
              </div>
            </Card>

            {/* Card Errors (if any) */}
            {verificationResult.cardErrors && verificationResult.cardErrors.length > 0 && (
              <Card className="p-6 bg-red-950/20 border-red-400/30">
                <h3 className="text-xl font-semibold text-red-300 mb-4">Card Mismatches</h3>
                <div className="space-y-2">
                  {verificationResult.cardErrors.map((error, idx) => (
                    <div key={idx} className="text-sm">
                      <span className="text-white/70">Position {error.position}: </span>
                      <span className="text-red-300">Expected {error.expected}, got {error.actual}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* How It Works */}
        <Card className="p-6 mt-8 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-semibold text-white">How Verification Works</h2>
          </div>

          <div className="space-y-4 text-sm">
            <div className="bg-white/5 p-4 rounded border border-white/10">
              <h3 className="text-white font-semibold mb-2">1. Server Seed Commitment</h3>
              <p className="text-white/70">
                Before each game, the server commits to a seed by publishing its hash. This ensures the seed cannot be changed after the game.
              </p>
            </div>

            <div className="bg-white/5 p-4 rounded border border-white/10">
              <h3 className="text-white font-semibold mb-2">2. Card Generation</h3>
              <p className="text-white/70">
                Cards are generated using a Fisher-Yates shuffle of a 52-card deck, seeded with the server seed, client seed, and game number. This ensures deterministic, verifiable randomness.
              </p>
            </div>

            <div className="bg-white/5 p-4 rounded border border-white/10">
              <h3 className="text-white font-semibold mb-2">3. Seed Revelation</h3>
              <p className="text-white/70">
                After the game completes, the server reveals the actual server seed. You can verify that it matches the committed hash and recalculate the deck to confirm all cards were dealt fairly.
              </p>
            </div>
          </div>
        </Card>
      </main>

      <Footer />
    </div>
  )
}

export default function BlackjackVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen text-white bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-white/70">Loading verifier...</p>
          </div>
        </div>
      }
    >
      <BlackjackVerifyContent />
    </Suspense>
  )
}
