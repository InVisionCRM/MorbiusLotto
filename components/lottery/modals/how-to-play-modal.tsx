'use client'

export function HowToPlayModal() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* How to Play */}
      <div className="relative p-6 rounded-xl bg-gradient-to-br from-purple-900/30 to-purple-950/20 border-2 border-purple-500/30 backdrop-blur-sm hover:border-purple-400/50 transition-all duration-300 group">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <h4 className="font-bold mb-4 text-lg text-purple-300 relative z-10">How to Play</h4>
        <ul className="space-y-3 text-white/80 relative z-10">
          <li className="flex items-start gap-3">
            <span className="text-purple-400 font-bold">1.</span>
            <span>Pick 6 unique numbers from 1 to 55</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-purple-400 font-bold">2.</span>
            <span>Each ticket costs 1 Morbius</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-purple-400 font-bold">3.</span>
            <span>Buy up to 10 tickets per transaction</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-purple-400 font-bold">4.</span>
            <span>Match more numbers to win bigger prizes</span>
          </li>
        </ul>
      </div>

      {/* Prize Distribution */}
      <div className="relative p-6 rounded-xl bg-gradient-to-br from-pink-900/30 to-pink-950/20 border-2 border-pink-500/30 backdrop-blur-sm hover:border-pink-400/50 transition-all duration-300 group">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <h4 className="font-bold mb-4 text-lg text-pink-300 relative z-10">Prize Distribution</h4>
        <ul className="space-y-3 text-white/80 relative z-10">
          <li className="flex items-start gap-3">
            <span className="text-pink-400 font-bold">60%</span>
            <span>Winners (prize brackets)</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-pink-400 font-bold">20%</span>
            <span>MegaMorbius progressive jackpot</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-pink-400 font-bold">20%</span>
            <span>Burned (supply reduction)</span>
          </li>
          <li className="flex items-start gap-3 text-sm">
            <span className="text-pink-400 font-bold">*</span>
            <span>Zero-winner bracket: 75% rolls to next round, 25% to MegaMorbius</span>
          </li>
        </ul>
      </div>

      {/* MegaMorbius */}
      <div className="relative p-6 rounded-xl bg-gradient-to-br from-amber-900/30 to-amber-950/20 border-2 border-amber-500/30 backdrop-blur-sm hover:border-amber-400/50 transition-all duration-300 group">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <h4 className="font-bold mb-4 text-lg text-amber-300 relative z-10">MegaMorbius Jackpot</h4>
        <ul className="space-y-3 text-white/80 relative z-10">
          <li className="flex items-start gap-3">
            <span className="text-amber-400 font-bold">•</span>
            <span>Triggers every 5th round</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-amber-400 font-bold">•</span>
            <span>Entire bank distributed to all winning brackets</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-amber-400 font-bold">•</span>
            <span>Resets after distribution</span>
          </li>
        </ul>
      </div>

      {/* Free Tickets */}
      <div className="relative p-6 rounded-xl bg-gradient-to-br from-green-900/30 to-green-950/20 border-2 border-green-500/30 backdrop-blur-sm hover:border-green-400/50 transition-all duration-300 group">
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <h4 className="font-bold mb-4 text-lg text-green-300 relative z-10">Free Tickets</h4>
        <ul className="space-y-3 text-white/80 relative z-10">
          <li className="flex items-start gap-3">
            <span className="text-green-400 font-bold">•</span>
            <span>Earn 1 credit per non-winning ticket</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-green-400 font-bold">•</span>
            <span>Credits applied automatically at purchase</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-green-400 font-bold">•</span>
            <span>Never expire</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

