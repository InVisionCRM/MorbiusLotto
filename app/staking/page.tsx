'use client'

import { useState, useEffect } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useChainId,
  useSwitchChain,
  usePublicClient,
} from 'wagmi'
import { formatEther, parseEther } from 'viem'
import Image from 'next/image'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import {
  MORBIUS_STAKING_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  MORBIUS_LP_STAKING_ADDRESS,
  MORBIUS_WPLS_V1_PAIR,
  WPLS_TOKEN_ADDRESS,
} from '@/lib/contracts'
import { morbiusStakingAbi } from '@/abi/morbius-staking'
import { morbiusLPStakingAbi } from '@/abi/morbius-lp-staking'
import { ERC20_ABI } from '@/abi/erc20'
import { useTokenBalance } from '@/hooks/use-token'
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background'
import { pulsechain } from '@/lib/chains'
import { toast } from 'sonner'
import {
  Loader2, X, FileText, ExternalLink, Flame,
  TrendingUp, Droplets, ArrowUpRight, ChevronDown, ChevronUp,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStakingHistory } from '@/hooks/use-staking-history'
import { useLPStakingHistory } from '@/hooks/use-lp-staking-history'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { MerkleClaimsPanel } from '@/components/staking/MerkleClaimsPanel'

const STAKING_ADDR = MORBIUS_STAKING_ADDRESS as `0x${string}`
const LP_STAKING_ADDR = MORBIUS_LP_STAKING_ADDRESS as `0x${string}`
const MORBIUS_ADDR = MORBIUS_TOKEN_ADDRESS as `0x${string}`
const PLP_ADDR = MORBIUS_WPLS_V1_PAIR as `0x${string}`
const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')
const PULSEX_ADD_LIQUIDITY_URL = `https://app.pulsex.com/add/v1/${WPLS_TOKEN_ADDRESS}/${MORBIUS_TOKEN_ADDRESS}`

type Tab = 'analytics' | 'morbius' | 'lp' | 'claims'

// ── Animation variants ────────────────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18 },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

const staggerChild = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmt(val: bigint): string {
  return Math.floor(Number(formatEther(val))).toLocaleString()
}

function fmtDec(val: bigint, decimals = 2): string {
  const n = Number(formatEther(val))
  if (n >= 1000) return Math.floor(n).toLocaleString()
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtLP(val: bigint): string {
  const n = Number(formatEther(val))
  if (n === 0) return '0'
  if (n >= 100) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 })
}

