import { useState, useEffect } from 'react'

export function useCountdown(endTime: bigint) {
  const [timeRemaining, setTimeRemaining] = useState<{
    days: number
    hours: number
    minutes: number
    seconds: number
    total: number
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 })

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = Math.floor(Date.now() / 1000)
      const end = Number(endTime)
      const total = end - now

      if (total <= 0) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 })
        return
      }

      const days = Math.floor(total / (24 * 60 * 60))
      const hours = Math.floor((total % (24 * 60 * 60)) / (60 * 60))
      const minutes = Math.floor((total % (60 * 60)) / 60)
      const seconds = total % 60

      setTimeRemaining({ days, hours, minutes, seconds, total })
    }

    calculateTimeRemaining()
    const interval = setInterval(calculateTimeRemaining, 1000)

    return () => clearInterval(interval)
  }, [endTime])

  return timeRemaining
}
