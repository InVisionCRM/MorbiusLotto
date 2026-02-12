'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { isAdminWallet } from '@/lib/admin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutGrid, Heart, BarChart3, Settings, ShieldX } from 'lucide-react';
import AdminTablesTab from '@/components/admin/AdminTablesTab';

export default function AdminPage() {
  const { address } = useAccount();
  const isAdmin = isAdminWallet(address);
  const [activeTab, setActiveTab] = useState('tables');

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <ShieldX className="w-12 h-12 text-red-400/80 mb-3" />
        <h1 className="text-lg font-semibold text-slate-200">Access denied</h1>
        <p className="text-xs text-slate-500 mt-1">Admin wallet required.</p>
        <Link href="/" className="mt-4">
          <Button variant="outline" size="sm" className="text-xs border-slate-600 text-slate-300">
            <ArrowLeft className="w-3 h-3 mr-1" /> Back
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="container mx-auto px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-sm font-semibold text-slate-100">Admin</h1>
          </div>
          <span className="text-[10px] text-slate-500 truncate max-w-[120px] sm:max-w-[200px]" title={address}>
            {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'}
          </span>
        </div>
      </header>

      <main className="container mx-auto px-3 py-3 max-w-6xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-8 w-full grid grid-cols-4 bg-slate-800/80 border border-slate-700/50 rounded-md p-0.5 text-xs">
            <TabsTrigger value="tables" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <LayoutGrid className="w-3 h-3 mr-1 hidden sm:inline" /> Tables
            </TabsTrigger>
            <TabsTrigger value="health" className="rounded data-[state=active]:bg-emerald-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <Heart className="w-3 h-3 mr-1 hidden sm:inline" /> Health
            </TabsTrigger>
            <TabsTrigger value="metrics" className="rounded data-[state=active]:bg-violet-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <BarChart3 className="w-3 h-3 mr-1 hidden sm:inline" /> Metrics
            </TabsTrigger>
            <TabsTrigger value="config" className="rounded data-[state=active]:bg-amber-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <Settings className="w-3 h-3 mr-1 hidden sm:inline" /> Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tables" className="mt-3 focus-visible:outline-none">
            <AdminTablesTab />
          </TabsContent>

          <TabsContent value="health" className="mt-3 focus-visible:outline-none">
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium text-slate-200">Game health</CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3 text-xs text-slate-500">
                API, WebSocket, RPC status. MORBIUS reserves per contract; Blackjack addresses with reserve &gt; 0. (Health UI next.)
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metrics" className="mt-3 focus-visible:outline-none">
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium text-slate-200">Metrics</CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3 text-xs text-slate-500">
                Volume (MORBIUS), games/hour, active players, PnL, tournament entries. Time range: 24h / 7d / 30d / All. (Charts next.)
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="mt-3 focus-visible:outline-none">
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium text-slate-200">Config</CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3 text-xs text-slate-500">
                Min/max bet, fee %, feature flags per game. (Config form next.)
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
