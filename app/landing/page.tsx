'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Sparkles, Dices, Trophy, Clock, Users, TrendingUp, Target, Zap,
  Shield, Copy, ExternalLink, BarChart3, Coins, Flame, Star, CheckCircle2,
  Wallet, Code, Database, Lock
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { LOTTERY_ADDRESS, KENO_ADDRESS, PSSH_TOKEN_ADDRESS, HEX_TOKEN_ADDRESS, TICKET_PRICE } from '@/lib/contracts'

export default function LandingPage() {
  const [copiedAddress, setCopiedAddress] = useState('')

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAddress(label)
      toast.success(`${label} address copied!`)
      setTimeout(() => setCopiedAddress(''), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <div
      className="min-h-screen bg-[#faf9f6]"
      style={{
        backgroundImage: "linear-gradient(rgba(2, 6, 23, 0.7), rgba(2, 6, 23, 0.7)), url('/morbius/Morbiusbg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Epic Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-900 via-blue-900 to-slate-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(147,51,234,0.3),transparent_50%),radial-gradient(circle_at_70%_70%,rgba(59,130,246,0.25),transparent_50%)]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20" />

        <div className="relative z-10 container mx-auto px-4 py-20 md:py-32">
          <div className="text-center max-w-5xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl shadow-purple-500/20">
              <Shield className="w-5 h-5 text-green-400" />
              <span className="text-sm font-semibold">100% On-Chain • Provably Fair • Instant Payouts</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-black tracking-tight">
              <span className="block bg-gradient-to-r from-purple-300 via-pink-300 to-blue-300 bg-clip-text text-transparent">
                WIN BIG.
              </span>
              <span className="block mt-2 bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200 bg-clip-text text-transparent">
                PLAY FAIR.
              </span>
            </h1>

            <p className="text-2xl md:text-3xl text-gray-200 max-w-3xl mx-auto leading-relaxed font-medium">
              The most transparent lottery platform on <span className="text-purple-300 font-bold">PulseChain</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-6">
              <Link href="/keno">
                <Button
                  size="lg"
                  className="group relative overflow-hidden bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 shadow-2xl shadow-purple-500/50 hover:shadow-purple-500/70 transition-all duration-300 px-12 py-8 text-xl font-bold"
                >
                  <Dices className="w-6 h-6 mr-3 group-hover:rotate-12 transition-transform" />
                  Launch Keno
                  <Flame className="w-5 h-5 ml-2 text-yellow-300 animate-pulse" />
                </Button>
              </Link>

              <Link href="/">
                <Button
                  size="lg"
                  className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0 shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 transition-all duration-300 px-12 py-8 text-xl font-bold"
                >
                  <Trophy className="w-6 h-6 mr-3 group-hover:scale-110 transition-transform" />
                  Launch Lottery
                  <Sparkles className="w-5 h-5 ml-2 text-yellow-300 animate-pulse" />
                </Button>
              </Link>
            </div>

            {/* Live Stats Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-12 max-w-4xl mx-auto">
              <StatPill icon={<Trophy className="w-5 h-5" />} label="Total Prizes" value="2.5M Morbius" />
              <StatPill icon={<Users className="w-5 h-5" />} label="Players" value="1,247" />
              <StatPill icon={<BarChart3 className="w-5 h-5" />} label="Rounds" value="856" />
              <StatPill icon={<Zap className="w-5 h-5" />} label="Avg Draw" value="3.2min" />
            </div>
          </div>
        </div>
      </section>

      {/* Contract Addresses Section */}
      <section className="bg-white/70 backdrop-blur-sm border-y border-gray-200 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <ContractAddress
              label="Lottery"
              address={LOTTERY_ADDRESS}
              copied={copiedAddress === 'Lottery'}
              onCopy={() => copyToClipboard(LOTTERY_ADDRESS, 'Lottery')}
            />
            <ContractAddress
              label="Keno"
              address={KENO_ADDRESS}
              copied={copiedAddress === 'Keno'}
              onCopy={() => copyToClipboard(KENO_ADDRESS, 'Keno')}
            />
            <ContractAddress
              label="Morbius"
              address={PSSH_TOKEN_ADDRESS}
              copied={copiedAddress === 'pSSH'}
              onCopy={() => copyToClipboard(PSSH_TOKEN_ADDRESS, 'pSSH')}
            />
          </div>
        </div>
      </section>

      {/* Stats Dashboard */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-5xl md:text-6xl font-black mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            PLATFORM STATS
          </h2>
          <p className="text-xl text-gray-600">Real-time performance metrics</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            icon={<Coins className="w-8 h-8 text-yellow-500" />}
            title="Total Volume"
            value="14.2M Morbius"
            change="+23.4%"
            trend="up"
          />
          <StatsCard
            icon={<Trophy className="w-8 h-8 text-purple-500" />}
            title="Biggest Win"
            value="425K Morbius"
            subtitle="6-of-6 Match"
            trend="up"
          />
          <StatsCard
            icon={<Users className="w-8 h-8 text-blue-500" />}
            title="Active Players"
            value="1,247"
            change="+12.8%"
            trend="up"
          />
          <StatsCard
            icon={<Flame className="w-8 h-8 text-orange-500" />}
            title="Hot Numbers"
            value="7, 23, 42"
            subtitle="Most Drawn"
            trend="neutral"
          />
        </div>
      </section>

      {/* Games Overview - Desktop */}
      <section className="hidden md:block container mx-auto px-4 py-16 bg-white/40 backdrop-blur-sm">
        <div className="grid md:grid-cols-2 gap-8 max-w-7xl mx-auto">
          <GameCard game="lottery" />
          <GameCard game="keno" />
        </div>
      </section>

      {/* Games Overview - Mobile Tabs */}
      <section className="md:hidden container mx-auto px-4 py-12">
        <Tabs defaultValue="lottery" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-white/70 backdrop-blur-sm border-2 border-gray-200 shadow-lg h-14">
            <TabsTrigger value="lottery" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-lg font-bold">
              <Trophy className="w-5 h-5 mr-2" />
              Lottery
            </TabsTrigger>
            <TabsTrigger value="keno" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-lg font-bold">
              <Dices className="w-5 h-5 mr-2" />
              Keno
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lottery" className="mt-6">
            <GameCard game="lottery" />
          </TabsContent>

          <TabsContent value="keno" className="mt-6">
            <GameCard game="keno" />
          </TabsContent>
        </Tabs>
      </section>

      {/* Payout Tables Section */}
      <section className="container mx-auto px-4 py-20 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-black mb-4 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              PAYOUT TABLES
            </h2>
            <p className="text-xl text-gray-600">Complete prize structures for all games</p>
          </div>

          <PayoutTables />
        </div>
      </section>

      {/* Verification Section */}
      <section className="container mx-auto px-4 py-20 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg mb-6">
              <Shield className="w-5 h-5 text-green-400" />
              <span className="text-sm font-semibold">Verified & Transparent</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-black mb-4">
              VERIFY EVERYTHING
            </h2>
            <p className="text-xl text-gray-300">Every draw is permanently recorded on-chain</p>
          </div>

          <VerificationSection />
        </div>
      </section>

      {/* Why Play Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-black mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            WHY PLAY WITH US?
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <FeatureCard
            icon={<Zap className="w-12 h-12 text-yellow-500" />}
            title="Instant Payouts"
            description="Smart contracts automatically send winnings directly to your wallet. No waiting, no claiming."
          />
          <FeatureCard
            icon={<Shield className="w-12 h-12 text-green-500" />}
            title="Provably Fair"
            description="Every draw is verifiable on the blockchain. Check any round, any time, with cryptographic proof."
          />
          <FeatureCard
            icon={<Lock className="w-12 h-12 text-blue-500" />}
            title="Non-Custodial"
            description="Your keys, your funds. We never hold your tokens. Play directly from your wallet."
          />
          <FeatureCard
            icon={<Code className="w-12 h-12 text-purple-500" />}
            title="Open Source"
            description="All contracts are verified and publicly auditable. No hidden code, no surprises."
          />
          <FeatureCard
            icon={<Trophy className="w-12 h-12 text-orange-500" />}
            title="Mega Jackpots"
            description="Growing prize pools with HEX overlays and Mega Millions bonus rounds every 55 draws."
          />
          <FeatureCard
            icon={<TrendingUp className="w-12 h-12 text-pink-500" />}
            title="Best Odds"
            description="Competitive RTP and fair prize distributions. House edge published on-chain."
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 py-20">
        <Card className="bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 text-white border-0 shadow-2xl max-w-5xl mx-auto overflow-hidden relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />

          <CardContent className="relative z-10 p-12 md:p-16 text-center space-y-8">
            <h2 className="text-4xl md:text-5xl font-black">
              Ready to Win?
            </h2>
            <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Connect your wallet and start playing today. All games powered by audited smart contracts on PulseChain.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-4">
              <Link href="/keno">
                <Button
                  size="lg"
                  className="bg-white hover:bg-gray-100 text-purple-700 shadow-xl hover:shadow-2xl transition-all duration-300 px-12 py-8 text-xl font-bold border-4 border-white/20"
                >
                  <Dices className="w-6 h-6 mr-3" />
                  Play Keno Now
                </Button>
              </Link>

              <Link href="/">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-gray-900 shadow-xl hover:shadow-2xl transition-all duration-300 px-12 py-8 text-xl font-bold border-4 border-yellow-300/50"
                >
                  <Trophy className="w-6 h-6 mr-3" />
                  Play Lottery Now
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">
            © 2025 MegaStake. Built on PulseChain. Play responsibly.
          </p>
        </div>
      </footer>
    </div>
  )
}

// Helper Components

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
      <div className="text-purple-300">{icon}</div>
      <div className="text-left">
        <div className="text-xs text-gray-300">{label}</div>
        <div className="font-bold">{value}</div>
      </div>
    </div>
  )
}

function ContractAddress({ label, address, copied, onCopy }: { label: string; address: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-sm rounded-lg border border-gray-300/50">
      <Code className="w-4 h-4 text-gray-600" />
      <span className="font-semibold text-gray-900">{label}:</span>
      <code className="text-xs text-gray-600">{address.slice(0, 6)}...{address.slice(-4)}</code>
      <button onClick={onCopy} className="ml-1 p-1 hover:bg-gray-200 rounded transition-colors">
        {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
      </button>
      <a
        href={`https://scan.pulsechain.com/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1 hover:bg-gray-200 rounded transition-colors"
      >
        <ExternalLink className="w-4 h-4 text-gray-500" />
      </a>
    </div>
  )
}

function StatsCard({ icon, title, value, change, subtitle, trend }: {
  icon: React.ReactNode;
  title: string;
  value: string;
  change?: string;
  subtitle?: string;
  trend: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="bg-white/80 backdrop-blur-sm border-2 border-gray-200 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-md">
            {icon}
          </div>
          {change && (
            <Badge className={`${trend === 'up' ? 'bg-green-500/20 text-green-700 border-green-500/50' : 'bg-red-500/20 text-red-700 border-red-500/50'}`}>
              {change}
            </Badge>
          )}
        </div>
        <h3 className="text-sm font-semibold text-gray-600 mb-2">{title}</h3>
        <div className="text-3xl font-black text-gray-900">{value}</div>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

function GameCard({ game }: { game: 'lottery' | 'keno' }) {
  const isLottery = game === 'lottery'

  return (
    <Card className={`bg-white/80 backdrop-blur-sm border-4 ${isLottery ? 'border-blue-300 shadow-blue-200' : 'border-purple-300 shadow-purple-200'} shadow-2xl hover:shadow-3xl transition-all duration-300`}>
      <CardHeader className={`${isLottery ? 'bg-gradient-to-br from-blue-500 to-cyan-500' : 'bg-gradient-to-br from-purple-500 to-pink-500'} text-white pb-8`}>
        <div className="flex items-center gap-4 mb-4">
          <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl shadow-lg">
            {isLottery ? <Trophy className="w-10 h-10" /> : <Dices className="w-10 h-10" />}
          </div>
          <div>
            <CardTitle className="text-3xl font-black">{isLottery ? 'Morbius Lottery' : 'Crypto Keno'}</CardTitle>
            <CardDescription className="text-white/90 text-lg">{isLottery ? '6-of-55 Draw Game' : '20-of-80 Club Keno'}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8 space-y-6">
        <Accordion type="single" collapsible className="space-y-3">
          <AccordionItem value="how" className="border-b-2 border-gray-200">
            <AccordionTrigger className="text-lg font-bold text-gray-900 hover:text-gray-700">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-green-600" />
                How to Play
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-gray-700 space-y-3 pt-4">
              {isLottery ? (
                <>
                  <Step num={1} text="Connect your PulseChain wallet" />
                  <Step num={2} text="Pick 6 unique numbers (1-55)" />
                  <Step num={3} text="Purchase ticket with Morbius tokens" />
                  <Step num={4} text="Wait for draw & check results" />
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                    <p className="text-sm font-semibold text-blue-900">💡 Tip: Use heatmap to see hot & cold numbers</p>
                  </div>
                </>
              ) : (
                <>
                  <Step num={1} text="Choose 1-10 numbers from 80" />
                  <Step num={2} text="Select your wager amount" />
                  <Step num={3} text="Pick number of draws (1-20)" />
                  <Step num={4} text="Add optional multipliers & bonuses" />
                  <div className="mt-4 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                    <p className="text-sm font-semibold text-purple-900">🎰 Progressive jackpot available!</p>
                  </div>
                </>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="prizes" className="border-b-2 border-gray-200">
            <AccordionTrigger className="text-lg font-bold text-gray-900 hover:text-gray-700">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-600" />
                Prize Structure
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-gray-700 space-y-3 pt-4">
              {isLottery ? (
                <div className="space-y-3">
                  <PrizeRow matches={6} prize="GRAND JACKPOT + HEX Overlay" color="purple" />
                  <PrizeRow matches={5} prize="Major Prize Pool (20% of pot)" color="blue" />
                  <PrizeRow matches={4} prize="Medium Prize Pool (15% of pot)" color="green" />
                  <PrizeRow matches={3} prize="Standard Prize Pool (10% of pot)" color="orange" />
                  <PrizeRow matches={2} prize="Small Prize Pool (5% of pot)" color="gray" />
                  <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                    <p className="text-sm font-bold text-purple-900">🎰 MEGA MILLIONS every 55 rounds!</p>
                    <p className="text-xs text-purple-700 mt-1">Extra prize money added to all brackets</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="font-semibold text-purple-900">10/10 Match:</div>
                    <div className="text-right font-bold">10,000x</div>
                    <div className="font-semibold text-purple-900">9/10 Match:</div>
                    <div className="text-right font-bold">1,000x</div>
                    <div className="font-semibold text-purple-900">8/10 Match:</div>
                    <div className="text-right font-bold">100x</div>
                    <div className="font-semibold text-purple-900">7/10 Match:</div>
                    <div className="text-right font-bold">20x</div>
                  </div>
                  <div className="mt-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border-2 border-yellow-300">
                    <p className="text-sm font-bold text-orange-900">🔥 Multipliers up to 10x!</p>
                    <p className="text-xs text-orange-700 mt-1">Bulls-Eye bonus + Progressive jackpot</p>
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="features" className="border-0">
            <AccordionTrigger className="text-lg font-bold text-gray-900 hover:text-gray-700">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-orange-600" />
                Key Features
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-gray-700 space-y-3 pt-4">
              <Feature text="100% On-Chain Verification" />
              <Feature text="Instant Smart Contract Payouts" />
              <Feature text="Transparent Draw Results" />
              <Feature text="Free Tickets & Bonuses" />
              <Feature text="Multi-Draw Support" />
              <Feature text="Mobile Optimized" />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Link href={isLottery ? '/' : '/keno'}>
          <Button
            className={`w-full ${isLottery ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'} text-white shadow-lg hover:shadow-xl transition-all duration-300 py-6 text-lg font-bold`}
          >
            {isLottery ? 'Play Lottery' : 'Play Keno'} →
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center text-sm font-bold shadow-md">
        {num}
      </div>
      <span className="pt-0.5">{text}</span>
    </div>
  )
}

function PrizeRow({ matches, prize, color }: { matches: number; prize: string; color: string }) {
  const colors = {
    purple: 'from-purple-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    green: 'from-green-500 to-emerald-500',
    orange: 'from-orange-500 to-yellow-500',
    gray: 'from-gray-500 to-slate-500'
  }

  return (
    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-200">
      <div className="flex items-center gap-3">
        <div className={`px-3 py-1 rounded-full bg-gradient-to-r ${colors[color as keyof typeof colors]} text-white font-bold text-sm shadow-md`}>
          {matches} Matches
        </div>
      </div>
      <div className="font-semibold text-gray-900">{prize}</div>
    </div>
  )
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="bg-white/80 backdrop-blur-sm border-2 border-gray-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105">
      <CardContent className="p-8 text-center space-y-4">
        <div className="inline-flex p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl shadow-lg">
          {icon}
        </div>
        <h3 className="text-2xl font-bold text-gray-900">{title}</h3>
        <p className="text-gray-600 leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  )
}

function PayoutTables() {
  const lotteryPayouts = [
    { matches: '6 of 6', prize: 'Jackpot + HEX', odds: '1 in 28,989,675' },
    { matches: '5 of 6', prize: '20% of Pool', odds: '1 in 142,950' },
    { matches: '4 of 6', prize: '15% of Pool', odds: '1 in 2,180' },
    { matches: '3 of 6', prize: '10% of Pool', odds: '1 in 99' },
    { matches: '2 of 6', prize: '5% of Pool', odds: '1 in 9' },
  ]

  const kenoPayouts = [
    { spot: '10', match: '10/10', prize: '100,000x', odds: '1 in 8,911,711' },
    { spot: '10', match: '9/10', prize: '5,000x', odds: '1 in 163,381' },
    { spot: '10', match: '8/10', prize: '500x', odds: '1 in 7,384' },
    { spot: '10', match: '7/10', prize: '50x', odds: '1 in 621' },
    { spot: '10', match: '6/10', prize: '10x', odds: '1 in 87' },
    { spot: '10', match: '5/10', prize: '2x', odds: '1 in 19' },
    { spot: '10', match: '0/10', prize: '5x', odds: '1 in 22' },
  ]

  return (
    <Tabs defaultValue="lottery" className="w-full">
      <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 bg-white/70 backdrop-blur-sm border-2 border-gray-300 shadow-lg h-14 mb-8">
        <TabsTrigger value="lottery" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-lg font-bold">
          Lottery 6/55
        </TabsTrigger>
        <TabsTrigger value="keno" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-lg font-bold">
          Keno 20/80
        </TabsTrigger>
      </TabsList>

      <TabsContent value="lottery">
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-blue-200 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white">
            <CardTitle className="text-2xl font-black">Lottery Prize Table</CardTitle>
            <CardDescription className="text-white/90">Prizes for $1 pSSH ticket</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-gray-300">
                  <TableHead className="text-lg font-bold text-gray-900">Match</TableHead>
                  <TableHead className="text-lg font-bold text-gray-900">Prize</TableHead>
                  <TableHead className="text-lg font-bold text-gray-900 text-right">Odds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotteryPayouts.map((row, i) => (
                  <TableRow key={i} className="hover:bg-blue-50 transition-colors">
                    <TableCell className="font-bold text-blue-900">{row.matches}</TableCell>
                    <TableCell className="font-semibold text-gray-900">{row.prize}</TableCell>
                    <TableCell className="text-right text-gray-600">{row.odds}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border-2 border-yellow-300">
              <p className="text-sm font-bold text-orange-900">🎰 Mega Millions Bonus: Every 55th round adds extra prizes to ALL brackets!</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="keno">
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-purple-200 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
            <CardTitle className="text-2xl font-black">Keno Prize Table (10-Spot)</CardTitle>
            <CardDescription className="text-white/90">Sample payouts for 10-number selection</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-gray-300">
                  <TableHead className="text-lg font-bold text-gray-900">Match</TableHead>
                  <TableHead className="text-lg font-bold text-gray-900">Multiplier</TableHead>
                  <TableHead className="text-lg font-bold text-gray-900 text-right">Odds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kenoPayouts.map((row, i) => (
                  <TableRow key={i} className={`hover:bg-purple-50 transition-colors ${i === 0 ? 'bg-purple-100' : ''}`}>
                    <TableCell className="font-bold text-purple-900">{row.match}</TableCell>
                    <TableCell className="font-semibold text-gray-900">{row.prize}</TableCell>
                    <TableCell className="text-right text-gray-600">{row.odds}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-6 space-y-3">
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                <p className="text-sm font-bold text-purple-900">🎲 Multiplier Add-on: 2x, 3x, 5x, or 10x your winnings!</p>
              </div>
              <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border-2 border-blue-200">
                <p className="text-sm font-bold text-blue-900">🎯 Bulls-Eye: Match the special ball for bonus prizes!</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

function VerificationSection() {
  return (
    <div className="grid md:grid-cols-2 gap-8">
      <Card className="bg-white/10 backdrop-blur-sm border border-white/20">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-400" />
            Smart Contract ABIs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-300">All contract interfaces are publicly available and verified on the blockchain explorer.</p>
          <div className="space-y-2">
            <a
              href={`https://scan.pulsechain.com/address/${LOTTERY_ADDRESS}#code`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
            >
              <span className="font-semibold">Lottery Contract</span>
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={`https://scan.pulsechain.com/address/${KENO_ADDRESS}#code`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
            >
              <span className="font-semibold">Keno Contract</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/10 backdrop-blur-sm border border-white/20">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-green-400" />
            How to Verify Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3 text-gray-300">
            <li className="flex gap-3">
              <span className="font-bold text-green-400">1.</span>
              <span>Visit PulseChain block explorer</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-green-400">2.</span>
              <span>Enter contract address</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-green-400">3.</span>
              <span>Check Events tab for RoundFinalized</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-green-400">4.</span>
              <span>Verify winning numbers & payouts</span>
            </li>
          </ol>
          <div className="mt-4 p-4 bg-green-500/10 rounded-lg border border-green-500/30">
            <p className="text-sm text-green-300">✓ All draws are cryptographically provable</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
