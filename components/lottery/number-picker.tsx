'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Shuffle, X, Plus, ChevronDown, ChevronUp, Flame, Minus } from 'lucide-react'
import { MIN_NUMBER, MAX_NUMBER, NUMBERS_PER_TICKET } from '@/lib/contracts'

interface NumberPickerProps {
  onTicketsChange: (tickets: number[][]) => void
  onTicketQuantitiesChange?: (quantities: Record<number, number>) => void
  maxTickets?: number
  showHeatmap?: boolean
  onToggleHeatmap?: () => void
  getHeatLevel?: (num: number) => number
  isLoadingHeatmap?: boolean
  hotNumbers?: number[]
  coldNumbers?: number[]
  onPlayTickets?: () => void // Callback when "Play Tickets" is clicked
  roundsToPlay: number
  onRoundsChange: (rounds: number) => void
}

export function NumberPicker({ 
  onTicketsChange,
  onTicketQuantitiesChange,
  maxTickets = 10,
  showHeatmap = false,
  onToggleHeatmap,
  getHeatLevel,
  isLoadingHeatmap = false,
  hotNumbers = [],
  coldNumbers = [],
  onPlayTickets,
  roundsToPlay,
  onRoundsChange,
}: NumberPickerProps) {
  const [tickets, setTickets] = useState<number[][]>([[]])
  const [currentTicketIndex, setCurrentTicketIndex] = useState(0)
  const [ticketQuantities, setTicketQuantities] = useState<Record<number, number>>({ 0: 1 })
  const [isGridExpanded, setIsGridExpanded] = useState(false)

  const currentTicket = tickets[currentTicketIndex] || []

  // Initialize quantity for current ticket if it doesn't exist
  useEffect(() => {
    if (!ticketQuantities[currentTicketIndex]) {
      setTicketQuantities(prev => ({ ...prev, [currentTicketIndex]: 1 }))
    }
  }, [currentTicketIndex, ticketQuantities])

  // Create stable string keys for dependency tracking
  const ticketsKey = useMemo(() => JSON.stringify(tickets), [tickets])
  const quantitiesKey = useMemo(() => JSON.stringify(ticketQuantities), [ticketQuantities])

  // Track previous values to detect actual changes
  const prevTicketsRef = useRef<string>('')
  const prevQuantitiesRef = useRef<string>('')

  // Notify parent with expanded tickets whenever tickets or quantities change
  useEffect(() => {
    // Only notify if tickets or quantities actually changed
    if (ticketsKey !== prevTicketsRef.current || quantitiesKey !== prevQuantitiesRef.current) {
      prevTicketsRef.current = ticketsKey
      prevQuantitiesRef.current = quantitiesKey
      
      const expandedTickets: number[][] = []
      tickets.forEach((ticket, index) => {
        if (ticket.length === NUMBERS_PER_TICKET) {
          expandedTickets.push([...ticket])
        }
      })
      onTicketsChange(expandedTickets)
      // Also notify parent of quantities
      if (onTicketQuantitiesChange) {
        // Force all quantities to 1 since per-ticket quantity is removed
        const oneEach: Record<number, number> = {}
        expandedTickets.forEach((_, idx) => {
          oneEach[idx] = 1
        })
        onTicketQuantitiesChange(oneEach)
      }
    }
  }, [ticketsKey, quantitiesKey, tickets, ticketQuantities, onTicketsChange, onTicketQuantitiesChange])

  const handleNumberClick = (num: number) => {
    if (currentTicket.includes(num)) {
      // Remove number
      const newTicket = currentTicket.filter(n => n !== num)
      updateCurrentTicket(newTicket)
    } else if (currentTicket.length < NUMBERS_PER_TICKET) {
      // Add number
      const newTicket = [...currentTicket, num].sort((a, b) => a - b)
      updateCurrentTicket(newTicket)
    }
  }

  const updateCurrentTicket = (newTicket: number[]) => {
    const newTickets = [...tickets]
    newTickets[currentTicketIndex] = newTicket
    setTickets(newTickets)

    // Initialize quantity for this ticket if it doesn't exist
    if (!ticketQuantities[currentTicketIndex]) {
      setTicketQuantities(prev => ({ ...prev, [currentTicketIndex]: 1 }))
    }
    // Note: Parent notification happens via useEffect when tickets/quantities change
  }

  // Calculate total tickets (no quantities)
  const getTotalTickets = (ticketList: number[][] = tickets) => {
    return ticketList.filter(t => t.length === NUMBERS_PER_TICKET).length
  }

  const handleQuickPick = () => {
    const numbers: number[] = []
    while (numbers.length < NUMBERS_PER_TICKET) {
      const num = Math.floor(Math.random() * MAX_NUMBER) + MIN_NUMBER
      if (!numbers.includes(num)) {
        numbers.push(num)
      }
    }
    updateCurrentTicket(numbers.sort((a, b) => a - b))
  }

  const handleClear = () => {
    updateCurrentTicket([])
    setTicketQuantities(prev => ({ ...prev, [currentTicketIndex]: 1 }))
  }

  const handleAddTicket = () => {
    const total = getTotalTickets()
    if (total < maxTickets && currentTicket.length === NUMBERS_PER_TICKET) {
      const newTicketIndex = tickets.length
      setTickets([...tickets, []])
      setCurrentTicketIndex(newTicketIndex)
      setTicketQuantities(prev => ({ ...prev, [newTicketIndex]: 1 })) // Initialize quantity for new ticket
    }
  }

  const handleRemoveTicket = (index: number) => {
    const newTickets = tickets.filter((_, i) => i !== index)
    const newQuantities = { ...ticketQuantities }
    delete newQuantities[index]
    // Reindex quantities for tickets after the removed one
    const reindexedQuantities: Record<number, number> = {}
    newTickets.forEach((_, i) => {
      const oldIndex = i < index ? i : i + 1
      if (ticketQuantities[oldIndex] !== undefined) {
        reindexedQuantities[i] = ticketQuantities[oldIndex] ?? 1
      }
    })
    
    if (newTickets.length === 0) {
      setTickets([[]])
      setCurrentTicketIndex(0)
      setTicketQuantities({ 0: 1 })
      // Note: Parent notification happens via useEffect when tickets/quantities change
    } else {
      setTickets(newTickets)
      setTicketQuantities(reindexedQuantities)
      if (currentTicketIndex >= newTickets.length) {
        setCurrentTicketIndex(newTickets.length - 1)
      }
      // Note: Parent notification happens via useEffect when tickets/quantities change
    }
  }

  const isNumberSelected = (num: number) => currentTicket.includes(num)
  const totalTickets = getTotalTickets()
  const canAddTicket = currentTicket.length === NUMBERS_PER_TICKET && totalTickets < maxTickets

  // Get heat map color style based on heat level with opacity scaling
  const getHeatColorStyle = (num: number): CSSProperties => {
    if (!showHeatmap || !getHeatLevel) return {}
    
    const isHot = hotNumbers.includes(num)
    const isCold = coldNumbers.includes(num)
    
    // Only show color if number is hot or cold
    if (!isHot && !isCold) return {}
    
    if (isHot) {
      // Hot numbers: red-500/10 through red-500/90 based on frequency
      // More frequent = more opaque
      const heatLevel = getHeatLevel(num)
      // Map heat level (0-1) to opacity (0.1-0.9)
      const opacity = Math.max(0.1, Math.min(0.9, 0.1 + (heatLevel * 0.8)))
      return { backgroundColor: `rgba(239, 68, 68, ${opacity})` } // red-500
    } else if (isCold) {
      // Cold numbers: blue-500/10 through blue-500/90 based on frequency
      // Less frequent = more opaque (coldest numbers are most visible)
      const heatLevel = getHeatLevel(num)
      // For cold, lower heat level = higher opacity
      // Invert: (1 - heatLevel) maps to opacity
      const opacity = Math.max(0.1, Math.min(0.9, 0.1 + ((1 - heatLevel) * 0.8)))
      return { backgroundColor: `rgba(59, 130, 246, ${opacity})` } // blue-500
    }
    
    return {}
  }

  return (
    <div className="space-y-6">
      {/* Ticket Tabs */}
      {tickets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tickets.map((ticket, index) => (
            <div key={index} className="relative">
              <Button
                variant={currentTicketIndex === index ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentTicketIndex(index)}
                className={`pr-8 ${currentTicketIndex === index ? 'border-2 border-orange-500/40' : ''}`}
              >
                Ticket {index + 1}
                {ticket.length === NUMBERS_PER_TICKET && (
                  <span className="ml-2 text-xs opacity-75">✓</span>
                )}
              </Button>
              {tickets.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                  onClick={() => handleRemoveTicket(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected Numbers Display */}
      <Card className="p-4 bg-card/50 border-primary/20 relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Selected Numbers ({currentTicket.length}/{NUMBERS_PER_TICKET})
          </h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleQuickPick}
              className="text-xs"
            >
              <Shuffle className="h-3 w-3 mr-1" />
              Quick Pick
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={currentTicket.length === 0}
              className="text-xs"
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 min-h-[60px] items-center justify-center">
          {currentTicket.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pick {NUMBERS_PER_TICKET} numbers or use Quick Pick</p>
          ) : (
            currentTicket.map((num) => (
              <div
                key={num}
                className="flex items-center justify-center w-12 h-12 rounded-lg bg-black border border-green-500/75 text-green-500/75 font-bold text-lg shadow-lg cursor-pointer hover:scale-110 transition-transform"
                onClick={() => handleNumberClick(num)}
              >
                {num}
              </div>
            ))
          )}
        </div>

        {/* Play Tickets Button - Moved outside container */}
        {currentTicket.length === NUMBERS_PER_TICKET && onPlayTickets && (
          <div className="flex justify-center pt-4 pb-2">
            <Button
              onClick={onPlayTickets}
              disabled={!tickets.some(t => t.length === NUMBERS_PER_TICKET)}
              className={`w-48 ${
                tickets.some(t => t.length === NUMBERS_PER_TICKET)
                  ? 'bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 text-white font-bold shadow-lg hover:opacity-90 transition-all'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Play Tickets
            </Button>
          </div>
        )}

        {currentTicket.length === NUMBERS_PER_TICKET && (
          <div className="mt-4 space-y-3 w-full">
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg w-full">
              <div className="text-center mb-4">
                <p className="text-sm font-semibold text-primary mb-1">
                  ✓ Ticket Complete!
                </p>
                <p className="text-xs text-muted-foreground">Set how many rounds to play</p>
              </div>

              {/* Rounds Selector */}
              <div className="space-y-3 w-full">
                <div className="flex flex-col items-center gap-2 w-full">
                  <label className="text-sm font-medium text-white">Rounds</label>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const next = Math.max(1, roundsToPlay - 1)
                        onRoundsChange(next)
                      }}
                      disabled={roundsToPlay <= 1}
                      className="h-10 w-10"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="w-16 text-center">
                      <div className="text-2xl font-bold text-white">
                        {roundsToPlay}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        round{roundsToPlay !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const next = Math.min(60, roundsToPlay + 1)
                        onRoundsChange(next)
                      }}
                      disabled={roundsToPlay >= 60}
                      className="h-10 w-10"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Add New Ticket Button */}
                {canAddTicket && (
                  <Button
                    onClick={handleAddTicket}
                    variant="outline"
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Ticket with Different Numbers
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Number Grid Toggle Button */}
      <div className="flex justify-center">
        <button
          onClick={() => setIsGridExpanded(!isGridExpanded)}
          className="flex items-center justify-center hover:bg-white/5 rounded-lg p-2 transition-colors"
        >
          {isGridExpanded ? (
            <ChevronUp className="h-5 w-5 text-white/80 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
          ) : (
            <ChevronDown className="h-5 w-5 text-white/80 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
          )}
        </button>
      </div>

      {/* Number Grid */}
      {isGridExpanded && (
        <div className="space-y-2">
          {/* Heat Map Toggle - Top Right */}
          {onToggleHeatmap && (
            <div className="flex justify-end">
              <Button
                variant={showHeatmap ? "default" : "outline"}
                size="sm"
                onClick={onToggleHeatmap}
                title="Toggle heat map overlay"
              >
                <Flame className={`w-4 h-4 ${showHeatmap ? 'text-orange-500' : ''}`} />
              </Button>
            </div>
          )}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-11 gap-2">
        {Array.from({ length: MAX_NUMBER }, (_, i) => i + MIN_NUMBER).map((num) => {
          const selected = isNumberSelected(num)
            const heatColorStyle = showHeatmap ? getHeatColorStyle(num) : {}
            const hasHeatColor = Object.keys(heatColorStyle).length > 0
          return (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              disabled={!selected && currentTicket.length >= NUMBERS_PER_TICKET}
                style={!selected && hasHeatColor ? heatColorStyle : undefined}
              className={`
                  aspect-square rounded-lg font-semibold text-sm relative
                transition-all duration-200
                ${selected
                    ? 'bg-green-600/40 text-white scale-95 shadow-lg ring-2 ring-green-600/40 ring-offset-2'
                    : hasHeatColor 
                      ? 'hover:scale-105 border border-border' 
                  : 'bg-card hover:bg-accent hover:scale-105 border border-border'
                }
                ${!selected && currentTicket.length >= NUMBERS_PER_TICKET
                  ? 'opacity-40 cursor-not-allowed'
                  : 'cursor-pointer'
                }
                disabled:hover:scale-100
              `}
            >
              {num}
            </button>
          )
        })}
      </div>
        </div>
      )}

      {/* Heat Map Explainer */}
      {showHeatmap && (
        <div className="mt-4 p-4 bg-black/40 border border-white/10 rounded-lg space-y-3">
          <div className="text-xs text-white/80 text-center">
            <p className="mb-2">
              Heat map shows number frequency from the last 25 rounds. 
              <span className="text-red-400"> Red</span> = frequently drawn (hot), 
              <span className="text-blue-400"> Blue</span> = rarely drawn (cold). 
              Opacity indicates frequency intensity.
            </p>
          </div>
          {isLoadingHeatmap ? (
            <p className="text-xs text-center text-white/60">Loading heat map data...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {hotNumbers && hotNumbers.length > 0 ? (
                <div>
                  <p className="text-red-400 font-semibold mb-1">Hot Numbers:</p>
                  <p className="text-white/70">{hotNumbers.join(', ')}</p>
                </div>
              ) : (
                <div>
                  <p className="text-red-400 font-semibold mb-1">Hot Numbers:</p>
                  <p className="text-white/50">No data available yet</p>
                </div>
              )}
              {coldNumbers && coldNumbers.length > 0 ? (
                <div>
                  <p className="text-blue-400 font-semibold mb-1">Cold Numbers:</p>
                  <p className="text-white/70">{coldNumbers.join(', ')}</p>
                </div>
              ) : (
                <div>
                  <p className="text-blue-400 font-semibold mb-1">Cold Numbers:</p>
                  <p className="text-white/50">No data available yet</p>
                </div>
              )}
            </div>
          )}
      </div>
      )}
    </div>
  )
}
