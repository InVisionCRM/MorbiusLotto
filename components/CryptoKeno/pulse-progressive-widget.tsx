"use client"

import { useEffect, useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, TrendingUp } from 'lucide-react'
import { formatUnits } from 'viem'

interface PulseProgressiveWidgetProps {
  currentPool: bigint
  isLoading?: boolean
  onClick?: () => void
}

function PulseProgressiveWidgetComponent({
  currentPool,
  isLoading = false,
  onClick
}: PulseProgressiveWidgetProps) {
  const [displayAmount, setDisplayAmount] = useState(0)
  const [prevPool, setPrevPool] = useState(currentPool)

  // Format numbers with commas
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Animate the counter
  useEffect(() => {
    if (isLoading) return

    const targetAmount = Number(formatUnits(currentPool, 18))
    setDisplayAmount(targetAmount)
  }, [currentPool, isLoading])

  if (isLoading) {
    return (
      <div className="h-12 w-48 bg-purple-900/20 rounded-lg animate-pulse" />
    )
  }

  return (
    <motion.button
      onClick={onClick}
      className="relative group overflow-hidden rounded-lg bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-900 px-4 py-2 shadow-lg hover:shadow-xl transition-all duration-300 border border-purple-500/30 hover:border-purple-400/50 cursor-pointer"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Animated gradient overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        animate={{
          x: ['-100%', '100%'],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "linear"
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex items-center space-x-3">
        {/* Icon */}
        <div className="relative">
          <Zap className="h-5 w-5 text-yellow-400" />
          <motion.div
            className="absolute inset-0 bg-yellow-400/30 rounded-full blur-sm"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </div>

        {/* Text */}
        <div className="flex flex-col items-start">
          <div className="flex items-center space-x-1">
            <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">
              Pulse Progressive
            </span>
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <TrendingUp className="h-3 w-3 text-green-400" />
            </motion.div>
          </div>
          <motion.div
            className="text-lg font-bold text-white tabular-nums"
            animate={{
              textShadow: [
                "0 0 8px rgba(251, 191, 36, 0.3)",
                "0 0 12px rgba(251, 191, 36, 0.5)",
                "0 0 8px rgba(251, 191, 36, 0.3)"
              ]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            {formatNumber(displayAmount)} <span className="text-sm text-purple-300">PLS</span>
          </motion.div>
        </div>
      </div>

      {/* Pulse effect on hover */}
      <motion.div
        className="absolute inset-0 rounded-lg bg-purple-500/0 group-hover:bg-purple-500/10"
        transition={{ duration: 0.3 }}
      />
    </motion.button>
  )
}

export const PulseProgressiveWidget = memo(PulseProgressiveWidgetComponent)
