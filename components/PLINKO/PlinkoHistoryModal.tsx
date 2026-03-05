'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PlinkoDrop, PlinkoPlayerStats } from '@/lib/plinko-types'


interface PlinkoHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  drops: PlinkoDrop[]
  stats: PlinkoPlayerStats | null
  isConnected: boolean
  playerKey: string
  onExport: () => void
  onClear: () => void
}

export function PlinkoHistoryModal({
  open,
  onOpenChange,
  drops,
  stats,
  isConnected,
  playerKey,
  onExport,
  onClear,
}: PlinkoHistoryModalProps) {
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'timestamp' | 'multiplier' | 'wager' | 'winAmount'>('timestamp')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortDrops = (dropsToSort: PlinkoDrop[]) => {
    return [...dropsToSort].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      return sortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
    })
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <i className="fas fa-sort text-white/20 ml-1 text-[10px]"></i>
    return sortDir === 'asc'
      ? <i className="fas fa-sort-up text-cyan-400 ml-1 text-[10px]"></i>
      : <i className="fas fa-sort-down text-cyan-400 ml-1 text-[10px]"></i>
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const copyToClipboard = async (text: string, txHash: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedTxHash(txHash)
      setTimeout(() => setCopiedTxHash(null), 2000) // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  const FormatCurrency = ({ amount }: { amount: number }) => {
    const wholeNumber = Math.round(amount)
    return (
      <div className="flex items-center justify-center gap-1">
        <img
          src="/morbius/MorbiusLogo (3).png"
          alt="Morbius"
          className="w-6 h-6 object-contain"
        />
        <span>{wholeNumber.toLocaleString()}</span>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[90vw] max-h-[80vh] overflow-y-auto text-white" style={{
        background: 'linear-gradient(145deg,rgb(16, 26, 35),rgb(35, 36, 41))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-center text-cyan-400">
            PLINKO HISTORY
          </DialogTitle>
          <div className="text-center text-sm text-white/60">
            {isConnected ? (
              <span>Wallet: {playerKey.slice(0, 6)}...{playerKey.slice(-4)}</span>
            ) : (
              <span>Anonymous Session (Connect wallet to save history permanently)</span>
            )}
          </div>
        </DialogHeader>

        {/* Stats Dashboard */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 my-4 mx-4">
            <StatCard
              label="Total Drops"
              value={stats.totalDrops.toString()}
              color="cyan"
            />
            <StatCard
              label="Net Profit"
              value={<FormatCurrency amount={stats.netProfit} />}
              color={stats.netProfit >= 0 ? 'green' : 'red'}
            />
            <StatCard
              label="Win Rate"
              value={`${stats.winRate.toFixed(1)}%`}
              color="yellow"
            />
            <StatCard
              label="Biggest Win"
              value={<FormatCurrency amount={stats.biggestWin} />}
              color="purple"
            />
          </div>
        )}

        {/* History Table */}
        <div className="overflow-x-auto rounded-md border border-white/10">
          {drops.length === 0 ? (
            <div className="flex items-center justify-center gap-2 text-white/60 p-8">
              No drops yet. Start playing to build your history!
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {/* Group drops by transaction hash */}
              {Object.entries(
                drops.reduce((groups: { [key: string]: PlinkoDrop[] }, drop) => {
                  const txHash = drop.transactionHash || 'no-tx'
                  if (!groups[txHash]) groups[txHash] = []
                  groups[txHash].push(drop)
                  return groups
                }, {})
              ).map(([txHash, txDrops]) => {
                // Calculate transaction summary
                const totalWager = txDrops.reduce((sum, drop) => sum + drop.wager, 0)
                const totalWin = txDrops.reduce((sum, drop) => sum + drop.winAmount, 0)
                const netProfit = totalWin - totalWager
                const profitPercentage = totalWager > 0 ? (netProfit / totalWager) * 100 : 0
                const avgMultiplier = txDrops.reduce((sum, drop) => sum + drop.multiplier, 0) / txDrops.length
                const riskLevels = [...new Set(txDrops.map(drop => drop.riskLevel))]
                const firstDrop = txDrops[0]
                const lastDrop = txDrops[txDrops.length - 1]

                return (
                  <AccordionItem
                    key={txHash}
                    value={txHash}
                    className="border-b border-white/10 hover:bg-white/5 last:border-b-0"
                  >
                    <AccordionTrigger className="px-4 py-4 transition-colors" style={{
                      background: 'linear-gradient(145deg,rgb(16, 26, 35),rgb(35, 36, 41))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }}>
                      <div className="grid grid-cols-12 gap-4 items-center w-full text-md hover:bg-white/5">
                        {/* Date */}
                        <div className="col-span-2 text-white/80">
                          {formatDate(txHash === 'no-tx' ? firstDrop.timestamp : firstDrop.timestamp)}
                        </div>

                        {/* Wager → Win */}
                        <div className="col-span-4 flex items-center justify-center gap-3">
                          <div className="flex items-center gap-1">
                            <FormatCurrency amount={totalWager} />
                          </div>
                          <span className="text-white/40">→</span>
                          <div className="flex items-center gap-2">
                            {netProfit >= 0 ? (
                              <span className="text-green-400 font-semibold"><FormatCurrency amount={totalWin} /></span>
                            ) : (
                              <span className="text-red-400 font-semibold"><FormatCurrency amount={totalWin} /></span>
                            )}
                            <span className={`text-md font-medium ${
                              profitPercentage >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              ({profitPercentage >= 0 ? '+' : ''}{profitPercentage.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        {/* Transaction Hash & Copy */}
                        <div className="col-span-4 flex items-center justify-center">
                          {txHash !== 'no-tx' ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={`https://scan.pulsechain.com/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400/70 hover:text-cyan-300 transition-colors text-md"
                                title="View on PulseChain Explorer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {txHash.slice(0, 6)}...{txHash.slice(-4)}
                              </a>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(txHash, txHash)
                                }}
                                className="text-cyan-400 hover:text-cyan-300 transition-colors p-1 hover:bg-white/10 rounded"
                                title="Copy transaction hash"
                              >
                                <i className={`fas ${copiedTxHash === txHash ? 'fa-check' : 'fa-copy'} text-md`}></i>
                              </button>
                            </div>
                          ) : (
                            <span className="text-white/40 text-md">-</span>
                          )}
                        </div>

                        {/* Drop Count */}
                        <div className="col-span-2 flex justify-end">
                          <span className="text-white/60 bg-slate-700/50 px-2 py-1 rounded text-md">
                            {txDrops.length} drop{txDrops.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-3">
                      <div className="border-t border-white/10 pt-3">
                        <Table className="w-full">
                          <TableHeader>
                            <TableRow className="flex justify-between w-full border-b border-white/10">
                              <TableHead className="text-white flex-1 text-center text-sm cursor-pointer select-none hover:text-cyan-300 transition-colors" onClick={() => handleSort('timestamp')}>
                                Time <SortIcon field="timestamp" />
                              </TableHead>
                              <TableHead className="text-white flex-1 text-center text-sm cursor-pointer select-none hover:text-cyan-300 transition-colors" onClick={() => handleSort('wager')}>
                                Wager <SortIcon field="wager" />
                              </TableHead>
                              <TableHead className="text-white flex-1 text-center text-sm cursor-pointer select-none hover:text-cyan-300 transition-colors" onClick={() => handleSort('multiplier')}>
                                Multi <SortIcon field="multiplier" />
                              </TableHead>
                              <TableHead className="text-white flex-1 text-center text-sm cursor-pointer select-none hover:text-cyan-300 transition-colors" onClick={() => handleSort('winAmount')}>
                                Win Amount <SortIcon field="winAmount" />
                              </TableHead>
                              <TableHead className="text-white flex-1 text-center text-sm">Risk</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortDrops(txDrops).map((drop) => (
                              <TableRow
                                key={drop.id}
                                className="flex justify-between w-full hover:bg-white/5 transition-colors"
                              >
                                <TableCell className="flex-1 text-xs text-white/60 text-center">
                                  {formatDate(drop.timestamp)}
                                </TableCell>
                                <TableCell className="flex-1 text-white font-medium text-center text-sm">
                                  <FormatCurrency amount={drop.wager} />
                                </TableCell>
                                <TableCell className="flex-1 text-yellow-400 font-bold text-center text-sm">
                                  {drop.multiplier}x
                                </TableCell>
                                <TableCell className="flex-1 text-white font-medium text-center text-sm">
                                  <FormatCurrency amount={drop.winAmount} />
                                </TableCell>
                                <TableCell className="flex-1 flex items-center justify-center">
                                  <div
                                    className={`w-4 h-4 rounded-full inline-block ${
                                      drop.riskLevel === 'GREEN'
                                        ? 'bg-gradient-to-br from-lime-400 to-lime-600'
                                        : drop.riskLevel === 'YELLOW'
                                        ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                                        : 'bg-gradient-to-br from-red-400 to-red-600'
                                    } shadow-md`}
                                    title={drop.riskLevel}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-white/10">
          <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end sm:gap-3">
            <Button
              variant="outline"
              onClick={onExport}
              disabled={drops.length === 0}
              className="bg-slate-800 hover:bg-slate-700 border-cyan-500/30 text-white text-sm"
            >
              <i className="fas fa-download mr-1 sm:mr-2"></i>
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button
              variant="outline"
              onClick={onClear}
              disabled={drops.length === 0}
              className="bg-slate-800 hover:bg-red-900/50 border-red-500/30 text-red-400 text-sm"
            >
              <i className="fas fa-trash mr-1 sm:mr-2"></i>
              <span className="hidden sm:inline">Clear History</span>
              <span className="sm:hidden">Clear</span>
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Helper component for stat cards
function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: React.ReactNode
  color: 'cyan' | 'green' | 'red' | 'yellow' | 'purple'
}) {

  return (
    <div
      className="p-3 rounded-lg text-center"
      style={{
        background: 'linear-gradient(145deg,rgb(16, 26, 35),rgb(35, 36, 41))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      <div className="text-md font-bold text-purple-200/80 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-xl font-black text-purple-200/90">
        {value}
      </div>
    </div>
  )
}
