'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Header } from '@/components/lottery/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LotteryContractInterface } from '@/components/contracts/lottery-interface'
import { KenoContractInterface } from '@/components/contracts/keno-interface'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function ContractsPage() {
  const { address, isConnected } = useAccount()
  const [activeTab, setActiveTab] = useState('lottery')

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{
        backgroundImage: "linear-gradient(rgba(2, 6, 23, 0.95), rgba(2, 6, 23, 0.95)), url('/morbius/Morbiusbg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <Header nextDrawEndTime={BigInt(0)} fallbackRemaining={BigInt(0)} />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Contract Interface</h1>
          <p className="text-white/60">
            Interact with SuperStakeLottery6of55V2 and CryptoKeno contracts
          </p>
        </div>

        {/* Wallet Connection Warning */}
        {!isConnected && (
          <Alert className="mb-6 bg-yellow-500/10 border-yellow-500/20">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-500">Wallet Not Connected</AlertTitle>
            <AlertDescription className="text-white/70">
              Connect your wallet to interact with write functions. Read functions will still work.
              <div className="mt-3">
                <ConnectButton />
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md bg-black/40 border border-white/10">
            <TabsTrigger value="lottery" className="data-[state=active]:bg-purple-600">
              Lottery 6-of-55
            </TabsTrigger>
            <TabsTrigger value="keno" className="data-[state=active]:bg-purple-600">
              Crypto Keno
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lottery" className="space-y-6">
            <Card className="bg-black/50 border-white/10">
              <CardHeader>
                <CardTitle>SuperStakeLottery6of55V2</CardTitle>
                <CardDescription className="text-white/60">
                  6-of-55 lottery with WPLS payment support, smart rollovers, and MegaMorbius jackpot
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LotteryContractInterface address={address} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="keno" className="space-y-6">
            <Card className="bg-black/50 border-white/10">
              <CardHeader>
                <CardTitle>CryptoKeno</CardTitle>
                <CardDescription className="text-white/60">
                  20-of-80 Keno with multi-draw tickets, add-ons, and progressive jackpot
                </CardDescription>
              </CardHeader>
              <CardContent>
                <KenoContractInterface address={address} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}






