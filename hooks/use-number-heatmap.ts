'use client'

import { useEffect, useState } from 'react'
import { useReadContracts } from 'wagmi'
import { LOTTERY_ADDRESS } from '@/lib/contracts'
import { LOTTERY_6OF55_ABI } from '@/abi/lottery6of55'

interface NumberFrequency {
  [key: number]: number
}

export function useNumberHeatmap(currentRoundId: number, roundsToAnalyze: number = 25) {
  const [numberFrequencies, setNumberFrequencies] = useState<NumberFrequency>({})
  const [isLoading, setIsLoading] = useState(true)

  // Calculate which rounds to fetch
  const roundsToFetch: number[] = []
  if (currentRoundId > 0) {
    const startRound = Math.max(1, Number(currentRoundId) - roundsToAnalyze)
    for (let i = Number(currentRoundId) - 1; i >= startRound; i--) {
      if (i > 0) roundsToFetch.push(i)
    }
  }

  // Fetch multiple rounds using useReadContracts
  const contracts = roundsToFetch.map(roundId => ({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_ABI,
    functionName: 'getRound' as const,
    args: [BigInt(roundId)],
  }))

  const { data: roundsData, isLoading: isLoadingRounds } = useReadContracts({
    contracts: contracts.length > 0 ? contracts : [],
    query: {
      enabled: contracts.length > 0 && (LOTTERY_ADDRESS as string) !== '0x0000000000000000000000000000000000000000',
    },
  })

  useEffect(() => {
    if (isLoadingRounds) {
      setIsLoading(true)
      return
    }

    if (!roundsData || roundsData.length === 0) {
      setIsLoading(false)
      return
    }

    const frequencies: NumberFrequency = {}
    
    // Initialize all numbers from 1 to 55 with 0 frequency
    for (let i = 1; i <= 55; i++) {
      frequencies[i] = 0
    }

    // Count frequencies from winning numbers
    // useReadContracts returns an array where each element has status and result
    roundsData.forEach((roundData: any) => {
      if (roundData?.status === 'success' && roundData?.result) {
        const round = roundData.result
        // getRound returns a Round struct - check if round is finalized (state === 2)
        const roundState = round?.state ?? 0
        const isFinalized = Number(roundState) === 2
        
        if (isFinalized) {
          // getRound returns a Round struct with winningNumbers property
          const winningNumbers = round?.winningNumbers || []
          
          // Count each winning number (only count finalized rounds with valid numbers)
          if (Array.isArray(winningNumbers) && winningNumbers.length === 6) {
            winningNumbers.forEach((num: number | bigint) => {
              const numValue = Number(num)
              if (numValue >= 1 && numValue <= 55 && numValue > 0) {
                frequencies[numValue] = (frequencies[numValue] || 0) + 1
              }
            })
          }
        }
      }
    })

    setNumberFrequencies(frequencies)
    setIsLoading(false)
  }, [roundsData, isLoadingRounds])

  // Calculate min and max frequencies for normalization
  const frequencies = Object.values(numberFrequencies)
  const minFreq = frequencies.length > 0 ? Math.min(...frequencies) : 0
  const maxFreq = frequencies.length > 0 ? Math.max(...frequencies) : 0
  const range = maxFreq - minFreq

  // Get heat level for a number (0 = coldest, 1 = hottest)
  const getHeatLevel = (num: number): number => {
    if (range === 0) return 0.5 // Neutral if all numbers have same frequency
    const freq = numberFrequencies[num] || 0
    return range > 0 ? (freq - minFreq) / range : 0.5
  }

  // Calculate hot and cold numbers (top 33% hot, bottom 33% cold)
  const getHotAndColdNumbers = () => {
    if (range === 0) {
      return { hotNumbers: [], coldNumbers: [] }
    }

    const numbersWithFreq = Object.entries(numberFrequencies).map(([num, freq]) => ({
      num: Number(num),
      freq: freq as number,
    }))
    
    // Sort by frequency (highest first)
    numbersWithFreq.sort((a, b) => b.freq - a.freq)
    
    const total = numbersWithFreq.length
    const hotCount = Math.max(1, Math.ceil(total * 0.33)) // Top 33%, at least 1
    const coldCount = Math.max(1, Math.floor(total * 0.33)) // Bottom 33%, at least 1
    
    // Get hot numbers (top frequencies)
    const hotNumbers = numbersWithFreq
      .slice(0, hotCount)
      .filter(n => n.freq > minFreq) // Only include if actually appeared
      .map(n => n.num)
      .sort((a, b) => a - b)
    
    // Get cold numbers (bottom frequencies)
    const coldNumbers = numbersWithFreq
      .slice(total - coldCount)
      .filter(n => n.freq <= minFreq + (range * 0.1)) // Include numbers at or near minimum
      .map(n => n.num)
      .sort((a, b) => a - b)
    
    return { hotNumbers, coldNumbers }
  }

  const { hotNumbers, coldNumbers } = getHotAndColdNumbers()

  return {
    numberFrequencies,
    isLoading,
    getHeatLevel,
    hotNumbers,
    coldNumbers,
    minFreq,
    maxFreq,
  }
}

