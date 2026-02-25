'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { MORBIUS_STAKING_ADDRESS, MORBIUS_STAKING_DEPLOY_BLOCK, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { morbiusStakingAbi } from '@/abi/morbius-staking';
import { ERC20_ABI } from '@/abi/erc20';
import { Loader2, RefreshCw, Coins, Users, ArrowUpCircle, ArrowDownCircle, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STAKING_ADDRESS = MORBIUS_STAKING_ADDRESS as `0x${string}`;
const TOKEN_ADDRESS = MORBIUS_TOKEN_ADDRESS as `0x${string}`;

const STAKED_EVENT = parseAbiItem('event Staked(address indexed user, uint256 amount)');
const UNSTAKED_EVENT = parseAbiItem('event Unstaked(address indexed user, uint256 amount, uint256 fee)');
const CLAIMED_EVENT = parseAbiItem('event Claimed(address indexed user, uint256 amount)');

const LOOKBACK_BLOCKS = 2000n;

type EventAction = 'Stake' | 'Unstake' | 'Claim';

interface StakingEvent {
  id: string;
  action: EventAction;
  user: string;
  amount: bigint;
  fee: bigint;
  blockNumber: bigint;
  txHash: string;
  timestamp: number;
}

const EMBOSSED_PANEL = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
};

