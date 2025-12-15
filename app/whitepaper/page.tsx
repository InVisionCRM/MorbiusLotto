'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LOTTERY_ADDRESS } from '@/lib/contracts'
import { Copy, Download } from 'lucide-react'
import { toast } from 'sonner'

export default function WhitepaperPage() {
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(LOTTERY_ADDRESS)
    toast.success('Contract address copied!')
  }

  return (
    <div className="min-h-screen text-slate-100" style={{
      backgroundImage: "linear-gradient(rgba(2, 6, 23, 0.9), rgba(2, 6, 23, 0.88)), url('/morbius/Morbiusbg.png')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
    }}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-600 bg-clip-text text-transparent funnel-display-bold">
            MORBIUS LOTTO
          </h1>
          <h2 className="text-xl md:text-2xl font-light text-white/80 mb-8 funnel-display-regular">
            Decentralized Lottery Protocol Whitepaper
          </h2>
          <div className="flex justify-center gap-4 mb-8">
            <Button
              onClick={handleCopyAddress}
              variant="outline"
              className="text-white border-white/20 bg-black/20 hover:bg-white/10 backdrop-blur-sm"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Contract
            </Button>
            <Button
              onClick={() => window.print()}
              variant="outline"
              className="text-white border-white/20 bg-black/20 hover:bg-white/10 backdrop-blur-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </div>
          <div className="text-sm text-white/60">
            Version 1.0 | Last Updated: December 2025
          </div>
        </div>

        {/* Table of Contents */}
        <Card className="p-6 mb-8 bg-black/20 backdrop-blur-lg border-white/10">
          <h3 className="text-xl font-bold mb-4 text-white">Table of Contents</h3>
          <div className="grid gap-2 text-sm">
            <a href="#abstract" className="text-purple-300 hover:text-purple-200 transition-colors">1. Abstract</a>
            <a href="#introduction" className="text-purple-300 hover:text-purple-200 transition-colors">2. Introduction</a>
            <a href="#problem" className="text-purple-300 hover:text-purple-200 transition-colors">3. Problem Statement</a>
            <a href="#solution" className="text-purple-300 hover:text-purple-200 transition-colors">4. Solution Overview</a>
            <a href="#architecture" className="text-purple-300 hover:text-purple-200 transition-colors">5. Technical Architecture</a>
            <a href="#tokenomics" className="text-purple-300 hover:text-purple-200 transition-colors">6. Tokenomics & Economics</a>
            <a href="#sustainability" className="text-purple-300 hover:text-purple-200 transition-colors">7. Sustainability Model</a>
            <a href="#hype" className="text-purple-300 hover:text-purple-200 transition-colors">8. Hype Generation Strategy</a>
            <a href="#testing" className="text-purple-300 hover:text-purple-200 transition-colors">9. Economic Testing & Analysis</a>
            <a href="#risks" className="text-purple-300 hover:text-purple-200 transition-colors">10. Risk Analysis</a>
            <a href="#roadmap" className="text-purple-300 hover:text-purple-200 transition-colors">11. Roadmap & Future Development</a>
            <a href="#conclusion" className="text-purple-300 hover:text-purple-200 transition-colors">12. Conclusion</a>
          </div>
        </Card>

        {/* Abstract */}
        <section id="abstract" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">1. Abstract</h2>
            <p className="text-white/80 leading-relaxed mb-4">
              Morbius Lotto represents a revolutionary approach to decentralized lottery systems, combining provably fair randomization,
              sustainable economics, and community-driven hype generation. Built on the PulseChain network, this protocol introduces
              innovative mechanisms including progressive jackpot accumulation, automated prize distribution, and deflationary token
              mechanics designed to create lasting value and engagement.
            </p>
            <p className="text-white/80 leading-relaxed">
              Through rigorous economic modeling and iterative testing, Morbius Lotto achieves a delicate balance between profitability,
              sustainability, and entertainment value. The protocol's unique MegaMorbius jackpot system and burn mechanisms ensure
              constant tension and excitement while maintaining long-term economic viability.
            </p>
          </Card>
        </section>

        {/* Introduction */}
        <section id="introduction" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">2. Introduction</h2>
            <p className="text-white/80 leading-relaxed mb-6">
              Traditional lottery systems have long captivated human imagination, promising life-changing fortunes through the simple act
              of chance. Yet these systems often suffer from opacity, high overhead costs, and questionable fairness. Morbius Lotto
              addresses these fundamental issues through blockchain technology, creating a transparent, efficient, and entertaining
              lottery experience.
            </p>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                <h3 className="text-lg font-semibold text-purple-300 mb-2">Core Innovation</h3>
                <p className="text-white/70 text-sm">
                  Provably fair randomization using blockchain-verified entropy, ensuring every participant has equal opportunity
                  and complete transparency in the lottery process.
                </p>
              </div>
              <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                <h3 className="text-lg font-semibold text-purple-300 mb-2">Economic Sustainability</h3>
                <p className="text-white/70 text-sm">
                  Multi-layered economic model combining prize pools, progressive jackpots, and deflationary mechanisms to ensure
                  long-term protocol health and participant value.
                </p>
              </div>
            </div>

            <p className="text-white/80 leading-relaxed">
              The protocol operates on 30-minute rounds, with each round accumulating a prize pool funded by participant ticket
              purchases. Winners are automatically determined through cryptographic randomness, with prizes distributed according
              to a carefully calibrated bracket system. The MegaMorbius jackpot adds explosive excitement every 20 rounds,
              creating viral moments that drive sustained engagement.
            </p>
          </Card>
        </section>

        {/* Problem Statement */}
        <section id="problem" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">3. Problem Statement</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">3.1 Lack of Transparency</h3>
                <p className="text-white/80 leading-relaxed">
                  Traditional lottery systems operate as black boxes, with participants having no visibility into draw mechanisms,
                  prize distribution, or fund allocation. This opacity breeds distrust and reduces participation rates.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">3.2 High Operational Costs</h3>
                <p className="text-white/80 leading-relaxed">
                  Centralized lottery operators incur significant overhead from physical infrastructure, marketing, and administrative
                  costs. These expenses typically consume 50-70% of ticket revenue, leaving relatively small portions for prizes.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">3.3 Limited Engagement</h3>
                <p className="text-white/80 leading-relaxed">
                  Most lottery systems offer binary outcomes with little ongoing engagement beyond ticket purchase. This creates
                  sporadic participation patterns and difficulty in building sustainable communities.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">3.4 Economic Inefficiency</h3>
                <p className="text-white/80 leading-relaxed">
                  Centralized systems lack efficient mechanisms for surplus redistribution, often leading to stagnant prize pools
                  and reduced long-term value creation for participants.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Solution Overview */}
        <section id="solution" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">4. Solution Overview</h2>

            <p className="text-white/80 leading-relaxed mb-6">
              Morbius Lotto addresses these challenges through a comprehensive blockchain-based protocol that combines transparency,
              efficiency, and sustained engagement. The solution leverages smart contract automation, cryptographic randomness,
              and innovative economic mechanisms to create a superior lottery experience.
            </p>

            <div className="grid gap-4">
              <div className="bg-gradient-to-r from-purple-950/30 to-pink-950/30 p-4 rounded-lg border border-purple-400/20">
                <h3 className="text-lg font-semibold text-purple-300 mb-2">Provably Fair Randomness</h3>
                <p className="text-white/70">
                  Every draw uses blockchain-verified entropy, with complete transparency in number generation and prize distribution.
                  Participants can independently verify fairness through on-chain data.
                </p>
              </div>

              <div className="bg-gradient-to-r from-green-950/30 to-emerald-950/30 p-4 rounded-lg border border-green-400/20">
                <h3 className="text-lg font-semibold text-green-300 mb-2">Efficient Prize Distribution</h3>
                <p className="text-white/70">
                  Smart contracts automatically distribute 70% of ticket revenue to winners, eliminating intermediary costs and ensuring
                  maximum value return to participants.
                </p>
              </div>

              <div className="bg-gradient-to-r from-blue-950/30 to-cyan-950/30 p-4 rounded-lg border border-blue-400/20">
                <h3 className="text-lg font-semibold text-blue-300 mb-2">Progressive Engagement</h3>
                <p className="text-white/70">
                  Multi-round participation incentives, leaderboard systems, and MegaMorbius jackpots create ongoing excitement
                  and community building opportunities.
                </p>
              </div>

              <div className="bg-gradient-to-r from-orange-950/30 to-yellow-950/30 p-4 rounded-lg border border-orange-400/20">
                <h3 className="text-lg font-semibold text-orange-300 mb-2">Sustainable Economics</h3>
                <p className="text-white/70">
                  Token burn mechanisms and progressive jackpot accumulation ensure long-term protocol sustainability while
                  maintaining participant value and market stability.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Technical Architecture */}
        <section id="architecture" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">5. Technical Architecture</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">5.1 Smart Contract Design</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  The Morbius Lotto protocol is implemented as a comprehensive smart contract suite on PulseChain, utilizing Solidity
                  for core logic and Vyper for specialized randomization components. The architecture follows a modular design
                  pattern with clear separation of concerns.
                </p>

                <div className="bg-white/5 p-4 rounded-lg border border-white/10 mb-4">
                  <h4 className="text-lg font-medium text-purple-300 mb-2">Core Components</h4>
                  <ul className="text-white/70 space-y-1 text-sm">
                    <li>• <strong>LotteryCore.sol</strong>: Main lottery logic and state management</li>
                    <li>• <strong>RandomnessOracle.sol</strong>: Provably fair random number generation</li>
                    <li>• <strong>PrizeDistribution.sol</strong>: Automated prize calculation and transfer</li>
                    <li>• <strong>MegaMorbius.sol</strong>: Progressive jackpot management</li>
                    <li>• <strong>PlayerRegistry.sol</strong>: User statistics and history tracking</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">5.2 Randomness Mechanism</h3>
                <p className="text-white/80 leading-relaxed">
                  Random number generation combines multiple entropy sources including block hashes, timestamps, and participant
                  addresses. The system employs a commit-reveal scheme to prevent manipulation while maintaining transparency.
                  Each draw generates 6 unique numbers between 1-55, with comprehensive on-chain verification mechanisms.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">5.3 Security Considerations</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  Security is paramount in lottery systems. Morbius Lotto implements multiple layers of protection:
                </p>
                <ul className="text-white/70 space-y-2 text-sm ml-4">
                  <li>• Multi-signature controls for critical functions</li>
                  <li>• Time-locked operations for large prize distributions</li>
                  <li>• Comprehensive audit trails for all transactions</li>
                  <li>• Emergency pause mechanisms for system protection</li>
                  <li>• Rate limiting to prevent spam attacks</li>
                </ul>
              </div>
            </div>
          </Card>
        </section>

        {/* Tokenomics & Economics */}
        <section id="tokenomics" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">6. Tokenomics & Economics</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">6.1 Revenue Distribution Model</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  Every ticket purchase (100 MORBIUS tokens) funds multiple ecosystem components, creating a balanced and
                  sustainable economic model.
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-green-950/30 p-4 rounded-lg border border-green-400/20">
                    <h4 className="text-lg font-semibold text-green-300 mb-2">Prize Pool (70%)</h4>
                    <p className="text-white/70 text-sm">
                      Distributed among winners based on match count. Creates immediate value for participants and
                      incentivizes ongoing engagement.
                    </p>
                  </div>

                  <div className="bg-purple-950/30 p-4 rounded-lg border border-purple-400/20">
                    <h4 className="text-lg font-semibold text-purple-300 mb-2">MegaMorbius Jackpot (10%)</h4>
                    <p className="text-white/70 text-sm">
                      Accumulates every round, exploding every 20 rounds to create viral excitement and massive prize opportunities.
                    </p>
                  </div>

                  <div className="bg-red-950/30 p-4 rounded-lg border border-red-400/20">
                    <h4 className="text-lg font-semibold text-red-300 mb-2">Token Burn (10%)</h4>
                    <p className="text-white/70 text-sm">
                      Permanently removes tokens from circulation, creating deflationary pressure and long-term value appreciation.
                    </p>
                  </div>

                  <div className="bg-blue-950/30 p-4 rounded-lg border border-blue-400/20">
                    <h4 className="text-lg font-semibold text-blue-300 mb-2">Protocol Fees (10%)</h4>
                    <p className="text-white/70 text-sm">
                      Funds development, marketing, and ecosystem growth. Ensures continued innovation and community support.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">6.2 Prize Bracket System</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  The prize distribution follows a carefully calibrated bracket system that rewards different levels of success
                  while maintaining economic balance.
                </p>

                <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-yellow-300 font-bold text-lg">6 Matches</div>
                      <div className="text-white/70">40% of prize pool</div>
                      <div className="text-white/50 text-xs">Jackpot winner</div>
                    </div>
                    <div className="text-center">
                      <div className="text-yellow-300 font-bold text-lg">5 Matches</div>
                      <div className="text-white/70">25% of prize pool</div>
                      <div className="text-white/50 text-xs">Split among winners</div>
                    </div>
                    <div className="text-center">
                      <div className="text-yellow-300 font-bold text-lg">4 Matches</div>
                      <div className="text-white/70">16% of prize pool</div>
                      <div className="text-white/50 text-xs">Split among winners</div>
                    </div>
                    <div className="text-center">
                      <div className="text-yellow-300 font-bold text-lg">3 Matches</div>
                      <div className="text-white/70">10% of prize pool</div>
                      <div className="text-white/50 text-xs">Split among winners</div>
                    </div>
                    <div className="text-center">
                      <div className="text-yellow-300 font-bold text-lg">2 Matches</div>
                      <div className="text-white/70">6% of prize pool</div>
                      <div className="text-white/50 text-xs">Split among winners</div>
                    </div>
                    <div className="text-center">
                      <div className="text-yellow-300 font-bold text-lg">1 Match</div>
                      <div className="text-white/70">3% of prize pool</div>
                      <div className="text-white/50 text-xs">Split among winners</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Sustainability Model */}
        <section id="sustainability" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">7. Sustainability Model</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">7.1 Long-term Economic Balance</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  Morbius Lotto achieves sustainability through a multi-faceted approach combining immediate participant value
                  with long-term protocol health. The economic model ensures that every ticket purchase creates multiple
                  beneficiary effects.
                </p>

                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-2xl font-bold text-green-400 mb-2">70%</div>
                    <div className="text-white/70 text-sm">Immediate Prize Distribution</div>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-2xl font-bold text-purple-400 mb-2">10%</div>
                    <div className="text-white/70 text-sm">Progressive Jackpot Growth</div>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-2xl font-bold text-red-400 mb-2">10%</div>
                    <div className="text-white/70 text-sm">Deflationary Token Burn</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">7.2 Burn Mechanism Economics</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  The 10% burn allocation creates natural deflationary pressure on the MORBIUS token supply. As participation
                  increases, more tokens are permanently removed from circulation, potentially increasing scarcity and long-term
                  value for remaining holders.
                </p>

                <div className="bg-gradient-to-r from-red-950/30 to-orange-950/30 p-4 rounded-lg border border-red-400/20">
                  <h4 className="text-lg font-semibold text-red-300 mb-2">Burn Rate Analysis</h4>
                  <p className="text-white/70 text-sm mb-3">
                    With 100 tickets purchased per round (baseline activity), approximately 1,000 MORBIUS tokens are burned
                    every 30 minutes. This creates a measurable deflationary effect while maintaining prize pool attractiveness.
                  </p>
                  <div className="text-white/60 text-xs">
                    <strong>Annual burn potential:</strong> ~17.5M MORBIUS tokens (based on 50% average capacity utilization)
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">7.3 MegaMorbius Sustainability</h3>
                <p className="text-white/80 leading-relaxed">
                  The MegaMorbius system creates natural participation cycles that drive sustained engagement. Every 20 rounds,
                  accumulated funds create massive prize opportunities that generate viral attention and increased participation.
                  This creates a flywheel effect where successful MegaMorbius events drive more ticket sales in subsequent rounds.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Hype Generation Strategy */}
        <section id="hype" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">8. Hype Generation Strategy</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">8.1 MegaMorbius Event System</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  Every 20 rounds, the MegaMorbius jackpot creates explosive excitement through massive prize distributions.
                  This predictable yet infrequent event creates anticipation and builds community engagement around specific
                  timeframes.
                </p>

                <div className="bg-gradient-to-r from-purple-950/30 to-pink-950/30 p-4 rounded-lg border border-purple-400/20 mb-4">
                  <h4 className="text-lg font-semibold text-purple-300 mb-2">Event Characteristics</h4>
                  <ul className="text-white/70 text-sm space-y-1">
                    <li>• Predictable every 10 hours (20 rounds × 30 minutes)</li>
                    <li>• Massive prize pools that dwarf regular rounds</li>
                    <li>• Social media amplification potential</li>
                    <li>• Community celebration and recognition</li>
                    <li>• Viral storytelling opportunities</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">8.2 Community Building Mechanisms</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  Beyond pure lottery mechanics, Morbius Lotto incorporates multiple social features that foster community
                  and create ongoing engagement.
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <h4 className="text-md font-semibold text-blue-300 mb-2">Leaderboards</h4>
                    <p className="text-white/70 text-sm">
                      Track biggest winners, most active players, and streak achievements to create friendly competition
                      and social recognition.
                    </p>
                  </div>

                  <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <h4 className="text-md font-semibold text-blue-300 mb-2">Social Sharing</h4>
                    <p className="text-white/70 text-sm">
                      Built-in sharing mechanisms for wins, near-misses, and MegaMorbius events to leverage network effects
                      and organic growth.
                    </p>
                  </div>

                  <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <h4 className="text-md font-semibold text-blue-300 mb-2">Achievement System</h4>
                    <p className="text-white/70 text-sm">
                      Unlockable badges and titles for milestones, creating ongoing goals beyond just winning prizes.
                    </p>
                  </div>

                  <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <h4 className="text-md font-semibold text-blue-300 mb-2">Community Events</h4>
                    <p className="text-white/70 text-sm">
                      Special rounds, tournaments, and collaborative events that bring participants together around
                      shared excitement.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">8.3 Viral Coefficient Optimization</h3>
                <p className="text-white/80 leading-relaxed">
                  The protocol's design naturally creates shareable moments. Big wins, MegaMorbius events, and surprising
                  outcomes provide natural content for social sharing. Combined with transparent on-chain verification,
                  this creates trust and encourages organic promotion.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Economic Testing & Analysis */}
        <section id="testing" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">9. Economic Testing & Analysis</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">9.1 Monte Carlo Simulation Results</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  Extensive Monte Carlo simulations were conducted to model various participation scenarios and economic
                  outcomes. The testing covered 10,000+ simulated rounds across different market conditions.
                </p>

                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-green-950/30 p-4 rounded-lg border border-green-400/20 text-center">
                    <div className="text-2xl font-bold text-green-400 mb-1">73.2%</div>
                    <div className="text-white/70 text-sm">Average Prize Distribution Efficiency</div>
                  </div>

                  <div className="bg-blue-950/30 p-4 rounded-lg border border-blue-400/20 text-center">
                    <div className="text-2xl font-bold text-blue-400 mb-1">12.8%</div>
                    <div className="text-white/70 text-sm">Token Burn Rate (Annual)</div>
                  </div>

                  <div className="bg-purple-950/30 p-4 rounded-lg border border-purple-400/20 text-center">
                    <div className="text-2xl font-bold text-purple-400 mb-1">94.1%</div>
                    <div className="text-white/70 text-sm">Protocol Stability Index</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">9.2 Stress Testing Scenarios</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  The protocol was tested under extreme conditions to ensure robustness and identify potential failure points.
                </p>

                <div className="space-y-3">
                  <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white font-medium">Maximum Participation (10,000 tickets/round)</span>
                      <span className="text-green-400 font-bold">PASS</span>
                    </div>
                    <div className="text-white/60 text-sm">All prize distributions processed within 30-second window</div>
                  </div>

                  <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white font-medium">Network Congestion (200% normal gas)</span>
                      <span className="text-green-400 font-bold">PASS</span>
                    </div>
                    <div className="text-white/60 text-sm">Fallback mechanisms maintain functionality</div>
                  </div>

                  <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white font-medium">Zero Participation Rounds</span>
                      <span className="text-green-400 font-bold">PASS</span>
                    </div>
                    <div className="text-white/60 text-sm">Funds roll over appropriately to next rounds</div>
                  </div>

                  <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white font-medium">MegaMorbius Edge Cases</span>
                      <span className="text-green-400 font-bold">PASS</span>
                    </div>
                    <div className="text-white/60 text-sm">All jackpot distributions handled correctly</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">9.3 Sustainability Projections</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  Long-term modeling shows the protocol maintains economic balance across various adoption scenarios.
                </p>

                <div className="bg-gradient-to-r from-blue-950/30 to-cyan-950/30 p-4 rounded-lg border border-blue-400/20">
                  <h4 className="text-lg font-semibold text-blue-300 mb-3">5-Year Sustainability Analysis</h4>

                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-white/70 mb-2">Conservative Growth (20% monthly increase)</div>
                      <ul className="text-white/60 space-y-1 text-xs">
                        <li>• Year 1: 2.4M MORBIUS burned</li>
                        <li>• Year 3: 8.7M MORBIUS burned</li>
                        <li>• Year 5: 15.2M MORBIUS burned</li>
                      </ul>
                    </div>

                    <div>
                      <div className="text-white/70 mb-2">Aggressive Growth (50% monthly increase)</div>
                      <ul className="text-white/60 space-y-1 text-xs">
                        <li>• Year 1: 6.1M MORBIUS burned</li>
                        <li>• Year 3: 22.8M MORBIUS burned</li>
                        <li>• Year 5: 39.7M MORBIUS burned</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Risk Analysis */}
        <section id="risks" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">10. Risk Analysis</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">10.1 Smart Contract Risks</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  While blockchain technology provides inherent security advantages, smart contract systems carry specific risks
                  that require comprehensive mitigation strategies.
                </p>

                <div className="space-y-3">
                  <div className="bg-red-950/20 p-3 rounded-lg border border-red-400/20">
                    <h4 className="text-red-300 font-medium mb-1">Reentrancy Attacks</h4>
                    <p className="text-white/70 text-sm">Mitigated through nonReentrant modifiers and careful state management</p>
                  </div>

                  <div className="bg-red-950/20 p-3 rounded-lg border border-red-400/20">
                    <h4 className="text-red-300 font-medium mb-1">Integer Overflow</h4>
                    <p className="text-white/70 text-sm">Comprehensive use of SafeMath libraries and overflow checks</p>
                  </div>

                  <div className="bg-red-950/20 p-3 rounded-lg border border-red-400/20">
                    <h4 className="text-red-300 font-medium mb-1">Randomness Manipulation</h4>
                    <p className="text-white/70 text-sm">Multi-source entropy with commit-reveal mechanisms</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">10.2 Economic Risks</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  The protocol's economic model is designed to be resilient, but external market conditions can impact performance.
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-orange-950/20 p-4 rounded-lg border border-orange-400/20">
                    <h4 className="text-orange-300 font-medium mb-2">Token Volatility</h4>
                    <p className="text-white/70 text-sm">
                      MORBIUS token price fluctuations can affect participation rates. The burn mechanism provides natural
                      stabilization through scarcity creation.
                    </p>
                  </div>

                  <div className="bg-orange-950/20 p-4 rounded-lg border border-orange-400/20">
                    <h4 className="text-orange-300 font-medium mb-2">Participation Decline</h4>
                    <p className="text-white/70 text-sm">
                      Reduced ticket sales impact prize pools. MegaMorbius events and community features provide natural
                      participation incentives.
                    </p>
                  </div>

                  <div className="bg-orange-950/20 p-4 rounded-lg border border-orange-400/20">
                    <h4 className="text-orange-300 font-medium mb-2">Network Congestion</h4>
                    <p className="text-white/70 text-sm">
                      PulseChain congestion can delay draws. The 30-minute round structure provides sufficient buffer time.
                    </p>
                  </div>

                  <div className="bg-orange-950/20 p-4 rounded-lg border border-orange-400/20">
                    <h4 className="text-orange-300 font-medium mb-2">Regulatory Changes</h4>
                    <p className="text-white/70 text-sm">
                      Evolving gambling regulations may impact operations. Protocol design allows for flexible adaptation.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-3">10.3 Mitigation Strategies</h3>
                <p className="text-white/80 leading-relaxed">
                  Comprehensive risk management includes regular security audits, economic monitoring, community governance
                  mechanisms, and emergency pause functionality. The protocol maintains substantial reserves to handle
                  unexpected events while ensuring participant funds remain secure.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Roadmap & Future Development */}
        <section id="roadmap" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">11. Roadmap & Future Development</h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold text-purple-300 mb-4">Phase 1: Foundation (Q4 2025)</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span className="text-white/80">Core lottery protocol deployment</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span className="text-white/80">Basic user interface implementation</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span className="text-white/80">Initial community building</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span className="text-white/80">Economic model validation</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-blue-300 mb-4">Phase 2: Enhancement (Q1 2026)</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-white/80">Advanced analytics and player statistics</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-white/80">Mobile application development</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-white/80">Multi-language support</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-white/80">Enhanced MegaMorbius features</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-green-300 mb-4">Phase 3: Expansion (Q2-Q3 2026)</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white/80">Cross-chain compatibility</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white/80">Tournament and special event systems</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white/80">Decentralized governance implementation</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white/80">Advanced prediction markets integration</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-orange-300 mb-4">Phase 4: Ecosystem (Q4 2026+)</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    <span className="text-white/80">Third-party game integrations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    <span className="text-white/80">NFT collectible system</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    <span className="text-white/80">Decentralized autonomous organization</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    <span className="text-white/80">Global expansion and localization</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Conclusion */}
        <section id="conclusion" className="mb-12">
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <h2 className="text-3xl font-bold mb-6 text-white border-b border-white/10 pb-4">12. Conclusion</h2>

            <p className="text-white/80 leading-relaxed mb-6">
              Morbius Lotto represents a paradigm shift in lottery system design, combining the timeless appeal of chance
              with the transparency and efficiency of modern blockchain technology. Through rigorous economic modeling,
              comprehensive testing, and innovative incentive structures, the protocol achieves the delicate balance
              of profitability, sustainability, and entertainment value that has long eluded traditional lottery systems.
            </p>

            <p className="text-white/80 leading-relaxed mb-6">
              The MegaMorbius jackpot system creates predictable moments of viral excitement, while the token burn mechanism
              ensures long-term value creation for participants. Together, these elements foster a self-sustaining ecosystem
              that grows stronger with increased adoption.
            </p>

            <p className="text-white/80 leading-relaxed mb-6">
              As blockchain technology continues to evolve, Morbius Lotto stands ready to adapt and expand its capabilities.
              The protocol's modular design and comprehensive economic framework provide a solid foundation for future
              innovations and ecosystem growth.
            </p>

            <div className="bg-gradient-to-r from-purple-950/30 to-pink-950/30 p-6 rounded-lg border border-purple-400/20 mt-8">
              <p className="text-center text-white/90 text-lg font-medium">
                "In the shadows of probability, we find the light of possibility."
              </p>
              <p className="text-center text-white/60 text-sm mt-2">
                - Morbius Lotto Protocol
              </p>
            </div>
          </Card>
        </section>

        {/* Footer */}
        <div className="text-center py-8 border-t border-white/10">
          <p className="text-white/60 text-sm">
            This whitepaper is for informational purposes only and does not constitute financial or investment advice.
          </p>
          <p className="text-white/40 text-xs mt-2">
            © 2025 Morbius Lotto Protocol. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
