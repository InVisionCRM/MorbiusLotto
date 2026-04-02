"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface KenoPrizePoolModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KenoPrizePoolModal({ open, onOpenChange }: KenoPrizePoolModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-y-auto relative text-white"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.95))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        {/* Radial gradient overlay */}
        <div className="relative z-10 p-6">
        <DialogHeader className="mb-6">
          <DialogTitle className="text-2xl font-bold text-white text-center">
            KENO PRIZE PAYOUTS
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-center mt-2">
            Prize amounts shown are multipliers. Multiply by your wager to get total payout.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Prize Table Data - Real Keno payouts converted: $1 = 1000 MORBIUS */}
          {[
            {
              spot: 10,
              rows: [
                { matched: 10, base: 10000000 }, 
                { matched: 9, base: 5000000 },    
                { matched: 8, base: 100000 },   
                { matched: 7, base: 50000 },      
                { matched: 6, base: 10000 },       
                { matched: 5, base: 2000 },       
                { matched: 0, base: 5000 },       
              ],
              odds: "1 in 9.05"
            },
            {
              spot: 9,
              rows: [
                { matched: 9, base: 2500000 },   
                { matched: 8, base: 200000 },    
                { matched: 7, base: 100000 },      
                { matched: 6, base: 20000 },       
                { matched: 5, base: 5000 },      
                { matched: 4, base: 2000 },        
              ],
              odds: "1 in 6.53"
            },
            {
              spot: 8,
              rows: [
                { matched: 8, base: 10000000 },    
                { matched: 7, base: 300000 },     
                { matched: 6, base: 50000 },      
                { matched: 5, base: 15000 },       
                { matched: 4, base: 2000 },       
              ],
              odds: "1 in 9.77"
            },
            {
              spot: 7,
              rows: [
                { matched: 7, base: 2000000 },     
                { matched: 6, base: 100000 },     
                { matched: 5, base: 11000 },     
                { matched: 4, base: 5000 },        
                { matched: 3, base: 1000 },       
              ],
              odds: "1 in 4.23"
            },
            {
              spot: 6,
              rows: [
                { matched: 6, base: 1100000 },     
                { matched: 5, base: 57000 },      
                { matched: 4, base: 7000 },       
                { matched: 3, base: 1000 },       
              ],
              odds: "1 in 6.19"
            },
            {
              spot: 5,
              rows: [
                { matched: 5, base: 410000 },     
                { matched: 4, base: 18000 },      
                { matched: 3, base: 2000 },        
              ],
              odds: "1 in 10.34"
            },
            {
              spot: 4,
              rows: [
                { matched: 4, base: 72000 },     
                { matched: 3, base: 5000 },      
                { matched: 2, base: 1000 },       
              ],
              odds: "1 in 3.86"
            },
            {
              spot: 3,
              rows: [
                { matched: 3, base: 27000 },      
                { matched: 2, base: 2000 },    
              ],
              odds: "1 in 6.55"
            },
            {
              spot: 2,
              rows: [
                { matched: 2, base: 11000 },       
              ],
              odds: "1 in 16.63"
            },
            {
              spot: 1,
              rows: [
                { matched: 1, base: 2000 },       
              ],
              odds: "1 in 4.00"
            },
          ].map(({ spot, rows, odds }) => (
            <div
              key={spot}
              className="surface-panel relative overflow-hidden rounded-lg"
            >
              {/* Radial gradient overlay */}
              <div className="relative z-10">
              <div className="bg-lime-600/70 px-4 py-2 border-b border-white/10">
                <h3 className="text-lg font-bold text-white">{spot} SPOT</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-4 py-2 text-left text-white font-semibold">NUMBERS MATCHED</th>
                      <th className="px-4 py-2 text-center text-white font-semibold">Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx} className={cn("border-b border-white/5", idx % 2 === 0 && "bg-white/5")}>
                        <td className="px-4 py-2 text-white font-medium">
                          {row.matched} {row.matched === 1 ? 'Match' : 'Matches'}
                        </td>
                        <td className="px-4 py-2 text-center text-white font-semibold">
                          {row.base.toLocaleString()} MORBIUS
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-white/5">
                      <td colSpan={2} className="px-4 py-2 text-center text-gray-400 text-xs">
                        ODDS: {odds}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className="surface-panel relative mt-6 rounded-lg p-4"
        >
          {/* Radial gradient overlay */}
          <div className="relative z-10">
          <p className="text-xs text-amber-200 mb-2">
            <strong>*</strong> Subject to contract rules, prize amounts may vary. The total liability for 10 of 10 prize is limited.
          </p>
          <p className="text-xs text-amber-200">
            <strong>**</strong> Subject to contract rules, prize amounts may vary. The total KENO! MULTIPLIER prize liability is limited.
          </p>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}