function fmtUsd(usd: number | null | undefined): string {
  if (usd == null) return '—'
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(2)}K`
  return `$${usd.toFixed(2)}`
}

function fmtPrice(price: number | null): string {
  if (price == null) return '—'
  if (price < 0.000001) return price.toExponential(4)
  if (price < 0.01) return price.toFixed(8)
  if (price < 1) return price.toFixed(6)
  return price.toFixed(4)
}

function formatDate(ts: bigint | undefined): string {
  if (!ts || ts === 0n) return '—'
  return new Date(Number(ts) * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── LP Guide Steps ────────────────────────────────────────────────────

const lpGuideSteps = [
  {
    n: '1',
    title: 'Get WPLS and MORBIUS',
    desc: "You'll need both WPLS and MORBIUS tokens in your wallet. Acquire them via a DEX like PulseX.",
  },
  {
    n: '2',
    title: 'Go to PulseX V1 Liquidity',
    desc: 'Click "Provide Liquidity on PulseX" above. This opens the PulseX V1 MORBIUS/WPLS pair directly.',
  },
  {
    n: '3',
    title: 'Enter Amounts & Add Liquidity',
    desc: "Enter the amount of WPLS (or MORBIUS) you want to add. PulseX will calculate the matching amount automatically. Approve both tokens, then click \"Add Liquidity\".",
  },
  {
    n: '4',
    title: 'Receive PLP Tokens',
    desc: "After adding liquidity you'll receive PLP (PulseX LP) tokens representing your share of the pool.",
  },
  {
    n: '5',
    title: 'Stake Your PLP Here',
    desc: 'Return to this page, switch to the "LP Staking" tab, approve your PLP tokens and stake them to start earning MORBIUS rewards.',
  },
]

// ── Info Modal ────────────────────────────────────────────────────────

function InfoModal({ open, onClose, tab }: { open: boolean; onClose: () => void; tab: Tab }) {
  const isMorbius = tab !== 'lp'
  const accentText = isMorbius ? 'text-cyan-400' : 'text-purple-400'
  const borderOuter = isMorbius ? 'border-cyan-500/20' : 'border-purple-500/20'
  const borderInner = isMorbius ? 'border-cyan-500/10' : 'border-purple-500/10'
  const addressLink = isMorbius ? 'text-cyan-400 hover:text-cyan-300' : 'text-purple-400 hover:text-purple-300'

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 pointer-events-none"
          >
            <div
              className={`pointer-events-auto w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border ${borderOuter} bg-[#080d18] shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#080d18]/95 backdrop-blur-sm border-b ${borderInner}`}>
                <div className="flex items-center gap-3">
                  <Image
                    src="/morbius/MorbiusLogo (3).png"
                    alt="MORBIUS"
                    width={36}
                    height={36}
                    className="rounded-full"
                  />
                  <div>
                    <h2 className="text-lg font-bold text-white font-poppins">
                      {isMorbius ? 'MORBIUS Staking' : 'LP Staking'}
                    </h2>
                    <p className="text-[10px] uppercase tracking-wider text-white/30 font-poppins">Protocol Overview</p>
                  </div>
                </div>
                <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-6 font-poppins text-sm leading-relaxed">
                {isMorbius ? (
                  <>
                    <section>
                      <h3 className={`text-xs uppercase tracking-wider ${accentText} font-semibold mb-2`}>Overview</h3>
                      <p className="text-white/70">
                        The MORBIUS Staking contract allows MORBIUS token holders to stake their tokens and earn a proportional share of protocol revenue. Rewards are distributed using the Synthetix reward-per-token model.
                      </p>
                    </section>
                    <section>
                      <h3 className={`text-xs uppercase tracking-wider ${accentText} font-semibold mb-2`}>How It Works</h3>
                      <ol className="list-decimal list-inside space-y-2 text-white/70">
                        <li><span className="text-white/90 font-medium">Approve</span> — Grant the staking contract permission to transfer your MORBIUS (one-time).</li>
                        <li><span className="text-white/90 font-medium">Stake</span> — Deposit MORBIUS. Your tokens begin accruing rewards immediately.</li>
                        <li><span className="text-white/90 font-medium">Earn</span> — As protocol fees are deposited, they are distributed proportionally to all stakers.</li>
                        <li><span className="text-white/90 font-medium">Claim</span> — Withdraw accumulated rewards at any time. Rewards are paid in MORBIUS.</li>
                        <li><span className="text-white/90 font-medium">Unstake</span> — Withdraw staked tokens anytime. A 5% unstake fee applies (2.5% redistributed to stakers, 2.5% to LP stakers).</li>
                      </ol>
                    </section>
                    <section>
                      <h3 className={`text-xs uppercase tracking-wider ${accentText} font-semibold mb-2`}>Contract Addresses</h3>
                      <div className={`rounded-xl bg-[#060b14] border ${borderInner} p-4 space-y-3`}>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Staking Contract</div>
                          <a href={`https://scan.pulsechain.com/address/${STAKING_ADDR}`} target="_blank" rel="noopener noreferrer" className={`${addressLink} text-xs font-mono break-all transition-colors`}>{STAKING_ADDR}</a>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">MORBIUS Token</div>
                          <a href={`https://scan.pulsechain.com/address/${MORBIUS_ADDR}`} target="_blank" rel="noopener noreferrer" className={`${addressLink} text-xs font-mono break-all transition-colors`}>{MORBIUS_ADDR}</a>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Network</div>
                          <p className="text-white/70 text-xs">PulseChain Mainnet (Chain ID: 369)</p>
                        </div>
                      </div>
                    </section>
                  </>
                ) : (
                  <>
                    <section>
                      <h3 className={`text-xs uppercase tracking-wider ${accentText} font-semibold mb-2`}>Overview</h3>
                      <p className="text-white/70">
                        The LP Staking contract rewards Morbius/WPLS liquidity providers. Stake your PulseX V1 LP tokens to earn a proportional share of MORBIUS rewards generated by the protocol.
                      </p>
                    </section>
                    <section>
                      <h3 className={`text-xs uppercase tracking-wider ${accentText} font-semibold mb-2`}>How It Works</h3>
                      <ol className="list-decimal list-inside space-y-2 text-white/70">
                        <li><span className="text-white/90 font-medium">Provide Liquidity</span> — Add MORBIUS and WPLS to the PulseX V1 pool to receive PLP tokens.</li>
                        <li><span className="text-white/90 font-medium">Approve</span> — Grant the LP staking contract permission to transfer your PLP tokens (one-time).</li>
                        <li><span className="text-white/90 font-medium">Stake</span> — Deposit PLP tokens. You begin earning MORBIUS rewards immediately.</li>
                        <li><span className="text-white/90 font-medium">Claim</span> — Withdraw accumulated MORBIUS rewards at any time.</li>
                        <li><span className="text-white/90 font-medium">Unstake</span> — Withdraw LP tokens anytime. A 5% unstake fee applies — LP tokens are permanently burned.</li>
                      </ol>
                    </section>
                    <section>
                      <h3 className={`text-xs uppercase tracking-wider ${accentText} font-semibold mb-2`}>Contract Addresses</h3>
                      <div className={`rounded-xl bg-[#060b14] border ${borderInner} p-4 space-y-3`}>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">LP Staking Contract</div>
                          <a href={`https://scan.pulsechain.com/address/${LP_STAKING_ADDR}`} target="_blank" rel="noopener noreferrer" className={`${addressLink} text-xs font-mono break-all transition-colors`}>{LP_STAKING_ADDR}</a>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">PLP Token (Morbius/WPLS LP)</div>
                          <a href={`https://scan.pulsechain.com/address/${PLP_ADDR}`} target="_blank" rel="noopener noreferrer" className={`${addressLink} text-xs font-mono break-all transition-colors`}>{PLP_ADDR}</a>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Network</div>
                          <p className="text-white/70 text-xs">PulseChain Mainnet (Chain ID: 369)</p>
                        </div>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function StakingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('analytics')
  const [showInfo, setShowInfo] = useState(false)
  const [showLpGuide, setShowLpGuide] = useState(false)

  const [morbiusPrice, setMorbiusPrice] = useState<number | null>(null)
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null)
  const [liquidityUsd, setLiquidityUsd] = useState<number | null>(null)

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const isWrongChain = chainId !== pulsechain.id

  const [mStakeInput, setMStakeInput] = useState('')
  const [mUnstakeInput, setMUnstakeInput] = useState('')
  const [mAction, setMAction] = useState<string | null>(null)

  const [lpStakeInput, setLpStakeInput] = useState('')
  const [lpUnstakeInput, setLpUnstakeInput] = useState('')
  const [lpAction, setLpAction] = useState<string | null>(null)

  // ── DexScreener price fetch ───────────────────────────────────────

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/pairs/pulsechain/${PLP_ADDR.toLowerCase()}`,
        )
        const data = await res.json()
        const pair = data?.pairs?.[0] ?? data?.pair
        if (!pair) return
        const price = parseFloat(pair.priceUsd ?? '0')
        if (price > 0) setMorbiusPrice(price)
        const change = parseFloat(pair.priceChange?.h24 ?? '0')
        setPriceChange24h(change)
        const liq = parseFloat(pair.liquidity?.usd ?? '0')
        if (liq > 0) setLiquidityUsd(liq)
      } catch {
        // silent
      }
    }
    fetchPrice()
    const interval = setInterval(fetchPrice, 60_000)
    return () => clearInterval(interval)
  }, [])

  // ── MORBIUS staking reads ─────────────────────────────────────────

  const { data: mUserStaked, refetch: refetchMStaked } = useReadContract({
    address: STAKING_ADDR,
    abi: morbiusStakingAbi,
    functionName: 'stakedBalance',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const { data: mTotalStaked, refetch: refetchMTotal } = useReadContract({
    address: STAKING_ADDR,
    abi: morbiusStakingAbi,
    functionName: 'totalStaked',
  })
  const { data: mEarned, refetch: refetchMEarned } = useReadContract({
    address: STAKING_ADDR,
    abi: morbiusStakingAbi,
    functionName: 'earned',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const { data: mTotalStakers } = useReadContract({
    address: STAKING_ADDR,
    abi: morbiusStakingAbi,
    functionName: 'totalStakers',
  })
  const { data: mPendingRewards, refetch: refetchMPending } = useReadContract({
    address: STAKING_ADDR,
    abi: morbiusStakingAbi,
    functionName: 'totalPendingRewards',
  })
  const { data: mTotalClaimed } = useReadContract({
    address: STAKING_ADDR,
    abi: morbiusStakingAbi,
    functionName: 'totalRewardsClaimed',
  })
  const { data: mStakedAt } = useReadContract({
    address: STAKING_ADDR,
    abi: morbiusStakingAbi,
    functionName: 'stakedAt',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { balance: morbiusWalletBal } = useTokenBalance(address)

  const mStakeWei = mStakeInput ? parseEther(mStakeInput) : 0n
  const { data: mAllowanceRaw, refetch: refetchMAllowance, isLoading: mAllowanceLoading } = useReadContract({
    address: MORBIUS_ADDR,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, STAKING_ADDR] : undefined,
    query: { enabled: !!address, refetchInterval: 2000, staleTime: 0 },
  })
  const mAllowance = (mAllowanceRaw ?? 0n) as bigint
  const mNeedsApproval = mAllowanceRaw !== undefined && !mAllowanceLoading && mAllowance < mStakeWei && mStakeWei > 0n

  const mStaked = (mUserStaked ?? 0n) as bigint
  const mTotal = (mTotalStaked ?? 0n) as bigint
  const mEarnedBal = (mEarned ?? 0n) as bigint
  const mStakers = Number(mTotalStakers ?? 0n)
  const mPending = (mPendingRewards ?? 0n) as bigint
  const mTotalClaimedBal = (mTotalClaimed ?? 0n) as bigint
  const mStakedAtTs = (mStakedAt ?? 0n) as bigint
  const mShare = mTotal > 0n ? ((Number(mStaked) / Number(mTotal)) * 100).toFixed(2) : '0.00'
  const mWalletBal = morbiusWalletBal ?? 0n
  const mMaxStake = mWalletBal ? Math.floor(Number(formatEther(mWalletBal))) : 0
  const mMaxUnstake = mStaked ? Math.floor(Number(formatEther(mStaked))) : 0
  const mBusy = mAction !== null

  // ── LP staking reads ──────────────────────────────────────────────

  const { data: lpUserStaked, refetch: refetchLpStaked } = useReadContract({
    address: LP_STAKING_ADDR,
    abi: morbiusLPStakingAbi,
    functionName: 'stakedBalance',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const { data: lpTotalStaked, refetch: refetchLpTotal } = useReadContract({
    address: LP_STAKING_ADDR,
    abi: morbiusLPStakingAbi,
    functionName: 'totalStaked',
  })
  const { data: lpEarned, refetch: refetchLpEarned } = useReadContract({
    address: LP_STAKING_ADDR,
    abi: morbiusLPStakingAbi,
    functionName: 'earned',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const { data: lpTotalStakers } = useReadContract({
    address: LP_STAKING_ADDR,
    abi: morbiusLPStakingAbi,
    functionName: 'totalStakers',
  })
  const { data: lpPendingRewards, refetch: refetchLpPending } = useReadContract({
    address: LP_STAKING_ADDR,
    abi: morbiusLPStakingAbi,
    functionName: 'totalPendingRewards',
  })
  const { data: lpTotalBurned } = useReadContract({
    address: LP_STAKING_ADDR,
    abi: morbiusLPStakingAbi,
    functionName: 'totalBurned',
  })
  const { data: lpTotalClaimed } = useReadContract({
    address: LP_STAKING_ADDR,
    abi: morbiusLPStakingAbi,
    functionName: 'totalRewardsClaimed',
  })
  const { data: lpStakedAt } = useReadContract({
    address: LP_STAKING_ADDR,
    abi: morbiusLPStakingAbi,
    functionName: 'stakedAt',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: plpBalRaw, refetch: refetchPlpBal } = useReadContract({
    address: PLP_ADDR,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const lpStakeWei = lpStakeInput ? parseEther(lpStakeInput) : 0n
  const { data: lpAllowanceRaw, refetch: refetchLpAllowance, isLoading: lpAllowanceLoading } = useReadContract({
    address: PLP_ADDR,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, LP_STAKING_ADDR] : undefined,
    query: { enabled: !!address, refetchInterval: 2000, staleTime: 0 },
  })
  const lpAllowance = (lpAllowanceRaw ?? 0n) as bigint
  const lpNeedsApproval = lpAllowanceRaw !== undefined && !lpAllowanceLoading && lpAllowance < lpStakeWei && lpStakeWei > 0n

  const lpStaked = (lpUserStaked ?? 0n) as bigint
  const lpTotal = (lpTotalStaked ?? 0n) as bigint
  const lpEarnedBal = (lpEarned ?? 0n) as bigint
  const lpStakers = Number(lpTotalStakers ?? 0n)
  const lpPending = (lpPendingRewards ?? 0n) as bigint
  const lpBurned = (lpTotalBurned ?? 0n) as bigint
  const lpTotalClaimedBal = (lpTotalClaimed ?? 0n) as bigint
  const lpStakedAtTs = (lpStakedAt ?? 0n) as bigint
  const lpShare = lpTotal > 0n ? ((Number(lpStaked) / Number(lpTotal)) * 100).toFixed(2) : '0.00'
  const plpWalletBal = (plpBalRaw ?? 0n) as bigint
  const lpBusy = lpAction !== null

  const toUsd = (tokens: bigint): number | null =>
    morbiusPrice ? Number(formatEther(tokens)) * morbiusPrice : null

  const { history: mHistory, isLoading: mHistoryLoading } = useStakingHistory(address)
  const { history: lpHistory, isLoading: lpHistoryLoading } = useLPStakingHistory(address)

  // ── Chain helpers ─────────────────────────────────────────────────

  const ensureChain = async () => {
    if (isWrongChain && switchChainAsync) await switchChainAsync({ chainId: pulsechain.id })
  }

  const refetchM = () => {
    refetchMStaked(); refetchMTotal(); refetchMEarned(); refetchMPending(); refetchMAllowance()
  }

  const refetchLP = () => {
    refetchLpStaked(); refetchLpTotal(); refetchLpEarned(); refetchLpPending(); refetchLpAllowance(); refetchPlpBal()
  }

  // ── Transaction executors ─────────────────────────────────────────

  const execMTx = async (action: string, txFn: () => Promise<`0x${string}`>, successMsg: string) => {
    const toastId = `mstaking-${action}`
    setMAction(action)
    try {
      await ensureChain()
      const hash = await txFn()
      toast.info(`${action}...`, { id: toastId, description: 'Transaction submitted. Confirming on-chain...', duration: Infinity })
      const receipt = await publicClient!.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain.')
      setMStakeInput(''); setMUnstakeInput(''); refetchM()
      toast.success(successMsg, { id: toastId, duration: 6000 })
    } catch (e: any) {
      const msg = e?.message || ''
      if (msg.includes('rejected') || msg.includes('denied')) toast.error('Transaction cancelled', { id: toastId })
      else toast.error(msg.slice(0, 100) || 'Transaction failed', { id: toastId })
    } finally { setMAction(null) }
  }

  const execLPTx = async (action: string, txFn: () => Promise<`0x${string}`>, successMsg: string) => {
    const toastId = `lpstaking-${action}`
    setLpAction(action)
    try {
      await ensureChain()
      const hash = await txFn()
      toast.info(`${action}...`, { id: toastId, description: 'Transaction submitted. Confirming on-chain...', duration: Infinity })
      const receipt = await publicClient!.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain.')
      setLpStakeInput(''); setLpUnstakeInput(''); refetchLP()
      toast.success(successMsg, { id: toastId, duration: 6000 })
    } catch (e: any) {
      const msg = e?.message || ''
      if (msg.includes('rejected') || msg.includes('denied')) toast.error('Transaction cancelled', { id: toastId })
      else toast.error(msg.slice(0, 100) || 'Transaction failed', { id: toastId })
    } finally { setLpAction(null) }
  }

  // ── MORBIUS handlers ──────────────────────────────────────────────

  const handleMApprove = async () => {
    if (!mStakeInput || mStakeWei <= 0n) return
    const toastId = 'mstaking-approve'
    setMAction('stake')
    try {
      await ensureChain()
      const hash = await writeContractAsync({ address: MORBIUS_ADDR, abi: ERC20_ABI, functionName: 'approve', args: [STAKING_ADDR, MAX_UINT256], chainId: pulsechain.id })
      const saved = mStakeInput
      toast.info('Approving MORBIUS...', { id: toastId, description: 'Transaction submitted. Confirming on-chain...', duration: Infinity })
      const receipt = await publicClient!.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') throw new Error('Approval reverted.')
      refetchM(); setMStakeInput(saved)
      toast.success('MORBIUS approved!', { id: toastId, description: `Click "Stake" to deposit ${Number(saved).toLocaleString()} MORBIUS.`, duration: 8000 })
    } catch (e: any) {
      const msg = e?.message || ''
      if (msg.includes('rejected') || msg.includes('denied')) toast.error('Approval cancelled', { id: toastId })
      else toast.error(msg.slice(0, 100) || 'Approval failed', { id: toastId })
    } finally { setMAction(null) }
  }

  const handleMStake = () => {
    if (!mStakeInput || mStakeWei <= 0n) return
    if (mNeedsApproval) { handleMApprove(); return }
    execMTx('Staking', () => writeContractAsync({ address: STAKING_ADDR, abi: morbiusStakingAbi, functionName: 'stake', args: [mStakeWei], chainId: pulsechain.id }), 'Staked successfully')
  }

  const handleMUnstake = () => {
    const amt = mUnstakeInput ? parseEther(mUnstakeInput) : 0n
    if (amt <= 0n || amt > mStaked) return
    execMTx('Unstaking', () => writeContractAsync({ address: STAKING_ADDR, abi: morbiusStakingAbi, functionName: 'unstake', args: [amt], chainId: pulsechain.id }), 'Unstaked successfully')
  }

  const handleMClaim = () => {
    if (mEarnedBal <= 0n) { toast.error('Nothing to claim'); return }
    execMTx('Claiming rewards', () => writeContractAsync({ address: STAKING_ADDR, abi: morbiusStakingAbi, functionName: 'claim', chainId: pulsechain.id }), 'Rewards claimed')
  }

  const handleMRefresh = () => {
    execMTx('Updating pool', () => writeContractAsync({ address: STAKING_ADDR, abi: morbiusStakingAbi, functionName: 'updatePool', chainId: pulsechain.id }), 'Pool updated')
  }

  // ── LP handlers ───────────────────────────────────────────────────

  const handleLPApprove = async () => {
    if (!lpStakeInput || lpStakeWei <= 0n) return
    const toastId = 'lpstaking-approve'
    setLpAction('stake')
    try {
      await ensureChain()
      const hash = await writeContractAsync({ address: PLP_ADDR, abi: ERC20_ABI, functionName: 'approve', args: [LP_STAKING_ADDR, MAX_UINT256], chainId: pulsechain.id })
      const saved = lpStakeInput
      toast.info('Approving PLP...', { id: toastId, description: 'Transaction submitted. Confirming on-chain...', duration: Infinity })
      const receipt = await publicClient!.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') throw new Error('Approval reverted.')
      refetchLP(); setLpStakeInput(saved)
      toast.success('PLP approved!', { id: toastId, description: 'Click "Stake LP" to deposit your tokens.', duration: 8000 })
    } catch (e: any) {
      const msg = e?.message || ''
      if (msg.includes('rejected') || msg.includes('denied')) toast.error('Approval cancelled', { id: toastId })
      else toast.error(msg.slice(0, 100) || 'Approval failed', { id: toastId })
    } finally { setLpAction(null) }
  }

  const handleLPStake = () => {
    if (!lpStakeInput || lpStakeWei <= 0n) return
    if (lpNeedsApproval) { handleLPApprove(); return }
    execLPTx('Staking LP', () => writeContractAsync({ address: LP_STAKING_ADDR, abi: morbiusLPStakingAbi, functionName: 'stake', args: [lpStakeWei], chainId: pulsechain.id }), 'LP tokens staked')
  }

  const handleLPUnstake = () => {
    const amt = lpUnstakeInput ? parseEther(lpUnstakeInput) : 0n
    if (amt <= 0n || amt > lpStaked) return
    execLPTx('Unstaking LP', () => writeContractAsync({ address: LP_STAKING_ADDR, abi: morbiusLPStakingAbi, functionName: 'unstake', args: [amt], chainId: pulsechain.id }), 'LP tokens unstaked')
  }

  const handleLPClaim = () => {
    if (lpEarnedBal <= 0n) { toast.error('Nothing to claim'); return }
    execLPTx('Claiming rewards', () => writeContractAsync({ address: LP_STAKING_ADDR, abi: morbiusLPStakingAbi, functionName: 'claim', chainId: pulsechain.id }), 'Rewards claimed')
  }

  const handleLPRefresh = () => {
    execLPTx('Updating pool', () => writeContractAsync({ address: LP_STAKING_ADDR, abi: morbiusLPStakingAbi, functionName: 'updatePool', chainId: pulsechain.id }), 'Pool updated')
  }

  // ── DottedGlow colors ─────────────────────────────────────────────

  const glowColor = activeTab === 'morbius' ? 'rgba(16, 187, 217, 0.85)' : activeTab === 'lp' ? 'rgb(155, 62, 243)' : activeTab === 'claims' ? 'rgb(16, 185, 129)' : 'rgb(255, 255, 255)'
  const dotColor = activeTab === 'morbius' ? 'rgb(14, 50, 59)' : activeTab === 'lp' ? 'rgb(14, 50, 59)' : activeTab === 'claims' ? 'rgb(5, 46, 22)' : 'rgb(14, 50, 59)'

  // ── Tab theme classes ─────────────────────────────────────────────

  const mCard = 'relative rounded-2xl border border-cyan-500/20 bg-[#0a0f1a]/90 backdrop-blur-sm p-5'
  const mInner = 'rounded-xl bg-[#060b14] border border-cyan-500/10 p-4'
  const mBtnPrimary = 'w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 shadow-lg shadow-cyan-900/30 font-poppins'
  const mBtnSecondary = 'w-full py-3 rounded-xl font-semibold text-cyan-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-transparent border border-cyan-500/30 hover:bg-cyan-950/40 font-poppins'
  const mInput = 'flex-1 h-11 rounded-lg bg-[#060b14] border border-cyan-500/20 text-white px-3 text-sm font-poppins focus:outline-none focus:border-cyan-400 transition-colors'
  const mMaxBtn = 'px-4 h-11 rounded-lg border border-cyan-500/20 text-cyan-400 text-xs font-poppins font-semibold hover:bg-cyan-950/30 transition-colors'

  const lpCard = 'relative rounded-2xl border border-purple-500/20 bg-[#0d0a1a]/90 backdrop-blur-sm p-5'
  const lpInner = 'rounded-xl bg-[#080614] border border-purple-500/10 p-4'
  const lpBtnPrimary = 'w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 shadow-lg shadow-purple-900/30 font-poppins'
  const lpBtnSecondary = 'w-full py-3 rounded-xl font-semibold text-purple-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-transparent border border-purple-500/30 hover:bg-purple-950/40 font-poppins'
  const lpInput = 'flex-1 h-11 rounded-lg bg-[#080614] border border-purple-500/20 text-white px-3 text-sm font-poppins focus:outline-none focus:border-purple-400 transition-colors'
  const lpMaxBtn = 'px-4 h-11 rounded-lg border border-purple-500/20 text-purple-400 text-xs font-poppins font-semibold hover:bg-purple-950/30 transition-colors'

  return (
    <GlobalMainNav>
      <div className="min-h-screen bg-[#050a12] text-white pt-4 md:pt-2 relative overflow-hidden">
        <DottedGlowBackground
          color={dotColor}
          darkColor={dotColor}
          glowColor={glowColor}
          darkGlowColor={glowColor}
          gap={5}
          radius={2}
          opacity={0.4}
          edgeFadeOpacity={0.1}
          speedMin={0.01}
          speedMax={0.03}
          speedScale={0.1}
        />

        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="max-w-lg mx-auto space-y-5">

            {/* ── Tab Switcher ── */}
            <div className="flex gap-1 p-1.5 rounded-2xl bg-white/5 border border-white/10">
              {([
                { id: 'analytics' as Tab, label: 'Analytics', active: 'bg-gradient-to-r from-indigo-600 to-violet-500 shadow-indigo-900/40' },
                { id: 'morbius' as Tab, label: 'MORBIUS Staking', active: 'bg-gradient-to-r from-cyan-700 to-cyan-500 shadow-cyan-900/40' },
                { id: 'lp' as Tab, label: 'LP Staking', active: 'bg-gradient-to-r from-purple-700 to-purple-500 shadow-purple-900/40' },
                { id: 'claims' as Tab, label: 'Holder Rewards', active: 'bg-gradient-to-r from-emerald-700 to-emerald-500 shadow-emerald-900/40' },
              ]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold font-poppins transition-all duration-200 ${
                    activeTab === t.id ? `${t.active} text-white shadow-lg` : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Panel Content ── */}
            <AnimatePresence mode="wait">

              {/* ── ANALYTICS PANEL ── */}
              {activeTab === 'analytics' && (
                <motion.div key="analytics" {...fadeUp} className="space-y-3">

                  {/* Price strip */}
                  <div className="relative rounded-2xl border border-indigo-500/20 bg-[#09091a]/90 backdrop-blur-sm px-4 py-3 overflow-hidden">
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent pointer-events-none"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                    />
                    <div className="relative flex items-center gap-2 flex-wrap justify-between">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-[10px] uppercase tracking-wider text-white/30 font-poppins">MORBIUS</span>
                        </div>
                        <div>
                          <span className="text-lg font-bold text-white font-poppins">${fmtPrice(morbiusPrice)}</span>
                          <span className="text-[9px] text-white/25 font-poppins ml-1">USD</span>
                        </div>
                        <div className={`text-lg font-bold font-poppins ${priceChange24h == null ? 'text-white/30' : priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {priceChange24h == null ? '—' : `${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%`}
                          <span className="text-[9px] text-white/25 font-poppins font-normal ml-1">24h</span>
                        </div>
                        <div>
                          <span className="text-lg font-bold text-white font-poppins">{fmtUsd(liquidityUsd)}</span>
                          <span className="text-[9px] text-white/25 font-poppins ml-1">liq</span>
                        </div>
                      </div>
                      <a href={`https://dexscreener.com/pulsechain/${PLP_ADDR.toLowerCase()}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10px] text-indigo-400/50 hover:text-indigo-300 transition-colors font-poppins">
                        DexScreener <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Stats grid — side by side on md, stacked on mobile */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                    {/* MORBIUS Staking */}
                    <div className="rounded-2xl border border-cyan-500/20 bg-[#0a0f1a]/90 backdrop-blur-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <motion.div
                            className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                            animate={{ boxShadow: ['0 0 3px rgba(34,211,238,0.4)', '0 0 8px rgba(34,211,238,0.8)', '0 0 3px rgba(34,211,238,0.4)'] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                          />
                          <span className="text-[10px] uppercase tracking-wider text-cyan-400/70 font-poppins font-semibold">MORBIUS Staking</span>
                        </div>
                        <button onClick={() => setActiveTab('morbius')} className="text-[10px] text-cyan-400/50 hover:text-cyan-300 font-poppins transition-colors">Stake →</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Total Staked', value: fmt(mTotal), sub: toUsd(mTotal) != null ? fmtUsd(toUsd(mTotal)) : 'MORBIUS', color: 'text-white' },
                          { label: 'Stakers', value: mStakers.toLocaleString(), sub: null, color: 'text-white' },
                          { label: 'Reward Pool', value: fmt(mPending), sub: toUsd(mPending) != null ? fmtUsd(toUsd(mPending)) : null, color: 'text-cyan-400' },
                          { label: 'Total Claimed', value: fmt(mTotalClaimedBal), sub: toUsd(mTotalClaimedBal) != null ? fmtUsd(toUsd(mTotalClaimedBal)) : null, color: 'text-white' },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg bg-cyan-950/20 border border-cyan-500/10 px-3 py-2 text-center">
                            <div className="text-[9px] uppercase tracking-wider text-white/25 font-poppins mb-0.5">{s.label}</div>
                            <div className={`text-base font-bold font-poppins ${s.color}`}>{s.value}</div>
                            {s.sub && <div className="text-[9px] text-white/25 font-poppins">{s.sub}</div>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* LP Staking */}
                    <div className="rounded-2xl border border-purple-500/20 bg-[#0d0a1a]/90 backdrop-blur-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <motion.div
                            className="w-1.5 h-1.5 rounded-full bg-purple-400"
                            animate={{ boxShadow: ['0 0 3px rgba(192,132,252,0.4)', '0 0 8px rgba(192,132,252,0.8)', '0 0 3px rgba(192,132,252,0.4)'] }}
                            transition={{ repeat: Infinity, duration: 2, delay: 1 }}
                          />
                          <span className="text-[10px] uppercase tracking-wider text-purple-400/70 font-poppins font-semibold">LP Staking</span>
                        </div>
                        <button onClick={() => setActiveTab('lp')} className="text-[10px] text-purple-400/50 hover:text-purple-300 font-poppins transition-colors">Stake LP →</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'LP Staked', value: fmtLP(lpTotal), sub: 'PLP', color: 'text-white' },
                          { label: 'Stakers', value: lpStakers.toLocaleString(), sub: null, color: 'text-white' },
                          { label: 'MORBIUS Pool', value: fmt(lpPending), sub: toUsd(lpPending) != null ? fmtUsd(toUsd(lpPending)) : null, color: 'text-purple-400' },
                          { label: 'LP Burned', value: fmtLP(lpBurned), sub: 'PLP', color: 'text-orange-400' },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg bg-purple-950/20 border border-purple-500/10 px-3 py-2 text-center">
                            <div className="text-[9px] uppercase tracking-wider text-white/25 font-poppins mb-0.5">{s.label}</div>
                            <div className={`text-base font-bold font-poppins ${s.color}`}>{s.value}</div>
                            {s.sub && <div className="text-[9px] text-white/25 font-poppins">{s.sub}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Contract addresses — compact 2-col grid */}
                  <div className="rounded-2xl border border-white/10 bg-[#0a0a14]/90 backdrop-blur-sm px-4 py-3">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {[
                        { label: 'MORBIUS Token', addr: MORBIUS_ADDR },
                        { label: 'MORBIUS Staking', addr: STAKING_ADDR },
                        { label: 'LP Staking', addr: LP_STAKING_ADDR },
                        { label: 'MORBIUS/WPLS PLP', addr: PLP_ADDR },
                      ].map(({ label, addr }) => (
                        <a key={addr} href={`https://scan.pulsechain.com/address/${addr}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between gap-1 group min-w-0">
                          <span className="text-[9px] text-white/25 font-poppins shrink-0">{label}</span>
                          <span className="flex items-center gap-0.5 text-[9px] font-mono text-white/40 group-hover:text-white/70 transition-colors truncate">
                            {addr.slice(0, 6)}…{addr.slice(-4)}
                            <ExternalLink className="w-2 h-2 flex-shrink-0" />
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>

                </motion.div>
              )}

              {/* ── MORBIUS PANEL ── */}
              {activeTab === 'morbius' && (
                <motion.div key="morbius" {...fadeUp}>
                  <div className="text-center mb-4">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <Image src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" width={44} height={44} className="rounded-full" />
                      <h1 className="text-3xl font-bold text-cyan-400 font-poppins tracking-tight">MORBIUS Staking</h1>
                    </div>
                    <p className="text-white/40 text-sm font-poppins">Stake MORBIUS · Earn MORBIUS rewards</p>
                    <button onClick={() => setShowInfo(true)} className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-cyan-400/70 hover:text-cyan-300 transition-colors font-poppins font-medium">
                      <FileText className="w-3.5 h-3.5" />How it works
                    </button>
                  </div>

                  {!isConnected ? (
                    <div className={mCard}><p className="text-center text-white/40 text-sm font-poppins py-4">Connect your wallet to get started.</p></div>
                  ) : isWrongChain ? (
                    <div className={`${mCard} space-y-4`}>
                      <p className="text-center text-white/40 text-sm font-poppins">Switch to PulseChain to continue.</p>
                      <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={() => switchChainAsync?.({ chainId: pulsechain.id })} className={mBtnPrimary}>Switch to PulseChain</motion.button>
                    </div>
                  ) : (
                    <motion.div className="space-y-4" variants={staggerContainer} initial="initial" animate="animate">

                      {/* Protocol Stats */}
                      <motion.div variants={staggerChild} className={mCard}>
                        <div className="grid grid-cols-4 gap-3 text-center">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Total Staked</div>
                            <div className="text-base font-bold text-white font-poppins">{fmt(mTotal)}</div>
                            {toUsd(mTotal) != null && <div className="text-[9px] text-cyan-400/50 font-poppins">{fmtUsd(toUsd(mTotal))}</div>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Stakers</div>
                            <div className="text-base font-bold text-white font-poppins">{mStakers.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Reward Pool</div>
                            <div className="text-base font-bold text-cyan-400 font-poppins">{fmt(mPending)}</div>
                            {toUsd(mPending) != null && <div className="text-[9px] text-cyan-400/50 font-poppins">{fmtUsd(toUsd(mPending))}</div>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Total Claimed</div>
                            <div className="text-base font-bold text-white font-poppins">{fmt(mTotalClaimedBal)}</div>
                            {toUsd(mTotalClaimedBal) != null && <div className="text-[9px] text-white/25 font-poppins">{fmtUsd(toUsd(mTotalClaimedBal))}</div>}
                          </div>
                        </div>
                      </motion.div>

                      {/* Your Position */}
                      <motion.div variants={staggerChild} className={mCard}>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins">Your Position</h2>
                          <span className="text-xs text-cyan-400/80 font-poppins font-semibold">{mShare}% share</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className={`${mInner} text-center`}>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Staked</div>
                            <div className="text-xl font-bold text-white font-poppins">{fmt(mStaked)}</div>
                            {toUsd(mStaked) != null && <div className="text-[9px] text-white/30 font-poppins mt-0.5">{fmtUsd(toUsd(mStaked))}</div>}
                          </div>
                          <div className="relative">
                            {mEarnedBal > 0n && (
                              <motion.div
                                className="absolute inset-0 rounded-xl bg-cyan-500/5"
                                animate={{ opacity: [0.3, 0.8, 0.3] }}
                                transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                              />
                            )}
                            <div className={`${mInner} text-center relative`}>
                              <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Claimable</div>
                              <div className="text-xl font-bold text-cyan-400 font-poppins">{fmtDec(mEarnedBal)}</div>
                              {toUsd(mEarnedBal) != null && <div className="text-[9px] text-cyan-400/50 font-poppins mt-0.5">{fmtUsd(toUsd(mEarnedBal))}</div>}
                            </div>
                          </div>
                        </div>
                        {mStaked > 0n && (
                          <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/30 font-poppins">
                            <span>Staking since</span><span className="text-white/50">{formatDate(mStakedAtTs)}</span>
                          </div>
                        )}
                      </motion.div>

                      {/* Stake */}
                      <motion.div variants={staggerChild} className={mCard}>
                        <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins mb-3">Stake</h2>
                        <div className="flex gap-2 mb-1">
                          <input type="number" placeholder="0" value={mStakeInput} onChange={(e) => setMStakeInput(e.target.value)} min="0" step="1" className={mInput} />
                          <button type="button" onClick={() => setMStakeInput(String(mMaxStake))} className={mMaxBtn}>MAX</button>
                        </div>
                        <div className="text-[10px] text-white/25 font-poppins mb-3">Wallet: {mMaxStake.toLocaleString()} MORBIUS</div>
                        <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={handleMStake} disabled={!mStakeInput || mBusy || mAllowanceLoading} className={mBtnPrimary}>
                          {mAction === 'stake' && mBusy ? (
                            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{mNeedsApproval ? 'Approving...' : 'Staking...'}</span>
                          ) : mNeedsApproval && mStakeInput ? 'Approve MORBIUS' : 'Stake'}
                        </motion.button>
                      </motion.div>

                      {/* Unstake */}
                      <motion.div variants={staggerChild} className={mCard}>
                        <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins mb-3">Unstake</h2>
                        <div className="flex gap-2 mb-1">
                          <input type="number" placeholder="0" value={mUnstakeInput} onChange={(e) => setMUnstakeInput(e.target.value)} min="0" step="1" className={mInput} />
                          <button type="button" onClick={() => setMUnstakeInput(String(mMaxUnstake))} className={mMaxBtn}>MAX</button>
                        </div>
                        <div className="text-[10px] text-white/25 font-poppins mb-1">Staked: {mMaxUnstake.toLocaleString()} MORBIUS</div>
                        {mUnstakeInput && Number(mUnstakeInput) > 0 ? (
                          <div className="text-[10px] text-white/40 font-poppins mb-3 space-y-0.5">
                            <div>5% fee: {Math.floor(Number(mUnstakeInput) * 0.025).toLocaleString()} to stakers · {Math.floor(Number(mUnstakeInput) * 0.025).toLocaleString()} to LP stakers</div>
                            <div className="text-cyan-400/70">You receive: {Math.floor(Number(mUnstakeInput) * 0.95).toLocaleString()} MORBIUS</div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-white/25 font-poppins mb-3">5% unstake fee · 2.5% to stakers · 2.5% to LP stakers</div>
                        )}
                        <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={handleMUnstake} disabled={!mUnstakeInput || mBusy || mStaked <= 0n} className={mBtnSecondary}>
                          {mAction === 'unstake' && mBusy ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Unstaking...</span> : 'Unstake'}
                        </motion.button>
                      </motion.div>

                      {/* Claim Rewards */}
                      <motion.div variants={staggerChild} className={mCard}>
                        <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins mb-3">Claim Rewards</h2>
                        <div className={`${mInner} flex items-center justify-between mb-3`}>
                          <span className="text-white/40 text-sm font-poppins">Claimable</span>
                          <div className="text-right">
                            <div className="text-xl font-bold text-cyan-400 font-poppins">{fmtDec(mEarnedBal)} MORBIUS</div>
                            {toUsd(mEarnedBal) != null && <div className="text-[10px] text-cyan-400/50 font-poppins">{fmtUsd(toUsd(mEarnedBal))}</div>}
                          </div>
                        </div>
                        <div className="text-[10px] text-white/25 font-poppins mb-3">If claimable shows 0 but rewards were deposited, refresh the pool first.</div>
                        <div className="flex gap-2">
                          <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={handleMRefresh} disabled={mBusy} className={mBtnSecondary}>
                            {mAction === 'refresh' && mBusy ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Updating...</span> : 'Refresh Pool'}
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={handleMClaim} disabled={mEarnedBal <= 0n || mBusy} className={mBtnPrimary}>
                            {mAction === 'claim' && mBusy ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Claiming...</span> : 'Claim'}
                          </motion.button>
                        </div>
                      </motion.div>

                      {/* History */}
                      <motion.div variants={staggerChild} className={mCard}>
                        <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins mb-3">History</h2>
                        {mHistoryLoading ? (
                          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-cyan-500/40" /></div>
                        ) : mHistory.length === 0 ? (
                          <p className="text-center text-white/25 text-sm font-poppins py-4">No activity yet.</p>
                        ) : (
                          <div className="overflow-x-auto -mx-5 px-5">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-cyan-500/10 hover:bg-transparent">
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8">Type</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8">Date</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8 text-right">Amount</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8 text-right">Fee</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8">Tx</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {mHistory.map((entry) => (
                                  <TableRow key={entry.id} className="border-cyan-500/10 hover:bg-cyan-950/20">
                                    <TableCell className="py-2">
                                      <span className={`text-xs font-semibold font-poppins whitespace-nowrap ${entry.action === 'Stake' ? 'text-green-400' : entry.action === 'Unstake' ? 'text-orange-400' : 'text-cyan-400'}`}>{entry.action}</span>
                                    </TableCell>
                                    <TableCell className="py-2 text-[11px] text-white/50 font-poppins whitespace-nowrap">
                                      {new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                                      <span className="text-white/30">{new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                                    </TableCell>
                                    <TableCell className="py-2 text-right text-xs text-white/70 font-poppins whitespace-nowrap">{fmt(entry.amount)}</TableCell>
                                    <TableCell className="py-2 text-right text-xs text-white/40 font-poppins whitespace-nowrap">{entry.fee > 0n ? fmt(entry.fee) : '—'}</TableCell>
                                    <TableCell className="py-2">
                                      <a href={`https://scan.pulsechain.com/tx/${entry.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-400/60 hover:text-cyan-300 transition-colors text-[10px] font-mono">
                                        {entry.txHash.slice(0, 8)}…<ExternalLink className="w-3 h-3 flex-shrink-0" />
                                      </a>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </motion.div>

                      <p className="text-center text-white/20 text-[10px] font-poppins pt-1">Rewards accrue from protocol fees. Stake to earn. Unstake anytime.</p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* ── LP PANEL ── */}
              {activeTab === 'lp' && (
                <motion.div key="lp" {...fadeUp}>
                  <div className="text-center mb-4">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <Image src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" width={44} height={44} className="rounded-full" />
                      <h1 className="text-3xl font-bold text-purple-400 font-poppins tracking-tight">LP Staking</h1>
                    </div>
                    <p className="text-white/40 text-sm font-poppins">Stake Morbius/WPLS LP · Earn MORBIUS rewards</p>
                    <button onClick={() => setShowInfo(true)} className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-purple-400/70 hover:text-purple-300 transition-colors font-poppins font-medium">
                      <FileText className="w-3.5 h-3.5" />How it works
                    </button>
                  </div>

                  {/* Provide Liquidity Banner */}
                  <a href={PULSEX_ADD_LIQUIDITY_URL} target="_blank" rel="noopener noreferrer"
                    className="group relative flex items-center justify-between rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/60 to-indigo-950/60 p-4 mb-4 overflow-hidden hover:border-purple-400/50 transition-colors">
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/8 to-transparent pointer-events-none"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ repeat: Infinity, duration: 3.5, ease: 'linear' }}
                    />
                    <div className="relative flex items-center gap-3">
                      <Droplets className="w-5 h-5 text-purple-400" />
                      <div>
                        <div className="text-sm font-semibold text-white font-poppins">Provide Liquidity on PulseX</div>
                        <div className="text-[10px] text-purple-300/70 font-poppins">Add MORBIUS + WPLS · Get PLP tokens · Stake here for rewards</div>
                      </div>
                    </div>
                    <ArrowUpRight className="relative w-5 h-5 text-purple-400 group-hover:text-purple-300 transition-colors flex-shrink-0" />
                  </a>

                  {/* LP Guide (collapsible) */}
                  <div className="rounded-2xl border border-purple-500/15 bg-[#0d0a1a]/80 mb-4 overflow-hidden">
                    <button onClick={() => setShowLpGuide(!showLpGuide)} className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-purple-950/20 transition-colors">
                      <span className="text-xs font-semibold text-purple-300/80 font-poppins uppercase tracking-wider">How to get PLP &amp; stake</span>
                      {showLpGuide ? <ChevronUp className="w-4 h-4 text-purple-400/60" /> : <ChevronDown className="w-4 h-4 text-purple-400/60" />}
                    </button>
                    <AnimatePresence>
                      {showLpGuide && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 space-y-3 border-t border-purple-500/10">
                            {lpGuideSteps.map((step) => (
                              <div key={step.n} className="flex gap-3 pt-3">
                                <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-[10px] font-bold text-purple-300 font-poppins">{step.n}</span>
                                </div>
                                <div>
                                  <div className="text-xs font-semibold text-white font-poppins mb-0.5">{step.title}</div>
                                  <div className="text-[11px] text-white/50 font-poppins leading-relaxed">{step.desc}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {!isConnected ? (
                    <div className={lpCard}><p className="text-center text-white/40 text-sm font-poppins py-4">Connect your wallet to get started.</p></div>
                  ) : isWrongChain ? (
                    <div className={`${lpCard} space-y-4`}>
                      <p className="text-center text-white/40 text-sm font-poppins">Switch to PulseChain to continue.</p>
                      <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={() => switchChainAsync?.({ chainId: pulsechain.id })} className={lpBtnPrimary}>Switch to PulseChain</motion.button>
                    </div>
                  ) : (
                    <motion.div className="space-y-4" variants={staggerContainer} initial="initial" animate="animate">

                      {/* Protocol Stats */}
                      <motion.div variants={staggerChild} className={lpCard}>
                        <div className="grid grid-cols-4 gap-3 text-center">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Total LP Staked</div>
                            <div className="text-base font-bold text-white font-poppins">{fmtLP(lpTotal)}</div>
                            <div className="text-[9px] text-white/20 font-poppins">PLP</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Stakers</div>
                            <div className="text-base font-bold text-white font-poppins">{lpStakers.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">MORBIUS Pool</div>
                            <div className="text-base font-bold text-purple-400 font-poppins">{fmt(lpPending)}</div>
                            {toUsd(lpPending) != null && <div className="text-[9px] text-purple-400/50 font-poppins">{fmtUsd(toUsd(lpPending))}</div>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1 flex items-center justify-center gap-0.5">
                              <Flame className="w-3 h-3 text-orange-400" />LP Burned
                            </div>
                            <div className="text-base font-bold text-orange-400 font-poppins">{fmtLP(lpBurned)}</div>
                            <div className="text-[9px] text-white/20 font-poppins">PLP</div>
                          </div>
                        </div>
                      </motion.div>

                      {/* Your Position */}
                      <motion.div variants={staggerChild} className={lpCard}>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins">Your Position</h2>
                          <span className="text-xs text-purple-400/80 font-poppins font-semibold">{lpShare}% share</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className={`${lpInner} text-center`}>
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">LP Staked</div>
                            <div className="text-xl font-bold text-white font-poppins">{fmtLP(lpStaked)}</div>
                            <div className="text-[9px] text-white/20 font-poppins mt-0.5">PLP</div>
                          </div>
                          <div className="relative">
                            {lpEarnedBal > 0n && (
                              <motion.div
                                className="absolute inset-0 rounded-xl bg-purple-500/5"
                                animate={{ opacity: [0.3, 0.8, 0.3] }}
                                transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                              />
                            )}
                            <div className={`${lpInner} text-center relative`}>
                              <div className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Claimable</div>
                              <div className="text-xl font-bold text-purple-400 font-poppins">{fmtDec(lpEarnedBal)}</div>
                              {toUsd(lpEarnedBal) != null && <div className="text-[9px] text-purple-400/50 font-poppins mt-0.5">{fmtUsd(toUsd(lpEarnedBal))}</div>}
                            </div>
                          </div>
                        </div>
                        {lpStaked > 0n && (
                          <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/30 font-poppins">
                            <span>Staking since</span><span className="text-white/50">{formatDate(lpStakedAtTs)}</span>
                          </div>
                        )}
                      </motion.div>

                      {/* Stake LP */}
                      <motion.div variants={staggerChild} className={lpCard}>
                        <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins mb-3">Stake LP</h2>
                        <div className="flex gap-2 mb-1">
                          <input type="number" placeholder="0.000000" value={lpStakeInput} onChange={(e) => setLpStakeInput(e.target.value)} min="0" step="any" className={lpInput} />
                          <button type="button" onClick={() => setLpStakeInput(formatEther(plpWalletBal))} className={lpMaxBtn}>MAX</button>
                        </div>
                        <div className="text-[10px] text-white/25 font-poppins mb-3">Wallet: {fmtLP(plpWalletBal)} PLP</div>
                        <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={handleLPStake} disabled={!lpStakeInput || lpBusy || lpAllowanceLoading} className={lpBtnPrimary}>
                          {lpAction === 'stake' && lpBusy ? (
                            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{lpNeedsApproval ? 'Approving...' : 'Staking...'}</span>
                          ) : lpNeedsApproval && lpStakeInput ? 'Approve PLP' : 'Stake LP'}
                        </motion.button>
                      </motion.div>

                      {/* Unstake LP */}
                      <motion.div variants={staggerChild} className={lpCard}>
                        <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins mb-3">Unstake LP</h2>
                        <div className="flex gap-2 mb-1">
                          <input type="number" placeholder="0.000000" value={lpUnstakeInput} onChange={(e) => setLpUnstakeInput(e.target.value)} min="0" step="any" className={lpInput} />
                          <button type="button" onClick={() => setLpUnstakeInput(formatEther(lpStaked))} className={lpMaxBtn}>MAX</button>
                        </div>
                        <div className="text-[10px] text-white/25 font-poppins mb-1">Staked: {fmtLP(lpStaked)} PLP</div>
                        {lpUnstakeInput && Number(lpUnstakeInput) > 0 ? (
                          <div className="text-[10px] text-white/40 font-poppins mb-3 space-y-0.5">
                            <div className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" /><span>5% burned permanently ({(Number(lpUnstakeInput) * 0.05).toPrecision(4)} PLP)</span></div>
                            <div className="text-purple-400/70">You receive: {(Number(lpUnstakeInput) * 0.95).toPrecision(6)} PLP</div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-white/25 font-poppins mb-3">5% unstake fee · LP tokens permanently burned</div>
                        )}
                        <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={handleLPUnstake} disabled={!lpUnstakeInput || lpBusy || lpStaked <= 0n} className={lpBtnSecondary}>
                          {lpAction === 'unstake' && lpBusy ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Unstaking...</span> : 'Unstake LP'}
                        </motion.button>
                      </motion.div>

                      {/* Claim Rewards */}
                      <motion.div variants={staggerChild} className={lpCard}>
                        <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins mb-3">Claim Rewards</h2>
                        <div className={`${lpInner} flex items-center justify-between mb-3`}>
                          <span className="text-white/40 text-sm font-poppins">Claimable</span>
                          <div className="text-right">
                            <div className="text-xl font-bold text-purple-400 font-poppins">{fmtDec(lpEarnedBal)} MORBIUS</div>
                            {toUsd(lpEarnedBal) != null && <div className="text-[10px] text-purple-400/50 font-poppins">{fmtUsd(toUsd(lpEarnedBal))}</div>}
                          </div>
                        </div>
                        <div className="text-[10px] text-white/25 font-poppins mb-3">If claimable shows 0 but rewards were deposited, refresh the pool first.</div>
                        <div className="flex gap-2">
                          <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={handleLPRefresh} disabled={lpBusy} className={lpBtnSecondary}>
                            {lpAction === 'refresh' && lpBusy ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Updating...</span> : 'Refresh Pool'}
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={handleLPClaim} disabled={lpEarnedBal <= 0n || lpBusy} className={lpBtnPrimary}>
                            {lpAction === 'claim' && lpBusy ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Claiming...</span> : 'Claim'}
                          </motion.button>
                        </div>
                      </motion.div>

                      {/* History */}
                      <motion.div variants={staggerChild} className={lpCard}>
                        <h2 className="text-xs uppercase tracking-wider text-white/30 font-poppins mb-3">History</h2>
                        {lpHistoryLoading ? (
                          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-purple-500/40" /></div>
                        ) : lpHistory.length === 0 ? (
                          <p className="text-center text-white/25 text-sm font-poppins py-4">No activity yet.</p>
                        ) : (
                          <div className="overflow-x-auto -mx-5 px-5">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-purple-500/10 hover:bg-transparent">
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8">Type</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8">Date</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8 text-right">Amount</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8 text-right">Burned</TableHead>
                                  <TableHead className="text-[10px] uppercase tracking-wider text-white/30 font-poppins font-semibold h-8">Tx</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lpHistory.map((entry) => (
                                  <TableRow key={entry.id} className="border-purple-500/10 hover:bg-purple-950/20">
                                    <TableCell className="py-2">
                                      <span className={`text-xs font-semibold font-poppins whitespace-nowrap ${entry.action === 'Stake' ? 'text-green-400' : entry.action === 'Unstake' ? 'text-orange-400' : 'text-purple-400'}`}>{entry.action}</span>
                                    </TableCell>
                                    <TableCell className="py-2 text-[11px] text-white/50 font-poppins whitespace-nowrap">
                                      {new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                                      <span className="text-white/30">{new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                                    </TableCell>
                                    <TableCell className="py-2 text-right text-xs text-white/70 font-poppins whitespace-nowrap">{fmtLP(entry.amount)}</TableCell>
                                    <TableCell className="py-2 text-right font-poppins whitespace-nowrap">
                                      {entry.burned > 0n ? (
                                        <span className="flex items-center justify-end gap-1 text-xs text-orange-400/70"><Flame className="w-3 h-3" />{fmtLP(entry.burned)}</span>
                                      ) : (
                                        <span className="text-xs text-white/25">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="py-2">
                                      <a href={`https://scan.pulsechain.com/tx/${entry.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-purple-400/60 hover:text-purple-300 transition-colors text-[10px] font-mono">
                                        {entry.txHash.slice(0, 8)}…<ExternalLink className="w-3 h-3 flex-shrink-0" />
                                      </a>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </motion.div>

                      <p className="text-center text-white/20 text-[10px] font-poppins pt-1">Provide liquidity on PulseX V1 · Stake LP tokens · Earn MORBIUS</p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* ── HOLDER REWARDS (CLAIMS) PANEL ── */}
              {activeTab === 'claims' && (
                <motion.div key="claims" {...fadeUp}>
                  <MerkleClaimsPanel />
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>

      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} tab={activeTab} />
    </GlobalMainNav>
  )
}
