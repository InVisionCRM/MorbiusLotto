"use client"

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Trophy, TrendingUp, Clock, Users, DollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatUnits } from 'viem'

interface PulseProgressiveProps {
  currentPool: bigint
  baseSeed: bigint
  totalCollected: bigint
  totalPaid: bigint
  winCount: bigint
  lastWinRound: bigint
  isLoading?: boolean
  compact?: boolean
}

export function PulseProgressive({
  currentPool,
  baseSeed,
  totalCollected,
  totalPaid,
  winCount,
  lastWinRound,
  isLoading = false,
  compact = false
}: PulseProgressiveProps) {
  const [displayAmount, setDisplayAmount] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  // Format numbers with commas
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Animate the jackpot counter
  useEffect(() => {
    if (isLoading) return

    const targetAmount = Number(formatUnits(currentPool, 18))
    const duration = 2000 // 2 seconds
    const steps = 60
    const increment = targetAmount / steps
    let currentStep = 0

    const timer = setInterval(() => {
      currentStep++
      if (currentStep <= steps) {
        setDisplayAmount(increment * currentStep)
      } else {
        setDisplayAmount(targetAmount)
        clearInterval(timer)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [currentPool, isLoading])

  // Pulse animation trigger
  useEffect(() => {
    if (!isLoading && displayAmount > 0) {
      setIsAnimating(true)
      const timer = setTimeout(() => setIsAnimating(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [displayAmount, isLoading])

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900 p-4 shadow-2xl border border-purple-500/30"
      >
        {/* Animated background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(0,0,0,0))]" />

        {/* Content */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Zap className="h-8 w-8 text-yellow-400 animate-pulse" />
              <motion.div
                className="absolute inset-0 bg-yellow-400/20 rounded-full blur-xl"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </div>
            <div>
              <p className="text-xs font-bold text-purple-300 uppercase tracking-wide">Pulse Progressive</p>
              <motion.p
                className="text-2xl font-bold text-white tabular-nums"
                animate={isAnimating ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {formatNumber(displayAmount)} <span className="text-lg text-purple-300">PLS</span>
              </motion.p>
            </div>
          </div>
          <Badge className="bg-yellow-500 text-black hover:bg-yellow-400 font-bold px-3 py-1">
            <Trophy className="h-3 w-3 mr-1" />
            WIN NOW
          </Badge>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden"
    >
      <Card className="overflow-hidden border-2 border-purple-500/30 bg-gradient-to-br from-purple-950 via-indigo-950 to-purple-950 shadow-2xl">
        {/* Animated background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.2),rgba(0,0,0,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(139,92,246,0.15),rgba(0,0,0,0))]" />

        {/* Animated pulse rings */}
        <motion.div
          className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{ transform: 'translate(-50%, -50%)' }}
        />

        <CardContent className="relative z-10 p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="absolute inset-0 bg-yellow-400/20 rounded-full blur-xl animate-pulse" />
                <Zap className="relative h-10 w-10 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Pulse Progressive</h2>
                <p className="text-sm text-purple-300">Win 9+ on 9-Spot or 10-Spot Games</p>
              </div>
            </div>
            <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black hover:from-yellow-400 hover:to-orange-400 font-bold px-4 py-2 text-sm">
              <Trophy className="h-4 w-4 mr-1" />
              ACTIVE
            </Badge>
          </div>

          {/* Main Jackpot Display */}
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-purple-600/20 rounded-2xl blur-xl" />
            <div className="relative bg-black/40 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30">
              <p className="text-center text-sm font-bold text-purple-300 uppercase tracking-wider mb-2">
                Current Jackpot
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={displayAmount}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="text-center"
                >
                  <motion.p
                    className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-400 tabular-nums"
                    animate={isAnimating ? {
                      scale: [1, 1.05, 1],
                      textShadow: [
                        "0 0 20px rgba(251, 191, 36, 0.5)",
                        "0 0 40px rgba(251, 191, 36, 0.8)",
                        "0 0 20px rgba(251, 191, 36, 0.5)"
                      ]
                    } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    {formatNumber(displayAmount)}
                  </motion.p>
                  <p className="text-2xl font-bold text-purple-300 mt-2">PLS</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Base Seed"
              value={formatNumber(Number(formatUnits(baseSeed, 18)))}
              subtitle="PLS"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Total Collected"
              value={formatNumber(Number(formatUnits(totalCollected, 18)))}
              subtitle="PLS"
            />
            <StatCard
              icon={<Trophy className="h-5 w-5" />}
              label="Total Paid"
              value={formatNumber(Number(formatUnits(totalPaid, 18)))}
              subtitle="PLS"
            />
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="Winners"
              value={winCount.toString()}
              subtitle="lifetime"
            />
          </div>

          {/* Last Winner Banner */}
          {lastWinRound > BigInt(0) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-purple-300" />
                  <span className="text-sm text-purple-200">Last Winner</span>
                </div>
                <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">
                  Round #{lastWinRound.toString()}
                </Badge>
              </div>
            </motion.div>
          )}

          {/* How to Win */}
          <div className="mt-6 pt-6 border-t border-purple-500/20">
            <h3 className="text-sm font-bold text-purple-200 uppercase tracking-wide mb-3">How to Win</h3>
            <div className="space-y-2 text-sm text-purple-300">
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400 mt-0.5">1.</span>
                <span>Play a 9-Spot or 10-Spot Keno game</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400 mt-0.5">2.</span>
                <span>Add the "Pulse Progressive" option (+0.001 PLS)</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400 mt-0.5">3.</span>
                <span>Match 9 or more numbers to win the jackpot!</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subtitle: string
}

function StatCard({ icon, label, value, subtitle }: StatCardProps) {
  return (
    <div className="bg-black/30 backdrop-blur-sm rounded-lg p-4 border border-purple-500/20 hover:border-purple-500/40 transition-colors">
      <div className="flex items-center space-x-2 mb-2 text-purple-300">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-purple-400">{subtitle}</p>
    </div>
  )
}
