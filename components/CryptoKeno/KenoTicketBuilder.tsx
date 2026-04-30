'use client'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Soft edge on dark embossed panels — class wins over theme `border-input` / UA button chrome. */
const kenoPanelEdge = 'border border-[rgba(0,0,0,0.1)]'
const kenoEmbossedBtn =
  'appearance-none box-border outline-none ring-0 border border-[rgba(0,0,0,0.1)]'

interface KenoTicketBuilderProps {
  spotSize: number
  wager: number
  selectedNumbers: number[]
  isNumberPickerCollapsed: boolean
  paytable: Record<number, Record<number, number>>
  allNumbers: number[]
  onSpotSizeChange: (spotSize: number) => void
  onWagerChange: (wager: number) => void
  onQuickPick: () => void
  onClearNumbers: () => void
  onToggleNumber: (n: number) => void
  onNumberPickerCollapsedChange: (collapsed: boolean) => void
}

export function KenoTicketBuilder({
  spotSize,
  wager,
  selectedNumbers,
  isNumberPickerCollapsed,
  paytable,
  allNumbers,
  onSpotSizeChange,
  onWagerChange,
  onQuickPick,
  onClearNumbers,
  onToggleNumber,
  onNumberPickerCollapsedChange,
}: KenoTicketBuilderProps) {
  return (
    <div className="space-y-4 min-w-0 w-full overflow-x-hidden">
      <h2 className="text-xl font-bold text-white text-center">PLAY KENO</h2>

      <div className="grid grid-cols-2 gap-4">
        <div
          className={cn('space-y-1 p-3 rounded-lg relative', kenoPanelEdge)}
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow:
              'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div className="relative z-10 space-y-1">
            <label className="text-white/70 text-sm">How many spots? (1-10)</label>
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => onSpotSizeChange(num)}
                  className={cn(
                    kenoEmbossedBtn,
                    'relative h-8 w-full rounded-lg font-semibold text-sm transition-all hover:opacity-80',
                    spotSize === num ? 'text-cyan-500' : 'text-gray-300'
                  )}
                  style={
                    spotSize === num
                      ? {
                          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                          boxShadow:
                            'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 12px rgba(34, 197, 94, 0.3)',
                        }
                      : {
                          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                          boxShadow:
                            'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                        }
                  }
                >
                  <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 tabular-nums">
                    {num}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className={cn('rounded-lg p-3 relative', kenoPanelEdge)}
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow:
              'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div className="relative">
            <h3 className="text-sm font-bold text-cyan-500 mb-2 text-center">{spotSize}-Spot Payouts</h3>
            <div className="space-y-1">
              {Object.entries(paytable[spotSize] || {}).map(([matches, payout]) => (
                <div key={matches} className="flex justify-between items-center text-xs">
                  <span className="text-white/70">
                    {matches === '0' ? 'No Match' : `Match ${matches}${spotSize > 1 ? ` of ${spotSize}` : ''}`}
                  </span>
                  <span className="text-cyan-500 font-semibold">{payout}x</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <label className="block text-sm font-medium text-gray-300">Wager</label>
        <div className="grid grid-cols-4 gap-1.5">
          {[2500, 10000, 25000].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onWagerChange(preset)}
              className={cn(
                kenoEmbossedBtn,
                'w-full py-2.5 text-sm rounded-none transition-all hover:opacity-80',
                wager === preset ? 'text-cyan-500' : 'text-white/70'
              )}
              style={
                wager === preset
                  ? {
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow:
                        'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 8px rgba(6, 182, 212, 0.2)',
                    }
                  : {
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow:
                        'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    }
              }
            >
              {preset.toLocaleString()}
            </button>
          ))}
          <Input
            type="number"
            step="1000"
            min="1000"
            max="100000"
            value={wager}
            onChange={(e) => onWagerChange(parseFloat(e.target.value) || 0)}
            placeholder="Custom"
            className={cn(
              'text-white relative col-span-1 !border-[rgba(0,0,0,0.1)] bg-transparent shadow-none',
              'focus-visible:!border-[rgba(0,0,0,0.1)] focus-visible:ring-0 focus-visible:ring-offset-0'
            )}
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
              boxShadow:
                'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white text-center">PICK YOUR NUMBERS</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onQuickPick}
            className={cn(
              kenoEmbossedBtn,
              'h-12 font-semibold rounded-xl transition-all relative backdrop-blur-xl hover:bg-white/[0.12]'
            )}
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 -1px 1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
            }}
          >
            <span className="relative z-10 text-cyan-400/70 hover:text-cyan-400/90">Quick Pick</span>
          </button>
          <button
            type="button"
            onClick={onClearNumbers}
            className={cn(
              kenoEmbossedBtn,
              'h-12 font-semibold rounded-xl transition-all relative backdrop-blur-xl hover:bg-white/[0.12]'
            )}
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 -1px 1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
            }}
          >
            <span className="relative z-10 text-red-400/70 hover:text-red-400/90">Clear</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {isNumberPickerCollapsed ? (
          <button
            type="button"
            onClick={() => onNumberPickerCollapsedChange(false)}
            className={cn(
              kenoEmbossedBtn,
              'w-full h-12 font-semibold rounded-xl transition-all relative backdrop-blur-xl hover:bg-white/[0.12]'
            )}
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 -1px 1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
            }}
          >
            <span className="text-blue-400/70 hover:text-blue-400/90">PICK YOUR OWN NUMBERS</span>
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white/70">
                Select {spotSize} number{spotSize !== 1 ? 's' : ''} from 1-80
              </h4>
              <button
                type="button"
                onClick={() => onNumberPickerCollapsedChange(true)}
                className="text-white/70 hover:text-white text-sm font-medium"
              >
                Collapse
              </button>
            </div>
            <div className="w-full overflow-x-hidden">
              <div className="grid grid-cols-4 gap-1.5 mb-3 w-full">
                {allNumbers.map((n) => {
                  const active = selectedNumbers.includes(n)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onToggleNumber(n)}
                      disabled={!active && selectedNumbers.length >= spotSize}
                      className={cn(
                        'relative h-8 rounded text-xs font-semibold transition-all cursor-pointer',
                        active
                          ? 'bg-white text-black border border-white text-md scale-115'
                          : cn(kenoEmbossedBtn, 'text-white hover:opacity-80')
                      )}
                      style={
                        !active
                          ? {
                              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                              boxShadow:
                                'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                            }
                          : undefined
                      }
                    >
                      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 tabular-nums">
                        {n.toString().padStart(2, '0')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
