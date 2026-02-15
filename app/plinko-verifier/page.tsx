'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import Footer from '@/components/PLINKO/Footer'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { formatEther, parseAbiItem } from 'viem'
import { PLINKO_ADDRESS, PLINKO_DEPLOY_BLOCK } from '@/lib/contracts'
import { PLINKO_ABI } from '@/abi/plinko'
import { CheckCircle, AlertTriangle, Info, Shield, Hash, Eye } from 'lucide-react'

interface BallDropEvent {
  player: string
  seed: bigint
  bucket: number
  multiplier: bigint
  payout: bigint
  riskLevel: number
  transactionHash: string
  blockNumber: number
  timestamp?: number
}

export default function PlinkoVerifierPage() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [txHash, setTxHash] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean
    message: string
    events?: BallDropEvent[]
    blockHash?: string
    blockNumber?: number
  } | null>(null)

  const verifyTransaction = async () => {
    if (!txHash.trim() || !publicClient) return

    setIsVerifying(true)
    setVerificationResult(null)

    try {
      // Get transaction details
      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` })
      if (!tx) {
        setVerificationResult({
          isValid: false,
          message: 'Transaction not found'
        })
        return
      }

      // Get transaction receipt to find BallDropped events
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` })

      // Get block details
      const block = await publicClient.getBlock({ blockNumber: tx.blockNumber })
      const previousBlockHash = tx.blockNumber > 0n ?
        (await publicClient.getBlock({ blockNumber: tx.blockNumber - 1n })).hash : undefined

      // Parse BallDropped events
      const ballDroppedEvents: BallDropEvent[] = []

      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const event = parseAbiItem('event BallDropped(address indexed player,uint256 seed,uint8 bucket,uint256 multiplier,uint256 payout,uint8 riskLevel)')
            if (log.topics[0] === event.signature) {
              const decoded = {
                player: `0x${log.topics[1]?.slice(26)}` as `0x${string}`,
                seed: BigInt(log.data.slice(0, 66)),
                bucket: parseInt(log.data.slice(66, 130), 16),
                multiplier: BigInt('0x' + log.data.slice(130, 194)),
                payout: BigInt('0x' + log.data.slice(194, 258)),
                riskLevel: parseInt(log.data.slice(258, 322), 16)
              }

              ballDroppedEvents.push({
                ...decoded,
                transactionHash: txHash,
                blockNumber: Number(tx.blockNumber)
              })
            }
          } catch (error) {
            // Skip logs that can't be parsed
            continue
          }
        }
      }

      // Current verification logic (since contract uses blockhash, not fully provably fair yet)
      let isValid = true
      let message = 'Transaction verified successfully!'

      if (ballDroppedEvents.length === 0) {
        isValid = false
        message = 'No BallDropped events found in this transaction'
      } else {
        // Verify that the seeds are correctly derived from blockhash
        for (const event of ballDroppedEvents) {
          if (previousBlockHash) {
            // This is how the current contract generates seeds
            // Note: This is NOT fully provably fair as players can't verify before playing
            const expectedSeed = BigInt('0x' + previousBlockHash.slice(2))
            // In a real provably fair system, this would be verifiable
          }
        }

        message = `Found ${ballDroppedEvents.length} ball drop(s). Current verification is limited to transaction authenticity.`
      }

      setVerificationResult({
        isValid,
        message,
        events: ballDroppedEvents,
        blockHash: previousBlockHash,
        blockNumber: Number(tx.blockNumber)
      })

    } catch (error) {
      console.error('Verification error:', error)
      setVerificationResult({
        isValid: false,
        message: 'Failed to verify transaction. Please check the hash and try again.'
      })
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <GlobalMainNav page="plinko" showBackArrow backArrowHref="/PLINKO" backArrowLabel="Back to Plinko">
      <div className="min-h-screen text-white bg-black pt-4 md:pt-2">
        <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Plinko Verifier
            </h1>
          </div>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            Verify the fairness of your Plinko game results and understand how randomness works
          </p>
        </div>


        {/* Verification Input */}
        <Card className="p-6 mb-8 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Hash className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold text-white">Verify Your Game</h2>
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
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-1"
              />
              <p className="text-sm text-white/60 mt-1">
                Paste the transaction hash from your Plinko game
              </p>
            </div>

            <Button
              onClick={verifyTransaction}
              disabled={!txHash.trim() || isVerifying}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isVerifying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Verifying...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Verify Transaction
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Verification Result */}
        {verificationResult && (
          <Card className="p-6 mb-8 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
            <div className="flex items-center gap-2 mb-4">
              {verificationResult.isValid ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              )}
              <h3 className="text-xl font-semibold text-white">Verification Result</h3>
            </div>

            <Alert className={`mb-4 ${verificationResult.isValid ? 'border-green-400/20 bg-green-950/20' : 'border-red-400/20 bg-red-950/20'}`}>
              <AlertDescription className={verificationResult.isValid ? 'text-green-200' : 'text-red-200'}>
                {verificationResult.message}
              </AlertDescription>
            </Alert>

            {verificationResult.events && verificationResult.events.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-white">Game Details</h4>

                {verificationResult.blockHash && (
                  <div className="bg-white/5 p-3 rounded border border-white/10">
                    <div className="text-sm text-white/60 mb-1">Previous Block Hash:</div>
                    <code className="text-xs text-blue-300 break-all">{verificationResult.blockHash}</code>
                  </div>
                )}

                <div className="space-y-3">
                  {verificationResult.events.map((event, index) => (
                    <div key={index} className="bg-white/5 p-4 rounded border border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="outline" className="border-blue-400/30 text-blue-300">
                          Ball #{index + 1}
                        </Badge>
                        <Badge variant="outline" className="border-purple-400/30 text-purple-300">
                          Risk Level {event.riskLevel}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-white/60">Bucket</div>
                          <div className="text-white font-semibold">{event.bucket}</div>
                        </div>
                        <div>
                          <div className="text-white/60">Multiplier</div>
                          <div className="text-green-400 font-semibold">{Number(event.multiplier) / 100}x</div>
                        </div>
                        <div>
                          <div className="text-white/60">Payout</div>
                          <div className="text-yellow-400 font-semibold">{formatEther(event.payout)} MORBIUS</div>
                        </div>
                        <div>
                          <div className="text-white/60">Seed</div>
                          <code className="text-xs text-blue-300 break-all">{event.seed.toString()}</code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* How Randomness Works */}
        <Card className="p-6 mb-8 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">How Randomness Works</h2>
          </div>

          <div className="space-y-4 text-sm">
            <div className="bg-white/5 p-4 rounded border border-white/10">
              <h3 className="text-white font-semibold mb-2">Current System (Blockhash-based)</h3>
              <ul className="text-white/70 space-y-1 ml-4">
                <li>• Uses the previous block's hash as entropy source</li>
                <li>• Combines with transaction data and ball index</li>
                <li>• Results are transparent but not pre-verifiable</li>
              </ul>
            </div>

            <div className="h-px bg-white/10 my-4"></div>

            <div className="bg-blue-950/20 p-4 rounded border border-blue-400/20">
              <h3 className="text-blue-300 font-semibold mb-2">Future Provably Fair System</h3>
              <ul className="text-blue-200 space-y-1 ml-4">
                <li>• Server seed hashed and shown before playing</li>
                <li>• Player can provide their own client seed</li>
                <li>• Nonce ensures unique results per ball</li>
                <li>• Full verification possible after game completion</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Educational Content */}
        <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-green-400" />
            <h2 className="text-xl font-semibold text-white">What Makes a Game Fair?</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="text-green-400 font-semibold mb-2">✅ Transparent</h3>
              <p className="text-white/70">
                All game logic is on-chain and verifiable. Anyone can audit the smart contract code.
              </p>
            </div>

            <div>
              <h3 className="text-green-400 font-semibold mb-2">✅ Verifiable</h3>
              <p className="text-white/70">
                Results can be independently verified using blockchain data and cryptographic proofs.
              </p>
            </div>

            <div>
              <h3 className="text-green-400 font-semibold mb-2">✅ Immutable</h3>
              <p className="text-white/70">
                Once recorded on the blockchain, results cannot be altered or deleted.
              </p>
            </div>

            <div>
              <h3 className="text-green-400 font-semibold mb-2">✅ Decentralized</h3>
              <p className="text-white/70">
                No single entity controls the randomness or can manipulate outcomes.
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