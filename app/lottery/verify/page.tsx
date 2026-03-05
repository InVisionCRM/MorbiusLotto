'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import Footer from '@/components/PLINKO/Footer'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { formatUnits } from 'viem'
import { CheckCircle, AlertTriangle, Info, Shield, Hash, Eye, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { TOKEN_DECIMALS } from '@/lib/contracts'

interface VerificationResult {
  hashVerified: boolean
  numbersVerified: boolean
  overallVerified: boolean
  hashError?: string
  numbersError?: string
}

interface LotteryVerifyData {
  wallet_address: string
  wager: string
  player_numbers: number[]
  winning_numbers: number[]
  match_count: number
  gross_payout: string
  net_payout: string
  server_seed_hash: string
  server_seed: string | null
  client_seed: string
  nonce: number
}

// HMAC-SHA256 byte stream for 6-of-55 (same as server: clientSeed:nonce:roundIndex)
async function hmacByteStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor: number
): Promise<Uint8Array> {
  const roundIndex = Math.floor(cursor / 32)
  const byteOffset = cursor % 32
  const encoder = new TextEncoder()
  const keyData = encoder.encode(serverSeed)
  const messageData = encoder.encode(`${clientSeed}:${nonce}:${roundIndex}`)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const hmacBuf = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, messageData))

  if (byteOffset + 4 <= 32) {
    return hmacBuf.subarray(byteOffset, byteOffset + 4)
  }
  const bytesFromCurrent = 32 - byteOffset
  const nextMessageData = encoder.encode(`${clientSeed}:${nonce}:${roundIndex + 1}`)
  const nextHmacBuf = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, nextMessageData))
  const result = new Uint8Array(4)
  result.set(hmacBuf.subarray(byteOffset, 32), 0)
  result.set(nextHmacBuf.subarray(0, 4 - bytesFromCurrent), bytesFromCurrent)
  return result
}

function bytesToFloat(bytes: Uint8Array): number {
  return (
    bytes[0] / 256 +
    bytes[1] / (256 * 256) +
    bytes[2] / (256 * 256 * 256) +
    bytes[3] / (256 * 256 * 256 * 256)
  )
}