function fmt(val: bigint): string {
  return Math.floor(Number(formatEther(val))).toLocaleString();
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AdminStakingTab() {
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<StakingEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [filter, setFilter] = useState<EventAction | 'All'>('All');

  // Contract reads
  const { data: totalStaked, isLoading: loadingTotal } = useReadContract({
    address: STAKING_ADDRESS,
    abi: morbiusStakingAbi,
    functionName: 'totalStaked',
  });
  const { data: stakerCount, isLoading: loadingStakers } = useReadContract({
    address: STAKING_ADDRESS,
    abi: morbiusStakingAbi,
    functionName: 'totalStakers',
  });
  const { data: pendingRewards, isLoading: loadingPending } = useReadContract({
    address: STAKING_ADDRESS,
    abi: morbiusStakingAbi,
    functionName: 'totalPendingRewards',
  });
  const { data: rewardPerToken, isLoading: loadingRPT } = useReadContract({
    address: STAKING_ADDRESS,
    abi: morbiusStakingAbi,
    functionName: 'rewardPerTokenStored',
  });
  // Contract's actual MORBIUS balance
  const { data: contractBalance, isLoading: loadingBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [STAKING_ADDRESS],
  });

  const totalStakedBal = (totalStaked ?? 0n) as bigint;
  const totalStakerNum = Number(stakerCount ?? 0n);
  const totalPending = (pendingRewards ?? 0n) as bigint;
  const rptStored = (rewardPerToken ?? 0n) as bigint;
  const totalDistributed = totalStakedBal > 0n ? (rptStored * totalStakedBal) / BigInt(1e18) : 0n;
  const contractBal = (contractBalance ?? 0n) as bigint;

  // Fetch global events (no user filter)
  const fetchEvents = useCallback(async () => {
    if (!publicClient) return;
    setLoadingEvents(true);
    try {
      const currentBlock = await publicClient.getBlockNumber();
      const deployBlock = BigInt(MORBIUS_STAKING_DEPLOY_BLOCK);
      const fromBlock = currentBlock - LOOKBACK_BLOCKS > deployBlock ? currentBlock - LOOKBACK_BLOCKS : deployBlock;

      const [stakeLogs, unstakeLogs, claimLogs] = await Promise.all([
        publicClient.getLogs({ address: STAKING_ADDRESS, event: STAKED_EVENT, fromBlock, toBlock: currentBlock }).catch(() => []),
        publicClient.getLogs({ address: STAKING_ADDRESS, event: UNSTAKED_EVENT, fromBlock, toBlock: currentBlock }).catch(() => []),
        publicClient.getLogs({ address: STAKING_ADDRESS, event: CLAIMED_EVENT, fromBlock, toBlock: currentBlock }).catch(() => []),
      ]);

      const allLogs: { log: any; action: EventAction }[] = [
        ...stakeLogs.map((log) => ({ log, action: 'Stake' as EventAction })),
        ...unstakeLogs.map((log) => ({ log, action: 'Unstake' as EventAction })),
        ...claimLogs.map((log) => ({ log, action: 'Claim' as EventAction })),
      ];

      // Fetch block timestamps
      const uniqueBlocks = [...new Set(allLogs.map((l) => l.log.blockNumber).filter(Boolean))];
      const blockTimestamps = new Map<bigint, number>();
      await Promise.all(
        uniqueBlocks.map(async (blockNum) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: blockNum });
            blockTimestamps.set(blockNum, Number(block.timestamp) * 1000);
          } catch {
            blockTimestamps.set(blockNum, Date.now() - Number(currentBlock - blockNum) * 2000);
          }
        }),
      );

      const entries: StakingEvent[] = [];
      for (const { log, action } of allLogs) {
        const args = log.args as any;
        const amount = args?.amount as bigint;
        const user = args?.user as string;
        if (!amount || amount <= 0n || !user) continue;
        const blockNum = log.blockNumber ?? 0n;
        entries.push({
          id: `${action.toLowerCase()}-${log.transactionHash}-${log.logIndex}`,
          action,
          user,
          amount,
          fee: action === 'Unstake' ? (args?.fee ?? 0n) : 0n,
          blockNumber: blockNum,
          txHash: log.transactionHash ?? '',
          timestamp: blockTimestamps.get(blockNum) ?? Date.now(),
        });
      }

      entries.sort((a, b) => Number(b.blockNumber - a.blockNumber));
      setEvents(entries);
    } catch (error) {
      console.error('Error fetching staking events:', error);
    } finally {
      setLoadingEvents(false);
    }
  }, [publicClient]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = filter === 'All' ? events : events.filter((e) => e.action === filter);

  // Aggregate counts
  const stakeCount = events.filter((e) => e.action === 'Stake').length;
  const unstakeCount = events.filter((e) => e.action === 'Unstake').length;
  const claimCount = events.filter((e) => e.action === 'Claim').length;
  const totalStakedVolume = events.filter((e) => e.action === 'Stake').reduce((sum, e) => sum + e.amount, 0n);
  const totalUnstakedVolume = events.filter((e) => e.action === 'Unstake').reduce((sum, e) => sum + e.amount, 0n);
  const totalClaimedVolume = events.filter((e) => e.action === 'Claim').reduce((sum, e) => sum + e.amount, 0n);
  const totalFees = events.filter((e) => e.action === 'Unstake').reduce((sum, e) => sum + e.fee, 0n);

  const Metric = ({ label, value, color = 'text-white', loading = false }: { label: string; value: string; color?: string; loading?: boolean }) => (
    <div>
      <div className="text-cyan-400/80 text-[10px] font-medium uppercase tracking-wider mb-0.5">{label}</div>
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500/40" />
      ) : (
        <div className={`font-mono text-sm font-bold ${color}`}>{value}</div>
      )}
    </div>
  );

  const filterBtns: { label: string; value: EventAction | 'All' }[] = [
    { label: 'All', value: 'All' },
    { label: 'Stakes', value: 'Stake' },
    { label: 'Unstakes', value: 'Unstake' },
    { label: 'Claims', value: 'Claim' },
  ];

  return (
    <div className="space-y-3">
      {/* Protocol Overview */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-cyan-400" /> Staking Overview
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-400 hover:text-white" onClick={fetchEvents} disabled={loadingEvents}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loadingEvents ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div className="rounded-lg border border-cyan-500/30 p-3" style={EMBOSSED_PANEL}>
              <Metric label="Total Staked" value={fmt(totalStakedBal)} color="text-white" loading={loadingTotal} />
            </div>
            <div className="rounded-lg border border-cyan-500/30 p-3" style={EMBOSSED_PANEL}>
              <Metric label="Contract Balance" value={fmt(contractBal)} color="text-cyan-400" loading={loadingBalance} />
            </div>
            <div className="rounded-lg border border-cyan-500/30 p-3" style={EMBOSSED_PANEL}>
              <Metric label="Stakers" value={totalStakerNum.toLocaleString()} color="text-white" loading={loadingStakers} />
            </div>
            <div className="rounded-lg border border-cyan-500/30 p-3" style={EMBOSSED_PANEL}>
              <Metric label="Reward Pool" value={fmt(totalPending)} color="text-emerald-400" loading={loadingPending} />
            </div>
            <div className="rounded-lg border border-cyan-500/30 p-3" style={EMBOSSED_PANEL}>
              <Metric label="Distributed" value={fmt(totalDistributed)} color="text-amber-400" loading={loadingRPT || loadingTotal} />
            </div>
            <div className="rounded-lg border border-cyan-500/30 p-3" style={EMBOSSED_PANEL}>
              <Metric label="Unstake Fees" value={fmt(totalFees)} color="text-yellow-400" loading={loadingEvents} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Volume */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            Recent Activity <span className="text-[10px] text-slate-500 font-normal">(last ~2000 blocks)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-green-500/20 bg-green-950/10 p-3 text-center">
              <ArrowUpCircle className="w-4 h-4 text-green-400 mx-auto mb-1" />
              <div className="text-[10px] uppercase tracking-wider text-green-400/60 mb-0.5">Stakes</div>
              <div className="font-mono text-sm font-bold text-green-400">{stakeCount}</div>
              <div className="text-[10px] text-white/30 mt-0.5">{fmt(totalStakedVolume)} MORB</div>
            </div>
            <div className="rounded-lg border border-orange-500/20 bg-orange-950/10 p-3 text-center">
              <ArrowDownCircle className="w-4 h-4 text-orange-400 mx-auto mb-1" />
              <div className="text-[10px] uppercase tracking-wider text-orange-400/60 mb-0.5">Unstakes</div>
              <div className="font-mono text-sm font-bold text-orange-400">{unstakeCount}</div>
              <div className="text-[10px] text-white/30 mt-0.5">{fmt(totalUnstakedVolume)} MORB</div>
            </div>
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 text-center">
              <Gift className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <div className="text-[10px] uppercase tracking-wider text-cyan-400/60 mb-0.5">Claims</div>
              <div className="font-mono text-sm font-bold text-cyan-400">{claimCount}</div>
              <div className="text-[10px] text-white/30 mt-0.5">{fmt(totalClaimedVolume)} MORB</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Log */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            Event Log
          </CardTitle>
          <div className="flex gap-1">
            {filterBtns.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setFilter(btn.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  filter === btn.value
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="py-0 px-0">
          {loadingEvents ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-500/40" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">No events found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold h-8 px-3">Type</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold h-8 px-3">Date / Time</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold h-8 px-3">Address</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold h-8 px-3 text-right">Amount</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold h-8 px-3 text-right">Fee</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold h-8 px-3">Tx Hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((entry) => (
                    <TableRow key={entry.id} className="border-slate-700/30 hover:bg-slate-800/40">
                      <TableCell className="py-1.5 px-3">
                        <span className={`text-[11px] font-semibold ${
                          entry.action === 'Stake' ? 'text-green-400' :
                          entry.action === 'Unstake' ? 'text-orange-400' :
                          'text-cyan-400'
                        }`}>
                          {entry.action}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-[11px] text-slate-300 whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                        <span className="text-slate-500">{new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                      </TableCell>
                      <TableCell className="py-1.5 px-3">
                        <a
                          href={`https://scan.pulsechain.com/address/${entry.user}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-cyan-400/70 hover:text-cyan-300 transition-colors"
                          title={entry.user}
                        >
                          {shortAddr(entry.user)}
                        </a>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right text-[11px] font-mono text-white/80 whitespace-nowrap">
                        {fmt(entry.amount)}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right text-[11px] font-mono text-white/40 whitespace-nowrap">
                        {entry.fee > 0n ? fmt(entry.fee) : '—'}
                      </TableCell>
                      <TableCell className="py-1.5 px-3">
                        <a
                          href={`https://scan.pulsechain.com/tx/${entry.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-cyan-400/50 hover:text-cyan-300 transition-colors break-all"
                        >
                          {entry.txHash}
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
