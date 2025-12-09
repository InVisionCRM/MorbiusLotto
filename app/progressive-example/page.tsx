"use client"

/**
 * Example Progressive Jackpot Page
 *
 * This is a complete example showing how to integrate all the Pulse Progressive
 * components into a dedicated page. Copy this and customize as needed.
 */

import { PulseProgressive } from '@/components/CryptoKeno/pulse-progressive'
import { PulseProgressiveWidget } from '@/components/CryptoKeno/pulse-progressive-widget'
import { usePulseProgressive } from '@/hooks/usePulseProgressive'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, TrendingUp, Users, Clock } from 'lucide-react'

export default function ProgressivePage() {
  const progressiveStats = usePulseProgressive()

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header with Widget Preview */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Pulse Progressive</h1>
          <p className="text-purple-300">
            Win the growing jackpot by matching 9+ numbers on 9-Spot or 10-Spot games
          </p>
        </div>

        {/* Example: Compact widget in header */}
        <PulseProgressiveWidget
          currentPool={progressiveStats.currentPool}
          isLoading={progressiveStats.isLoading}
        />
      </div>

      {/* Main Progressive Display */}
      <PulseProgressive {...progressiveStats} />

      {/* Tabs for Additional Info */}
      <Tabs defaultValue="how-it-works" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="how-it-works">How It Works</TabsTrigger>
          <TabsTrigger value="odds">Odds & Payouts</TabsTrigger>
          <TabsTrigger value="history">Win History</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="how-it-works" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>How to Win Pulse Progressive</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StepCard
                  number="1"
                  title="Select Your Game"
                  description="Choose either a 9-Spot or 10-Spot Keno game"
                  icon={<Trophy className="h-6 w-6 text-yellow-400" />}
                />
                <StepCard
                  number="2"
                  title="Enable Progressive"
                  description="Toggle on 'Pulse Progressive' for +0.001 PLS per draw"
                  icon={<TrendingUp className="h-6 w-6 text-green-400" />}
                />
                <StepCard
                  number="3"
                  title="Match 9+ Numbers"
                  description="Hit 9 or more numbers to win the jackpot!"
                  icon={<Trophy className="h-6 w-6 text-purple-400" />}
                />
              </div>

              <div className="pt-4 border-t border-purple-500/20">
                <h3 className="font-bold text-white mb-2">Fee Breakdown</h3>
                <ul className="space-y-2 text-sm text-purple-300">
                  <li className="flex items-center justify-between">
                    <span>Cost per draw:</span>
                    <span className="font-bold text-white">0.001 PLS</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Goes to jackpot pool:</span>
                    <span className="font-bold text-green-400">85% (0.00085 PLS)</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Protocol fee:</span>
                    <span className="font-bold text-purple-400">15% (0.00015 PLS)</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="odds" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Win Probabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="font-bold text-white mb-3">9-Spot Game</h3>
                  <div className="bg-purple-900/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-purple-300">Match 9 of 9</span>
                      <span className="font-bold text-white">~1 in 1,380,687</span>
                    </div>
                    <div className="text-sm text-purple-400">
                      Probability: 0.000072%
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-white mb-3">10-Spot Game</h3>
                  <div className="space-y-2">
                    <div className="bg-purple-900/20 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-purple-300">Match 9 of 10</span>
                        <span className="font-bold text-white">~1 in 163,381</span>
                      </div>
                      <div className="text-sm text-purple-400">
                        Probability: 0.00061%
                      </div>
                    </div>
                    <div className="bg-purple-900/20 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-purple-300">Match 10 of 10</span>
                        <span className="font-bold text-white">~1 in 8,911,711</span>
                      </div>
                      <div className="text-sm text-purple-400">
                        Probability: 0.0000112%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-purple-500/20">
                  <p className="text-sm text-purple-300">
                    <strong className="text-white">Note:</strong> Multiple winners in the same round
                    will split the jackpot equally. This creates a fair and exciting dynamic where
                    everyone has a chance to win big!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Progressive Win History</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {progressiveStats.winCount > BigInt(0) ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-purple-900/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-white">
                        {progressiveStats.winCount.toString()}
                      </div>
                      <div className="text-sm text-purple-300">Total Wins</div>
                    </div>
                    <div className="bg-purple-900/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-white">
                        {Number(progressiveStats.totalPaid / BigInt(10**18)).toLocaleString()}
                      </div>
                      <div className="text-sm text-purple-300">PLS Paid Out</div>
                    </div>
                    <div className="bg-purple-900/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-white">
                        #{progressiveStats.lastWinRound.toString()}
                      </div>
                      <div className="text-sm text-purple-300">Last Win Round</div>
                    </div>
                  </div>

                  {/* TODO: Add actual win history from events */}
                  <div className="pt-4 border-t border-purple-500/20">
                    <p className="text-sm text-purple-300 text-center">
                      Recent winner history coming soon! 🎉
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Trophy className="h-16 w-16 text-purple-400 mx-auto mb-4" />
                  <p className="text-purple-300 text-lg font-medium">
                    No winners yet!
                  </p>
                  <p className="text-purple-400 text-sm mt-2">
                    Be the first to win the Pulse Progressive jackpot
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faq" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FAQItem
                question="Can I win the progressive on any Keno game?"
                answer="No, you must play either a 9-Spot or 10-Spot game and match 9 or more numbers to win the progressive jackpot."
              />
              <FAQItem
                question="What happens if multiple people win in the same round?"
                answer="The jackpot is split equally among all winners in that round. For example, if 3 people win a 300,000 PLS jackpot, each receives 100,000 PLS."
              />
              <FAQItem
                question="Do I automatically get my progressive winnings?"
                answer="You first claim your regular prizes using the claim function. Then either you or anyone else can call distributeProgressive() to distribute the jackpot to all winners."
              />
              <FAQItem
                question="What happens to the jackpot after someone wins?"
                answer="The jackpot resets to the base seed of 100,000 PLS and immediately starts growing again with every progressive ticket purchased."
              />
              <FAQItem
                question="Can I play progressive on multi-draw tickets?"
                answer="Yes! The progressive add-on applies to each draw. If you buy 10 draws with progressive enabled, you have 10 chances to win the jackpot."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StepCard({
  number,
  title,
  description,
  icon
}: {
  number: string
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="relative bg-gradient-to-br from-purple-900/30 to-indigo-900/30 rounded-lg p-6 border border-purple-500/20">
      <div className="absolute -top-3 -left-3 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center font-bold text-white">
        {number}
      </div>
      <div className="flex items-center space-x-3 mb-3">
        {icon}
        <h3 className="font-bold text-white">{title}</h3>
      </div>
      <p className="text-sm text-purple-300">{description}</p>
    </div>
  )
}

function FAQItem({
  question,
  answer
}: {
  question: string
  answer: string
}) {
  return (
    <div className="pb-4 border-b border-purple-500/20 last:border-0">
      <h3 className="font-bold text-white mb-2">{question}</h3>
      <p className="text-sm text-purple-300">{answer}</p>
    </div>
  )
}
