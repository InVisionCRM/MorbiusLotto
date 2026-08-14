'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isAdminWallet } from '@/lib/admin';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  LayoutGrid,
  Heart,
  Settings,
  ShieldX,
  FileCode,
  MessageSquare,
  ImageIcon,
  Flag,
  Gift,
  Droplets,
  Megaphone,
  Package,
  ArrowDownUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import AdminPlayerLookup from '@/components/admin/AdminPlayerLookup';

const AdminTablesTab = dynamic(() => import('@/components/admin/AdminTablesTab'));
const AdminCosmeticsTab = dynamic(() => import('@/components/admin/AdminCosmeticsTab'));
const AdminAdvertisingTab = dynamic(() => import('@/components/admin/AdminAdvertisingTab'));
const AdminHealthTab = dynamic(() => import('@/components/admin/AdminHealthTab'));
const AdminConfigTab = dynamic(() => import('@/components/admin/AdminConfigTab'));
const AdminContractsTab = dynamic(() => import('@/components/admin/AdminContractsTab'));
const AdminChatTab = dynamic(() => import('@/components/admin/AdminChatTab'));
const AdminMemesTab = dynamic(() => import('@/components/admin/AdminMemesTab'));
const AdminReportsTab = dynamic(() => import('@/components/admin/AdminReportsTab'));
const AdminLPStakingTab = dynamic(() => import('@/components/admin/AdminLPStakingTab'));
const AdminMerkleDropsTab = dynamic(() => import('@/components/admin/AdminMerkleDropsTab'));
const AdminBJMultiTab = dynamic(() => import('@/components/admin/AdminBJMultiTab'));
const AdminBJSingleTab = dynamic(() => import('@/components/admin/AdminBJSingleTab'));
const AdminPendingTransfersTab = dynamic(
  () => import('@/components/admin/AdminPendingTransfersTab')
);
const AdminReferralsTab = dynamic(() => import('@/components/admin/AdminReferralsTab'));

type AdminTabValue =
  | 'tables'
  | 'health'
  | 'config'
  | 'contracts'
  | 'pending-transfers'
  | 'chat'
  | 'memes'
  | 'reports'
  | 'drops'
  | 'lp-staking'
  | 'advertising'
  | 'cosmetics'
  | 'referrals'
  | 'bj-multi'
  | 'bj-single';

type AdminTabDefinition = {
  value: AdminTabValue;
  label: string;
  accentClass: string;
  icon?: LucideIcon;
  Component: React.ComponentType;
};

const ADMIN_TABS: AdminTabDefinition[] = [
  { value: 'tables', label: 'Tables', icon: LayoutGrid, accentClass: 'data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white', Component: AdminTablesTab },
  { value: 'health', label: 'Health', icon: Heart, accentClass: 'data-[state=active]:bg-emerald-600/80 data-[state=active]:text-white', Component: AdminHealthTab },
  { value: 'config', label: 'Config', icon: Settings, accentClass: 'data-[state=active]:bg-amber-600/80 data-[state=active]:text-white', Component: AdminConfigTab },
  { value: 'contracts', label: 'Contracts', icon: FileCode, accentClass: 'data-[state=active]:bg-blue-600/80 data-[state=active]:text-white', Component: AdminContractsTab },
  { value: 'pending-transfers', label: 'Pending', icon: ArrowDownUp, accentClass: 'data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white', Component: AdminPendingTransfersTab },
  { value: 'chat', label: 'Chat', icon: MessageSquare, accentClass: 'data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white', Component: AdminChatTab },
  { value: 'memes', label: 'Memes', icon: ImageIcon, accentClass: 'data-[state=active]:bg-pink-600/80 data-[state=active]:text-white', Component: AdminMemesTab },
  { value: 'reports', label: 'Reports', icon: Flag, accentClass: 'data-[state=active]:bg-red-600/80 data-[state=active]:text-white', Component: AdminReportsTab },
  { value: 'drops', label: 'Drops', icon: Gift, accentClass: 'data-[state=active]:bg-emerald-600/80 data-[state=active]:text-white', Component: AdminMerkleDropsTab },
  { value: 'lp-staking', label: 'LP', icon: Droplets, accentClass: 'data-[state=active]:bg-blue-600/80 data-[state=active]:text-white', Component: AdminLPStakingTab },
  { value: 'advertising', label: 'Ads', icon: Megaphone, accentClass: 'data-[state=active]:bg-amber-600/80 data-[state=active]:text-white', Component: AdminAdvertisingTab },
  { value: 'cosmetics', label: 'Items', icon: Package, accentClass: 'data-[state=active]:bg-purple-600/80 data-[state=active]:text-white', Component: AdminCosmeticsTab },
  { value: 'referrals', label: 'Referrals', icon: Users, accentClass: 'data-[state=active]:bg-purple-600/80 data-[state=active]:text-white', Component: AdminReferralsTab },
  { value: 'bj-multi', label: 'BJ Multi', accentClass: 'data-[state=active]:bg-red-700/80 data-[state=active]:text-white', Component: AdminBJMultiTab },
  { value: 'bj-single', label: 'BJ 1P', accentClass: 'data-[state=active]:bg-rose-600/80 data-[state=active]:text-white', Component: AdminBJSingleTab },
];

const ADMIN_TAB_VALUES = new Set<AdminTabValue>(ADMIN_TABS.map((tab) => tab.value));

function isAdminTabValue(value: string | null): value is AdminTabValue {
  return value != null && ADMIN_TAB_VALUES.has(value as AdminTabValue);
}

function AdminPageContent() {
  const { address } = useAccount();
  const isAdmin = isAdminWallet(address);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialTab = useMemo<AdminTabValue>(() => {
    const tabParam = searchParams.get('tab');
    return isAdminTabValue(tabParam) ? tabParam : 'tables';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<AdminTabValue>(initialTab);

  useEffect(() => {
    if (initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, activeTab]);

  const handleTabChange = (nextTab: string) => {
    if (!isAdminTabValue(nextTab)) return;
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!isAdmin) {
    return (
      <GlobalMainNav page="home" showBackArrow backArrowHref="/" backArrowLabel="Back to Home">
        <div className="min-h-screen bg-slate-800 text-white flex flex-col items-center justify-center p-4 pt-4 md:pt-2">
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
        <AdminPlayerLookup />
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="h-auto w-full flex flex-wrap bg-slate-800/80 border border-slate-700/50 rounded-md p-0.5 text-xs gap-0.5">
            {ADMIN_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`rounded py-1.5 text-[11px] sm:text-xs ${tab.accentClass}`}
                >
                  {Icon ? <Icon className="w-3 h-3 mr-1 hidden sm:inline" /> : null}
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {ADMIN_TABS.map((tab) => {
            const TabComponent = tab.Component;
            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-3 focus-visible:outline-none">
                <TabComponent />
              </TabsContent>
            );
          })}
        </Tabs>
        </main>
      </div>
    </GlobalMainNav>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <AdminPageContent />
    </Suspense>
  );
}
