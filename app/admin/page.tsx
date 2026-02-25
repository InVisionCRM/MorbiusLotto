'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { isAdminWallet } from '@/lib/admin';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutGrid, Heart, BarChart3, Settings, ShieldX, FileCode, Wallet, MessageSquare, ImageIcon, Flag, Coins, Gift } from 'lucide-react';
import AdminTablesTab from '@/components/admin/AdminTablesTab';
import AdminHealthTab from '@/components/admin/AdminHealthTab';
import AdminMetricsTab from '@/components/admin/AdminMetricsTab';
import AdminConfigTab from '@/components/admin/AdminConfigTab';
import AdminContractsTab from '@/components/admin/AdminContractsTab';
import { AdminEscrowTab } from '@/components/admin/AdminEscrowTab';
import AdminChatTab from '@/components/admin/AdminChatTab';
import AdminMemesTab from '@/components/admin/AdminMemesTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';
import AdminStakingTab from '@/components/admin/AdminStakingTab';
import AdminMerkleDropsTab from '@/components/admin/AdminMerkleDropsTab';

export default function AdminPage() {
  const { address } = useAccount();
  const isAdmin = isAdminWallet(address);
  const [activeTab, setActiveTab] = useState('tables');

  if (!isAdmin) {
    return (
      <GlobalMainNav page="home" showBackArrow backArrowHref="/" backArrowLabel="Back to Home">
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 pt-4 md:pt-2">
          <ShieldX className="w-12 h-12 text-red-400/80 mb-3" />
          <h1 className="text-lg font-semibold text-slate-200">Access denied</h1>
          <p className="text-xs text-slate-500 mt-1">Admin wallet required.</p>
          <Link href="/" className="mt-4">
            <Button variant="outline" size="sm" className="text-xs border-slate-600 text-slate-300">
              <ArrowLeft className="w-3 h-3 mr-1" /> Back
            </Button>
          </Link>
        </div>
      </GlobalMainNav>
    );
  }

  return (
    <GlobalMainNav page="home" showBackArrow backArrowHref="/" backArrowLabel="Back to Home">
      <div className="min-h-screen bg-slate-950 text-white pt-4 md:pt-2">
        <main className="container mx-auto px-3 py-3 max-w-6xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-8 w-full grid grid-cols-8 sm:grid-cols-11 bg-slate-800/80 border border-slate-700/50 rounded-md p-0.5 text-xs">
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
            <TabsTrigger value="contracts" className="rounded data-[state=active]:bg-blue-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <FileCode className="w-3 h-3 mr-1 hidden sm:inline" /> Contracts
            </TabsTrigger>
            <TabsTrigger value="escrow" className="rounded data-[state=active]:bg-yellow-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <Wallet className="w-3 h-3 mr-1 hidden sm:inline" /> Escrow
            </TabsTrigger>
            <TabsTrigger value="chat" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <MessageSquare className="w-3 h-3 mr-1 hidden sm:inline" /> Chat
            </TabsTrigger>
            <TabsTrigger value="memes" className="rounded data-[state=active]:bg-pink-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <ImageIcon className="w-3 h-3 mr-1 hidden sm:inline" /> Memes
            </TabsTrigger>
            <TabsTrigger value="staking" className="rounded data-[state=active]:bg-teal-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <Coins className="w-3 h-3 mr-1 hidden sm:inline" /> Staking
            </TabsTrigger>
            <TabsTrigger value="reports" className="rounded data-[state=active]:bg-red-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <Flag className="w-3 h-3 mr-1 hidden sm:inline" /> Reports
            </TabsTrigger>
            <TabsTrigger value="drops" className="rounded data-[state=active]:bg-emerald-600/80 data-[state=active]:text-white py-1.5 text-[11px] sm:text-xs">
              <Gift className="w-3 h-3 mr-1 hidden sm:inline" /> Drops
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tables" className="mt-3 focus-visible:outline-none">
            <AdminTablesTab />
          </TabsContent>

          <TabsContent value="health" className="mt-3 focus-visible:outline-none">
            <AdminHealthTab />
          </TabsContent>

          <TabsContent value="metrics" className="mt-3 focus-visible:outline-none">
            <AdminMetricsTab />
          </TabsContent>

          <TabsContent value="config" className="mt-3 focus-visible:outline-none">
            <AdminConfigTab />
          </TabsContent>

          <TabsContent value="contracts" className="mt-3 focus-visible:outline-none">
            <AdminContractsTab />
          </TabsContent>

          <TabsContent value="escrow" className="mt-3 focus-visible:outline-none">
            <AdminEscrowTab />
          </TabsContent>

          <TabsContent value="chat" className="mt-3 focus-visible:outline-none">
            <AdminChatTab />
          </TabsContent>

          <TabsContent value="memes" className="mt-3 focus-visible:outline-none">
            <AdminMemesTab />
          </TabsContent>

          <TabsContent value="staking" className="mt-3 focus-visible:outline-none">
            <AdminStakingTab />
          </TabsContent>

          <TabsContent value="reports" className="mt-3 focus-visible:outline-none">
            <AdminReportsTab />
          </TabsContent>

          <TabsContent value="drops" className="mt-3 focus-visible:outline-none">
            <AdminMerkleDropsTab />
          </TabsContent>
        </Tabs>
        </main>
      </div>
    </GlobalMainNav>
  );
}
