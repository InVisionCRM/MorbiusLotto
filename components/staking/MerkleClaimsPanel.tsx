'use client'

import { useAccount } from 'wagmi'
import { motion } from 'framer-motion'
import { Gift, CheckCircle2, Loader2, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { useMerkleClaims } from '@/hooks/use-merkle-claims'
import { MERKLE_CLAIM_MORBIUS_ADDRESS } from '@/lib/contracts'

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

const staggerChild = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

function fmtMorbius(raw: string): string {
  const n = Number(raw) / 1e18
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

export function MerkleClaimsPanel() {
  const { address, isConnected } = useAccount()
  const {
    claimableEpochs,
    totalClaimable,
    isLoading,
    error,
    claim,
    isClaiming,
    claimingEpochId,
    refetch,
  } = useMerkleClaims()

  const contractDeployed = Boolean(MERKLE_CLAIM_MORBIUS_ADDRESS)

  // ── Not connected ───────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <motion.div
        key="claims-disconnected"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative rounded-2xl border border-emerald-500/20 bg-[#050f0a]/90 backdrop-blur-sm p-8 text-center space-y-3"
      >
        <Gift className="w-10 h-10 text-emerald-400/60 mx-auto" />
        <p className="text-white/50 font-poppins text-sm">Connect your wallet to see your holder rewards</p>
      </motion.div>
    )
  }

  // ── Contract not deployed yet ────────────────────────────────────────
  if (!contractDeployed) {
    return (
      <motion.div
        key="claims-not-deployed"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative rounded-2xl border border-emerald-500/20 bg-[#050f0a]/90 backdrop-blur-sm p-8 text-center space-y-3"
      >
        <AlertCircle className="w-10 h-10 text-yellow-400/60 mx-auto" />
        <p className="text-white/50 font-poppins text-sm">Holder Rewards contract is not yet deployed.</p>
        <p className="text-white/30 font-poppins text-xs">Check back soon — the first epoch will be announced.</p>
      </motion.div>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-6 text-center">
        <p className="text-red-400 text-sm font-poppins">{error}</p>
      </div>
    )
  }

  const unclaimedCount = claimableEpochs.filter((e) => !e.claimed && e.supersededByEpochNumber === null).length
  const claimedCount = claimableEpochs.filter((e) => e.claimed).length
  const supersededCount = claimableEpochs.filter((e) => e.supersededByEpochNumber !== null).length

  return (
    <motion.div
      key="claims"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-3"
    >
      {/* ── Summary Card ─────────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-emerald-500/20 bg-[#050f0a]/90 backdrop-blur-sm p-5 overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent pointer-events-none"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ repeat: Infinity, duration: 5, ease: 'linear' }}
        />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Gift className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 font-poppins">Total Claimable</p>
              <p className="text-xl font-bold text-white font-poppins">
                {fmtMorbius(totalClaimable.toString())}
                <span className="text-xs text-white/30 font-normal ml-1">MORBIUS</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 font-poppins">Epochs</p>
              <p className="text-sm font-semibold font-poppins text-white/60">
                <span className="text-emerald-400">{unclaimedCount} pending</span>
                {claimedCount > 0 && <span className="text-white/30"> · {claimedCount} claimed</span>}
                {supersededCount > 0 && <span className="text-amber-400/60"> · {supersededCount} rolled up</span>}
              </p>
            </div>
            <button
              onClick={refetch}
              className="p-2 rounded-lg border border-emerald-500/20 text-emerald-400/60 hover:text-emerald-300 hover:bg-emerald-950/30 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── No epochs message ─────────────────────────────────────── */}
      {claimableEpochs.length === 0 && (
        <div className="relative rounded-2xl border border-emerald-500/10 bg-[#050f0a]/60 backdrop-blur-sm p-8 text-center space-y-2">
          <Gift className="w-8 h-8 text-emerald-400/30 mx-auto" />
          <p className="text-white/40 font-poppins text-sm">No rewards found for your wallet yet.</p>
          <p className="text-white/20 font-poppins text-xs">
            Hold MORBIUS in your wallet — rewards are distributed each epoch based on your share.
          </p>
        </div>
      )}

      {/* ── Epoch List ───────────────────────────────────────────── */}
      {claimableEpochs.length > 0 && (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {claimableEpochs.map(({ epoch, amount, proof, claimed, supersededByEpochNumber }) => {
            const isSuperseded = supersededByEpochNumber !== null

            return (
              <motion.div
                key={epoch.id}
                variants={staggerChild}
                className={`relative rounded-2xl border backdrop-blur-sm p-4 transition-all ${
                  isSuperseded
                    ? 'border-amber-500/10 bg-amber-950/5 opacity-50'
                    : claimed
                    ? 'border-emerald-500/10 bg-emerald-950/5 opacity-60'
                    : 'border-emerald-500/20 bg-[#050f0a]/90 hover:border-emerald-400/30'
                }`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {/* Epoch info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSuperseded ? 'bg-amber-500/10'
                      : claimed ? 'bg-emerald-500/10' : 'bg-emerald-500/15 border border-emerald-500/25'
                    }`}>
                      {isSuperseded
                        ? <Gift className="w-4 h-4 text-amber-400/50" />
                        : claimed
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400/70" />
                        : <Gift className="w-4 h-4 text-emerald-400" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white font-poppins">
                        Epoch #{epoch.epoch_number}
                      </p>
                      <p className="text-[10px] text-white/30 font-poppins">
                        {epoch.published_at
                          ? new Date(epoch.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Published'
                        }
                        {epoch.snapshot_block && (
                          <span className="ml-1.5 text-white/20">· Block {Number(epoch.snapshot_block).toLocaleString()}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Amount + action */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-bold font-poppins ${isSuperseded ? 'text-white/30' : 'text-white'}`}>
                        {fmtMorbius(amount)}
                        <span className="text-[10px] text-white/30 font-normal ml-1">MORBIUS</span>
                      </p>
                    </div>

                    {isSuperseded ? (
                      <span className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400/70 text-xs font-poppins font-semibold whitespace-nowrap">
                        → Epoch #{supersededByEpochNumber}
                      </span>
                    ) : claimed ? (
                      <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400/70 text-xs font-poppins font-semibold">
                        Claimed ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => claim(epoch.epoch_number, amount, proof)}
                        disabled={isClaiming}
                        className="px-4 py-2 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-900/30 font-poppins flex items-center gap-1.5"
                      >
                        {claimingEpochId === epoch.epoch_number ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Claiming…</>
                        ) : 'Claim'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Superseded info tooltip */}
                {isSuperseded && (
                  <p className="mt-2 text-[10px] text-amber-400/50 font-poppins">
                    These rewards were rolled into Epoch #{supersededByEpochNumber} — claim from there.
                  </p>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* ── How it works footer ───────────────────────────────────── */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-white/20 font-poppins font-semibold">How it works</p>
        <p className="text-[11px] text-white/35 font-poppins leading-relaxed">
          Hold MORBIUS in your wallet. Each epoch, a snapshot of all holders is taken and rewards are distributed proportionally. No locking required — just hold and claim.
        </p>
        <p className="text-[11px] text-white/25 font-poppins">
          Unclaimed rewards roll forward automatically — if you skip an epoch, your rewards are included in the next Merkle root so you can batch-claim whenever convenient.
        </p>
        <p className="text-[11px] text-white/20 font-poppins">
          Minimum holding: 1,000 MORBIUS · Snapshots taken weekly or by admin.
        </p>
      </div>
    </motion.div>
  )
}