// Recompute 6-of-55 winning numbers (Fisher-Yates on 1..55, take first 6 sorted) — matches server
async function generate6of55WinningNumbers(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): Promise<[number, number, number, number, number, number]> {
  const MIN = 1
  const MAX = 55
  const COUNT = 6
  const pool = Array.from({ length: MAX }, (_, i) => i + MIN)
  let cursor = 0
  for (let i = pool.length - 1; i >= 1; i--) {
    const bytes = await hmacByteStream(serverSeed, clientSeed, nonce, cursor)
    cursor += 4
    const float = bytesToFloat(bytes)
    const j = Math.floor(float * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const drawn = pool.slice(0, COUNT).sort((a, b) => a - b)
  return [drawn[0], drawn[1], drawn[2], drawn[3], drawn[4], drawn[5]]
}

function LotteryVerifyContent() {
  const searchParams = useSearchParams()
  const urlTxHash = searchParams.get('txHash') || searchParams.get('tx') || ''
  const [txHash, setTxHash] = useState(urlTxHash)
  const [isVerifying, setIsVerifying] = useState(false)
  const [playData, setPlayData] = useState<LotteryVerifyData | null>(null)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const verifyServerSeedHash = useCallback(async (serverSeed: string, serverSeedHash: string): Promise<boolean> => {
    const encoder = new TextEncoder()
    const data = encoder.encode(serverSeed)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    const normalizedHash = serverSeedHash.startsWith('0x') ? serverSeedHash.slice(2) : serverSeedHash
    return hashHex.toLowerCase() === normalizedHash.toLowerCase()
  }, [])

  const verifyWithTxHash = useCallback(
    async (hashToVerify: string) => {
      const trimmed = hashToVerify.trim()
      if (!trimmed || !/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
        setError('Please enter a valid transaction hash (0x + 64 hex characters)')
        return
      }

      setIsVerifying(true)
      setError(null)
      setPlayData(null)
      setVerificationResult(null)

      try {
        const res = await fetch(`/api/lottery/instant/verify/${encodeURIComponent(trimmed)}`)
        const data = await res.json()

        if (!res.ok) {
          const msg = data.message || data.error || 'Failed to fetch play data'
          throw new Error(res.status === 404 ? `Play not found. ${msg} Only MORBIUS provably-fair (API) plays are stored; PLS or direct contract plays cannot be verified.` : msg)
        }

        if (!data.server_seed) {
          throw new Error('Server seed not revealed yet. Seeds are revealed after the play is confirmed on-chain.')
        }

        setPlayData(data)

        const hashVerified = await verifyServerSeedHash(data.server_seed, data.server_seed_hash || '')

        let numbersVerified = false
        let numbersError: string | undefined
        if (hashVerified) {
          const recomputed = await generate6of55WinningNumbers(
            String(data.server_seed),
            String(data.client_seed ?? 'default'),
            Number(data.nonce)
          )
          const expected = (data.winning_numbers ?? []).slice(0, 6).map(Number)
          numbersVerified =
            expected.length === 6 &&
            recomputed[0] === expected[0] &&
            recomputed[1] === expected[1] &&
            recomputed[2] === expected[2] &&
            recomputed[3] === expected[3] &&
            recomputed[4] === expected[4] &&
            recomputed[5] === expected[5]
          if (!numbersVerified) {
            numbersError = `Expected [${recomputed.join(', ')}], got [${expected.join(', ')}]`
          }
        }

        setVerificationResult({
          hashVerified,
          numbersVerified,
          overallVerified: hashVerified && numbersVerified,
          hashError: hashVerified ? undefined : 'Server seed hash mismatch',
          numbersError,
        })
      } catch (err) {
        console.error('Verification error:', err)
        setError(err instanceof Error ? err.message : 'Failed to verify play')
      } finally {
        setIsVerifying(false)
      }
    },
    [verifyServerSeedHash]
  )

  const verifyGame = useCallback(() => {
    verifyWithTxHash(txHash)
  }, [txHash, verifyWithTxHash])

  useEffect(() => {
    if (urlTxHash && urlTxHash.trim() && urlTxHash !== txHash) {
      setTxHash(urlTxHash)
      const timer = setTimeout(() => verifyWithTxHash(urlTxHash), 100)
      return () => clearTimeout(timer)
    }
  }, [urlTxHash, txHash, verifyWithTxHash])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  const pulseScanUrl = (hash: string) =>
    `https://scan.pulsechain.com/tx/${hash}`

  return (
    <GlobalMainNav page="lottery" showBackArrow backArrowHref="/lottery" backArrowLabel="Back to Lottery">
      <div className="min-h-screen text-white bg-black pt-4 md:pt-2">
        <main className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Shield className="w-8 h-8 text-cyan-400" />
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Instant Lottery Verifier
              </h1>
            </div>
            <p className="text-xl text-white/80 max-w-2xl mx-auto">
              Verify the fairness of your Instant 6-of-55 lottery plays (provably fair MORBIUS plays)
            </p>
          </div>

          {/* Verification Input */}
          <Card className="p-6 mb-8 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Hash className="w-5 h-5 text-cyan-400" />
                <h2 className="text-xl font-semibold text-white">Verify Your Play</h2>
              </div>

              <div>
                <Label htmlFor="txHash" className="text-white/80">
                  Transaction Hash
                </Label>
                <Input
                  id="txHash"
                  type="text"
                  placeholder="0x..."
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && verifyGame()}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-1 font-mono text-sm"
                />
                <p className="text-sm text-white/60 mt-1">
                  Only MORBIUS plays via the provably-fair API can be verified. PLS or direct contract plays are not stored for verification.
                </p>
              </div>

              <Button
                onClick={verifyGame}
                disabled={!txHash.trim() || isVerifying}
                className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
              >
                {isVerifying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Verify Play
                  </>
                )}
              </Button>
            </div>
          </Card>

          {error && (
            <Alert variant="destructive" className="mb-8">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {playData && verificationResult && (
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

                <Alert
                  className={
                    verificationResult.overallVerified
                      ? 'border-green-400/20 bg-green-950/20'
                      : 'border-red-400/20 bg-red-950/20'
                  }
                >
                  <AlertDescription
                    className={verificationResult.overallVerified ? 'text-green-200' : 'text-red-200'}
                  >
                    {verificationResult.overallVerified
                      ? '✅ Play verified successfully! All checks passed.'
                      : '❌ Verification failed. See details below.'}
                  </AlertDescription>
                </Alert>

                <div className="grid md:grid-cols-2 gap-4">
                  <div
                    className={`p-4 rounded border ${
                      verificationResult.hashVerified
                        ? 'border-green-400/30 bg-green-950/10'
                        : 'border-red-400/30 bg-red-950/10'
                    }`}
                  >
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

                  <div
                    className={`p-4 rounded border ${
                      verificationResult.numbersVerified
                        ? 'border-green-400/30 bg-green-950/10'
                        : 'border-red-400/30 bg-red-950/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {verificationResult.numbersVerified ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      )}
                      <span className="font-semibold">Winning Numbers Match</span>
                    </div>
                    <p className="text-sm text-white/70">
                      {verificationResult.numbersVerified
                        ? 'Winning numbers match recalculated draw'
                        : verificationResult.numbersError || 'Numbers verification failed'}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Play Details */}
              <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
                <h3 className="text-xl font-semibold text-white mb-4">Play Details</h3>

                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <div className="text-sm text-white/60 mb-1">Wallet</div>
                    <div className="font-mono text-sm text-white break-all">{playData.wallet_address}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/60 mb-1">Matches</div>
                    <Badge variant="outline" className="border-cyan-400/30 text-cyan-300">
                      {playData.match_count} of 6
                    </Badge>
                  </div>
                  <div>
                    <div className="text-sm text-white/60 mb-1">Wager</div>
                    <div className="text-white font-semibold">
                      {formatUnits(BigInt(playData.wager), TOKEN_DECIMALS)} MORBIUS
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-white/60 mb-1">Net Payout</div>
                    <div className="text-white font-semibold">
                      {formatUnits(BigInt(playData.net_payout), TOKEN_DECIMALS)} MORBIUS
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">Your Numbers</h4>
                    <div className="flex gap-2 flex-wrap">
                      {(playData.player_numbers ?? []).map((n, i) => (
                        <div
                          key={i}
                          className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center font-semibold text-cyan-300"
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">Winning Numbers</h4>
                    <div className="flex gap-2 flex-wrap">
                      {(playData.winning_numbers ?? []).map((n, i) => (
                        <div
                          key={i}
                          className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-400/50 flex items-center justify-center font-semibold text-purple-300"
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <a
                    href={pulseScanUrl(txHash.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View transaction on PulseScan
                  </a>
                </div>
              </Card>

              {/* Seeds */}
              <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
                <h3 className="text-xl font-semibold text-white mb-4">Verification Seeds</h3>

                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-white/80">Server Seed Hash (Committed)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(playData.server_seed_hash || '', 'Server seed hash')}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <code className="text-xs text-cyan-300 break-all block">{playData.server_seed_hash || 'N/A'}</code>
                    <p className="text-xs text-white/60 mt-1">This hash was committed before the play</p>
                  </div>

                  <div className="bg-white/5 p-4 rounded border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-white/80">Server Seed (Revealed)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(playData.server_seed || '', 'Server seed')}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <code className="text-xs text-purple-300 break-all block">{playData.server_seed || 'N/A'}</code>
                    <p className="text-xs text-white/60 mt-1">Revealed after play for verification</p>
                  </div>

                  <div className="bg-white/5 p-4 rounded border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-white/80">Client Seed</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(playData.client_seed, 'Client seed')}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <code className="text-xs text-blue-300 break-all block">{playData.client_seed}</code>
                    <p className="text-xs text-white/60 mt-1">Your client seed (or &apos;default&apos; if not provided)</p>
                  </div>

                  <div className="bg-white/5 p-4 rounded border border-white/10">
                    <Label className="text-white/80">Nonce</Label>
                    <div className="text-lg font-semibold text-white mt-1">{playData.nonce}</div>
                    <p className="text-xs text-white/60 mt-1">Used with server and client seed to generate the draw</p>
                  </div>
                </div>
              </Card>
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
                  Before each play, the server commits to a seed by publishing its SHA-256 hash. The seed cannot be changed after the draw.
                </p>
              </div>

              <div className="bg-white/5 p-4 rounded border border-white/10">
                <h3 className="text-white font-semibold mb-2">2. 6-of-55 Draw</h3>
                <p className="text-white/70">
                  Winning numbers are generated using a Fisher-Yates shuffle over the pool 1–55, with HMAC-SHA256 bytes derived from server seed, client seed, and nonce. The first six values (sorted) are the winning numbers.
                </p>
              </div>

              <div className="bg-white/5 p-4 rounded border border-white/10">
                <h3 className="text-white font-semibold mb-2">3. Seed Revelation</h3>
                <p className="text-white/70">
                  After the play is confirmed on-chain, the server reveals the server seed. You can verify that it hashes to the committed value and recompute the winning numbers to confirm the draw was fair.
                </p>
              </div>
            </div>
          </Card>
        </main>

        <Footer />
      </div>
    </GlobalMainNav>
  )
}

export default function LotteryVerifyPage() {
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
      <LotteryVerifyContent />
    </Suspense>
  )
}
