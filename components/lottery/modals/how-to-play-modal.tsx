'use client'

export function HowToPlayModal() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
          🎰 Win Big with MegaMorbius Lottery! 🎰
        </h2>
        <p className="text-white/70 text-lg">
          Pick 6 numbers, match them to win! The more you match, the bigger your prize! 💰
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-purple-500/20 to-purple-900/20 border border-purple-500/40 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-purple-300">100</div>
          <div className="text-xs text-white/60 uppercase tracking-wider mt-1">Morbius/Ticket</div>
        </div>
        <div className="bg-gradient-to-br from-pink-500/20 to-pink-900/20 border border-pink-500/40 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-pink-300">30</div>
          <div className="text-xs text-white/60 uppercase tracking-wider mt-1">Min Rounds</div>
        </div>
        <div className="bg-gradient-to-br from-amber-500/20 to-amber-900/20 border border-amber-500/40 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-amber-300">1-55</div>
          <div className="text-xs text-white/60 uppercase tracking-wider mt-1">Number Range</div>
        </div>
      </div>

      {/* Prize Brackets - The Exciting Part! */}
      <div className="space-y-3">
        <h3 className="text-2xl font-bold text-center bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">
          🏆 Win with Every Match! 🏆
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* 6 Matches - JACKPOT */}
          <div className="relative col-span-2 md:col-span-3 p-6 rounded-xl bg-gradient-to-br from-yellow-500/30 via-amber-500/20 to-orange-500/30 border-2 border-yellow-400/60 shadow-lg shadow-yellow-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/10 to-transparent rounded-xl animate-pulse"></div>
            <div className="relative z-10 text-center">
              <div className="text-5xl font-bold text-yellow-300 mb-2">6 MATCHES</div>
              <div className="text-xl text-yellow-200 font-semibold">🎊 GRAND JACKPOT! 🎊</div>
              <div className="text-sm text-yellow-100/80 mt-2">45% of Winners Pool</div>
            </div>
          </div>

          {/* 5 Matches */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-900/20 border-2 border-purple-400/50">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-300">5 Matches</div>
              <div className="text-lg text-purple-200 mt-1">💎 Amazing!</div>
              <div className="text-xs text-white/60 mt-2">20% of Pool</div>
            </div>
          </div>

          {/* 4 Matches */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-pink-500/30 to-pink-900/20 border-2 border-pink-400/50">
            <div className="text-center">
              <div className="text-3xl font-bold text-pink-300">4 Matches</div>
              <div className="text-lg text-pink-200 mt-1">⭐ Great!</div>
              <div className="text-xs text-white/60 mt-2">15% of Pool</div>
            </div>
          </div>

          {/* 3 Matches */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-900/20 border-2 border-blue-400/50">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-300">3 Matches</div>
              <div className="text-lg text-blue-200 mt-1">🎯 Good!</div>
              <div className="text-xs text-white/60 mt-2">10% of Pool</div>
            </div>
          </div>

          {/* 2 Matches */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/30 to-green-900/20 border-2 border-green-400/50">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-300">2 Matches</div>
              <div className="text-lg text-green-200 mt-1">✨ Nice!</div>
              <div className="text-xs text-white/60 mt-2">6% of Pool</div>
            </div>
          </div>

          {/* 1 Match */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/30 to-cyan-900/20 border-2 border-cyan-400/50">
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-300">1 Match</div>
              <div className="text-lg text-cyan-200 mt-1">🎲 Lucky!</div>
              <div className="text-xs text-white/60 mt-2">4% of Pool</div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Prize Distribution */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-pink-900/30 to-pink-950/20 border border-pink-500/30">
          <h4 className="font-bold mb-3 text-lg text-pink-300 flex items-center gap-2">
            <span>💰</span> Prize Distribution
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center p-2 rounded bg-pink-500/10">
              <span className="text-white/80">Winners Pool</span>
              <span className="text-pink-400 font-bold">70%</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-amber-500/10">
              <span className="text-white/80">MegaMorbius Bank</span>
              <span className="text-amber-400 font-bold">10%</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-red-500/10">
              <span className="text-white/80">Burned</span>
              <span className="text-red-400 font-bold">10%</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-blue-500/10">
              <span className="text-white/80">Keeper</span>
              <span className="text-blue-400 font-bold">5%</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-purple-500/10">
              <span className="text-white/80">Deployer</span>
              <span className="text-purple-400 font-bold">5%</span>
            </div>
          </div>
        </div>

        {/* MegaMorbius */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-amber-900/30 to-amber-950/20 border border-amber-500/30">
          <h4 className="font-bold mb-3 text-lg text-amber-300 flex items-center gap-2">
            <span>🎰</span> MegaMorbius Jackpot
          </h4>
          <div className="space-y-3 text-sm text-white/80">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="font-semibold text-amber-300 mb-1">Every 20th Round!</div>
              <div className="text-xs">Rounds 20, 40, 60, 80...</div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span>To Winners Pool</span>
                <span className="text-amber-400 font-bold">90%</span>
              </div>
              <div className="flex justify-between items-center">
                <span>To Deployer</span>
                <span className="text-amber-400 font-bold">10%</span>
              </div>
            </div>
            <div className="text-xs text-amber-200/60 italic text-center pt-2 border-t border-amber-500/20">
              Bank resets after distribution
            </div>
          </div>
        </div>
      </div>

      {/* Rollover Logic */}
      <div className="p-5 rounded-xl bg-gradient-to-br from-green-900/30 to-green-950/20 border border-green-500/30">
        <h4 className="font-bold mb-3 text-lg text-green-300 flex items-center gap-2">
          <span>🔄</span> Unclaimed Prizes Rollover
        </h4>
        <p className="text-sm text-white/70 mb-3">If a prize bracket has no winners, the prize is distributed:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="text-2xl font-bold text-green-400">75%</div>
            <div className="text-xs text-white/60 mt-1">Next Round</div>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="text-2xl font-bold text-amber-400">10%</div>
            <div className="text-xs text-white/60 mt-1">MegaMorbius</div>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="text-2xl font-bold text-red-400">10%</div>
            <div className="text-xs text-white/60 mt-1">Burned</div>
          </div>
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <div className="text-2xl font-bold text-purple-400">5%</div>
            <div className="text-xs text-white/60 mt-1">Deployer</div>
          </div>
        </div>
      </div>

      {/* Quick Start Guide */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-900/20 border border-purple-500/30 text-center">
          <div className="text-2xl mb-2">1️⃣</div>
          <div className="font-semibold text-purple-300 mb-1">Pick Numbers</div>
          <div className="text-xs text-white/60">Choose 6 from 1-55</div>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-900/20 border border-pink-500/30 text-center">
          <div className="text-2xl mb-2">2️⃣</div>
          <div className="font-semibold text-pink-300 mb-1">Buy Tickets</div>
          <div className="text-xs text-white/60">100 Morbius each</div>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-900/20 border border-blue-500/30 text-center">
          <div className="text-2xl mb-2">3️⃣</div>
          <div className="font-semibold text-blue-300 mb-1">Wait 30 Min</div>
          <div className="text-xs text-white/60">Automatic draw</div>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/20 to-green-900/20 border border-green-500/30 text-center">
          <div className="text-2xl mb-2">4️⃣</div>
          <div className="font-semibold text-green-300 mb-1">Claim Prizes</div>
          <div className="text-xs text-white/60">Match & win!</div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="text-center p-6 rounded-xl bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 border border-purple-500/40">
        <div className="text-xl font-bold text-white mb-2">
          Ready to Win? 🚀
        </div>
        <div className="text-sm text-white/70">
          Buy up to 100 tickets per transaction • Play up to 100 rounds in advance
        </div>
      </div>
    </div>
  )
}

