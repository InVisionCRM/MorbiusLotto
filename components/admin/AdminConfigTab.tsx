'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  LOTTERY_INSTANT_ADDRESS,
  KENO_ADDRESS,
  PLINKO_ADDRESS,
  BLACKJACK_ADDRESS,
  TOURNAMENT_PRIZE_ESCROW_ADDRESS,
  MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS,
  MERKLE_CLAIM_MORBIUS_ADDRESS,
  MERKLE_CLAIM_LP_ADDRESS,
} from '@/lib/contracts';
import { INSTANT_LOTTERY_6OF55_ABI } from '@/abi/instant-lottery-6of55';
import { KENO_ABI } from '@/lib/keno-abi';
import { PLINKO_ABI } from '@/abi/plinko';
import { blackjackAbi } from '@/abi/blackjack';
import { tournamentPrizeEscrowAbi } from '@/abi/tournament-prize-escrow';
import { morbiusHolderDistributorAbi } from '@/abi/morbius-holder-distributor';
import { keccak256, toHex } from 'viem';
import { pulsechain } from 'viem/chains';
import {
  BLACKJACK_IMAGE_BACKGROUNDS,
  BLACKJACK_VIDEO_BACKGROUNDS,
  DEFAULT_BLACKJACK_IMAGE_ID,
} from '@/app/BLACKJACK/constants';

const CONFIG_KEYS = [
  { key: 'blackjack_min_bet', label: 'Blackjack min bet (wei)', placeholder: '1000000000000000000' },
  { key: 'blackjack_max_bet', label: 'Blackjack max bet (wei)', placeholder: '100000000000000000000000' },
  { key: 'blackjack_fee_percent', label: 'Blackjack fee %', placeholder: '0' },
] as const;

function morbusToWei(morbiusAmount: string): string {
  const n = Number(morbiusAmount?.replace(/,/g, '').trim());
  if (Number.isNaN(n) || n < 0) return '';
  const wei = BigInt(Math.round(n * 1e9)) * BigInt(1e9);
  return wei.toString();
}

function ContractSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader className="py-2 px-3 border-b border-slate-700/50">
        <CardTitle className="text-xs font-medium text-slate-200">{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-3 px-3 space-y-4">{children}</CardContent>
    </Card>
  );
}

function WeiCalculator() {
  const [morbiusInput, setMorbiusInput] = useState('');
  const weiResult = morbusToWei(morbiusInput);

  const copyWei = () => {
    if (!weiResult) {
      toast.error('Enter a MORBIUS amount first');
      return;
    }
    navigator.clipboard.writeText(weiResult).then(
      () => toast.success('Wei copied to clipboard'),
      () => toast.error('Copy failed')
    );
  };

  return (
    <ContractSection title="MORBIUS → Wei">
      <p className="text-[11px] text-slate-500 mb-2">Convert MORBIUS amount to wei (18 decimals) for contract calls.</p>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            inputMode="decimal"
            value={morbiusInput}
            onChange={(e) => setMorbiusInput(e.target.value)}
            placeholder="e.g. 1000 or 1.5"
            className="h-8 text-xs w-44 bg-slate-800 border-slate-600 font-mono"
          />
          <span className="text-xs text-slate-500">MORBIUS</span>
        </div>
        {weiResult ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-[11px] font-mono text-slate-300 bg-slate-800/80 border border-slate-600 rounded px-2 py-1.5 break-all max-w-full">
              {weiResult}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-600 text-slate-300 shrink-0"
              onClick={copyWei}
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              Copy
            </Button>
          </div>
        ) : null}
      </div>
    </ContractSection>
  );
}

function WriteRow({
  label,
  children,
  onExecute,
  loading,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onExecute: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="rounded border border-slate-700/50 p-3 space-y-2">
      <div className="text-[11px] font-medium text-slate-300">{label}</div>
      <div className="flex flex-wrap items-end gap-2">
        {children}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px] border-slate-600 text-slate-300"
          onClick={onExecute}
          disabled={disabled || loading}
        >
          {loading ? 'Pending…' : 'Execute'}
        </Button>
      </div>
    </div>
  );
}

function LotteryAdminSection() {
  const { address } = useAccount();
  const [minWager, setMinWager] = useState('');
  const [maxWager, setMaxWager] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [emergencyAmount, setEmergencyAmount] = useState('');
  const [plsTreasury, setPlsTreasury] = useState('');
  const [mult0, setMult0] = useState('');
  const [mult1, setMult1] = useState('');
  const [mult2, setMult2] = useState('');
  const [mult3, setMult3] = useState('');
  const [mult4, setMult4] = useState('');
  const [mult5, setMult5] = useState('');
  const [mult6, setMult6] = useState('');
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash });
  const addr = LOTTERY_INSTANT_ADDRESS as `0x${string}`;
  const write = (opts: Omit<Parameters<typeof writeContract>[0], 'chain' | 'account'>) => {
    if (!address) {
      toast.error('Connect wallet');
      return;
    }
    writeContract({ ...opts, chain: pulsechain, account: address } as Parameters<typeof writeContract>[0]);
  };

  useEffect(() => {
    if (isSuccess) toast.success('Transaction confirmed');
    if (isError) toast.error('Transaction failed');
  }, [isSuccess, isError]);
  useEffect(() => {
    if (writeError) toast.error(writeError.message || 'Transaction rejected or failed');
  }, [writeError]);

  const run = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Invalid input');
      }
    },
    []
  );

  return (
    <ContractSection title="Instant Lottery (6-of-55)">
      <WriteRow label="pause()" onExecute={() => run(() => write({ address: addr, abi: INSTANT_LOTTERY_6OF55_ABI, functionName: 'pause' }))} loading={isPending || isConfirming}>
        <span className="text-[10px] text-slate-500">No args.</span>
      </WriteRow>
      <WriteRow label="unpause()" onExecute={() => run(() => write({ address: addr, abi: INSTANT_LOTTERY_6OF55_ABI, functionName: 'unpause' }))} loading={isPending || isConfirming}>
        <span className="text-[10px] text-slate-500">No args.</span>
      </WriteRow>
      <WriteRow
        label="setMinWager(uint256)"
        onExecute={() => {
          if (!minWager.trim()) {
            toast.error('Enter min wager (wei)');
            return;
          }
          run(() => write({ address: addr, abi: INSTANT_LOTTERY_6OF55_ABI, functionName: 'setMinWager', args: [BigInt(minWager.trim())] }));
        }}
        loading={isPending || isConfirming}
      >
        <Input value={minWager} onChange={(e) => setMinWager(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setMaxWager(uint256)"
        onExecute={() => {
          if (!maxWager.trim()) {
            toast.error('Enter max wager (wei)');
            return;
          }
          run(() => write({ address: addr, abi: INSTANT_LOTTERY_6OF55_ABI, functionName: 'setMaxWager', args: [BigInt(maxWager.trim())] }));
        }}
        loading={isPending || isConfirming}
      >
        <Input value={maxWager} onChange={(e) => setMaxWager(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setMultipliers(uint256[7])"
        onExecute={() => {
          const vals = [mult0, mult1, mult2, mult3, mult4, mult5, mult6].map(s => s.trim());
          if (vals.some(v => !v)) {
            toast.error('Enter all 7 multiplier values (0–6 matches, bps or wei)');
            return;
          }
          run(() =>
            write({
              address: addr,
              abi: INSTANT_LOTTERY_6OF55_ABI,
              functionName: 'setMultipliers',
              args: [vals.map(v => BigInt(v)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint]],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <div className="flex flex-wrap gap-1">
          {([mult0, mult1, mult2, mult3, mult4, mult5, mult6] as const).map((val, i) => (
            <Input key={i} value={val} onChange={(e) => [setMult0, setMult1, setMult2, setMult3, setMult4, setMult5, setMult6][i](e.target.value)} placeholder={`#${i}`} className="h-7 text-xs w-14 bg-slate-800 border-slate-600 font-mono" />
          ))}
        </div>
      </WriteRow>
      <WriteRow
        label="setPlsTreasury(address)"
        onExecute={() => {
          if (!plsTreasury.trim() || !plsTreasury.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() => write({ address: addr, abi: INSTANT_LOTTERY_6OF55_ABI, functionName: 'setPlsTreasury', args: [plsTreasury as `0x${string}`] }));
        }}
        loading={isPending || isConfirming}
      >
        <Input value={plsTreasury} onChange={(e) => setPlsTreasury(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="fundContract(uint256)"
        onExecute={() => {
          if (!fundAmount.trim()) {
            toast.error('Enter amount (wei)');
            return;
          }
          run(() => write({ address: addr, abi: INSTANT_LOTTERY_6OF55_ABI, functionName: 'fundContract', args: [BigInt(fundAmount.trim())] }));
        }}
        loading={isPending || isConfirming}
      >
        <Input value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="MORBIUS wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="emergencyWithdraw(uint256)"
        onExecute={() => {
          if (!emergencyAmount.trim()) {
            toast.error('Enter amount (wei)');
            return;
          }
          run(() => write({ address: addr, abi: INSTANT_LOTTERY_6OF55_ABI, functionName: 'emergencyWithdraw', args: [BigInt(emergencyAmount.trim())] }));
        }}
        loading={isPending || isConfirming}
      >
        <Input value={emergencyAmount} onChange={(e) => setEmergencyAmount(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
    </ContractSection>
  );
}

function KenoAdminSection() {
  const [spotSize, setSpotSize] = useState('');
  const [hits, setHits] = useState('');
  const [multiplier, setMultiplier] = useState('');
  const [maxWager, setMaxWager] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [treasuryAddr, setTreasuryAddr] = useState('');
  const [distBps, setDistBps] = useState('');
  const [distRecipient, setDistRecipient] = useState('');
  const [burnBps, setBurnBps] = useState('');
  const [burnAddr, setBurnAddr] = useState('');
  const [platformBps, setPlatformBps] = useState('');
  const [platformRecipient, setPlatformRecipient] = useState('');
  const [lpBps, setLpBps] = useState('');
  const [lpRecipient, setLpRecipient] = useState('');
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) toast.success('Transaction confirmed');
    if (isError) toast.error('Transaction failed');
  }, [isSuccess, isError]);
  useEffect(() => {
    if (writeError) toast.error(writeError.message || 'Transaction rejected or failed');
  }, [writeError]);

  const run = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Invalid input');
      }
    },
    []
  );

  const addr = KENO_ADDRESS as `0x${string}`;

  return (
    <ContractSection title="CryptoKeno (Quick Play)">
      <WriteRow
        label="setPaytable(uint8 spotSize, uint8 hits, uint256 multiplier)"
        onExecute={() => {
          if (!spotSize.trim() || !hits.trim() || !multiplier.trim()) {
            toast.error('Enter spotSize, hits, and multiplier');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setPaytable',
              args: [Number(spotSize), Number(hits), BigInt(multiplier)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={spotSize} onChange={(e) => setSpotSize(e.target.value)} placeholder="spotSize" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={hits} onChange={(e) => setHits(e.target.value)} placeholder="hits" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} placeholder="multiplier" className="h-7 text-xs w-28 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setMaxWagerPerDraw(uint256)"
        onExecute={() => {
          if (!maxWager.trim()) {
            toast.error('Enter max wager (wei)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setMaxWagerPerDraw',
              args: [BigInt(maxWager)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={maxWager} onChange={(e) => setMaxWager(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="fundContract(uint256 amount)"
        onExecute={() => {
          if (!fundAmount.trim()) {
            toast.error('Enter amount (wei)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'fundContract',
              args: [BigInt(fundAmount)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="amount (wei)" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="emergencyWithdraw(uint256 amount)"
        onExecute={() => {
          if (!withdrawAmount.trim()) {
            toast.error('Enter amount (wei)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'emergencyWithdraw',
              args: [BigInt(withdrawAmount)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="amount (wei)" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow label="pause()" onExecute={() => run(() => writeContract({ address: addr, abi: KENO_ABI, functionName: 'pause' }))} loading={isPending || isConfirming} />
      <WriteRow label="unpause()" onExecute={() => run(() => writeContract({ address: addr, abi: KENO_ABI, functionName: 'unpause' }))} loading={isPending || isConfirming} />
      <WriteRow
        label="setPlsTreasury(address)"
        onExecute={() => {
          if (!treasuryAddr.trim() || !treasuryAddr.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setPlsTreasury',
              args: [treasuryAddr as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={treasuryAddr} onChange={(e) => setTreasuryAddr(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setDistributionFee(uint256 bps, address)"
        onExecute={() => {
          if (!distBps.trim() || !distRecipient.trim() || !distRecipient.startsWith('0x')) {
            toast.error('Enter bps and valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setDistributionFee',
              args: [BigInt(distBps), distRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={distBps} onChange={(e) => setDistBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={distRecipient} onChange={(e) => setDistRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setBurnFee(uint256 bps, address)"
        onExecute={() => {
          if (!burnBps.trim() || !burnAddr.trim() || !burnAddr.startsWith('0x')) {
            toast.error('Enter bps and valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setBurnFee',
              args: [BigInt(burnBps), burnAddr as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={burnBps} onChange={(e) => setBurnBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={burnAddr} onChange={(e) => setBurnAddr(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setPlatformFee(uint256 bps, address)"
        onExecute={() => {
          if (!platformBps.trim() || !platformRecipient.trim() || !platformRecipient.startsWith('0x')) {
            toast.error('Enter bps and valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setPlatformFee',
              args: [BigInt(platformBps), platformRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={platformBps} onChange={(e) => setPlatformBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={platformRecipient} onChange={(e) => setPlatformRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setLpDistributionFee(uint256 bps, address)"
        onExecute={() => {
          if (!lpBps.trim() || !lpRecipient.trim() || !lpRecipient.startsWith('0x')) {
            toast.error('Enter bps and valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setLpDistributionFee',
              args: [BigInt(lpBps), lpRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={lpBps} onChange={(e) => setLpBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={lpRecipient} onChange={(e) => setLpRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
    </ContractSection>
  );
}

function PlinkoAdminSection() {
  const [minWager, setMinWager] = useState('');
  const [maxWager, setMaxWager] = useState('');
  const [emergencyAmount, setEmergencyAmount] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [distRecipient, setDistRecipient] = useState(MERKLE_CLAIM_MORBIUS_ADDRESS);
  const [lpDistRecipient, setLpDistRecipient] = useState(MERKLE_CLAIM_LP_ADDRESS);
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) toast.success('Transaction confirmed');
    if (isError) toast.error('Transaction failed');
  }, [isSuccess, isError]);
  useEffect(() => {
    if (writeError) toast.error(writeError.message || 'Transaction rejected or failed');
  }, [writeError]);

  const run = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Invalid input');
      }
    },
    []
  );

  const addr = PLINKO_ADDRESS as `0x${string}`;

  return (
    <ContractSection title="Plinko">
      <WriteRow
        label="setMinWager(uint256)"
        onExecute={() => {
          if (!minWager.trim()) {
            toast.error('Enter min wager (wei)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: PLINKO_ABI,
              functionName: 'setMinWager',
              args: [BigInt(minWager)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={minWager} onChange={(e) => setMinWager(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setMaxWager(uint256)"
        onExecute={() => {
          if (!maxWager.trim()) {
            toast.error('Enter max wager (wei)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: PLINKO_ABI,
              functionName: 'setMaxWager',
              args: [BigInt(maxWager)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={maxWager} onChange={(e) => setMaxWager(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow label="pause()" onExecute={() => run(() => writeContract({ address: addr, abi: PLINKO_ABI, functionName: 'pause' }))} loading={isPending || isConfirming} />
      <WriteRow label="unpause()" onExecute={() => run(() => writeContract({ address: addr, abi: PLINKO_ABI, functionName: 'unpause' }))} loading={isPending || isConfirming} />
      <WriteRow
        label="emergencyWithdraw(uint256 amount)"
        onExecute={() => {
          if (!emergencyAmount.trim()) {
            toast.error('Enter amount (wei)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: PLINKO_ABI,
              functionName: 'emergencyWithdraw',
              args: [BigInt(emergencyAmount)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={emergencyAmount} onChange={(e) => setEmergencyAmount(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="fundContract(uint256 amount)"
        onExecute={() => {
          if (!fundAmount.trim()) {
            toast.error('Enter amount (wei). Approve MORBIUS first.');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: PLINKO_ABI,
              functionName: 'fundContract',
              args: [BigInt(fundAmount)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="wei (approve first)" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setDistributionRecipient(address) — MORBIUS holder merkle"
        onExecute={() => {
          if (!distRecipient.trim() || !distRecipient.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: PLINKO_ABI,
              functionName: 'setDistributionRecipient',
              args: [distRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={distRecipient} onChange={(e) => setDistRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setLpDistributionRecipient(address) — LP staker merkle"
        onExecute={() => {
          if (!lpDistRecipient.trim() || !lpDistRecipient.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: PLINKO_ABI,
              functionName: 'setLpDistributionRecipient',
              args: [lpDistRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={lpDistRecipient} onChange={(e) => setLpDistRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
    </ContractSection>
  );
}

function BlackjackAdminSection() {
  const [authorizedServer, setAuthorizedServer] = useState('');
  const [emergencyAdmin, setEmergencyAdmin] = useState('');
  const [distributionFeeBps, setDistributionFeeBps] = useState('');
  const [distributionRecipient, setDistributionRecipient] = useState(MERKLE_CLAIM_MORBIUS_ADDRESS);
  const [lpDistributionRecipient, setLpDistributionRecipient] = useState(MERKLE_CLAIM_LP_ADDRESS);
  const [platformFeeBps, setPlatformFeeBps] = useState('');
  const [platformFeeRecipient, setPlatformFeeRecipient] = useState('');
  const [burnFeeBps, setBurnFeeBps] = useState('');
  const [lpDistributionFeeBps, setLpDistributionFeeBps] = useState('');
  const [emergencyPause, setEmergencyPause] = useState('true');
  const [emergencyAmount, setEmergencyAmount] = useState('');
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) toast.success('Transaction confirmed');
    if (isError) toast.error('Transaction failed');
  }, [isSuccess, isError]);
  useEffect(() => {
    if (writeError) toast.error(writeError.message || 'Transaction rejected or failed');
  }, [writeError]);

  const run = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Invalid input');
      }
    },
    []
  );

  const addr = BLACKJACK_ADDRESS as `0x${string}`;

  return (
    <ContractSection title="Blackjack">
      <WriteRow
        label="setAuthorizedServer(address)"
        onExecute={() => {
          if (!authorizedServer.trim() || !authorizedServer.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setAuthorizedServer',
              args: [authorizedServer as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={authorizedServer} onChange={(e) => setAuthorizedServer(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setEmergencyAdmin(address)"
        onExecute={() => {
          if (!emergencyAdmin.trim() || !emergencyAdmin.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setEmergencyAdmin',
              args: [emergencyAdmin as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={emergencyAdmin} onChange={(e) => setEmergencyAdmin(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setDistributionFee(uint256 bps) — max 2000 (20%)"
        onExecute={() => {
          if (!distributionFeeBps.trim()) {
            toast.error('Enter basis points (0–2000)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setDistributionFee',
              args: [BigInt(distributionFeeBps)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={distributionFeeBps} onChange={(e) => setDistributionFeeBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-24 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setDistributionRecipient(address) — MORBIUS holder merkle"
        onExecute={() => {
          if (!distributionRecipient.trim() || !distributionRecipient.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setDistributionRecipient',
              args: [distributionRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={distributionRecipient} onChange={(e) => setDistributionRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setLpDistributionRecipient(address) — LP staker merkle"
        onExecute={() => {
          if (!lpDistributionRecipient.trim() || !lpDistributionRecipient.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setLpDistributionRecipient',
              args: [lpDistributionRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={lpDistributionRecipient} onChange={(e) => setLpDistributionRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setPlatformFee(uint256 bps) — max 2000 (20%)"
        onExecute={() => {
          if (!platformFeeBps.trim()) {
            toast.error('Enter basis points (0–2000)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setPlatformFee',
              args: [BigInt(platformFeeBps)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={platformFeeBps} onChange={(e) => setPlatformFeeBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-24 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setPlatformFeeRecipient(address)"
        onExecute={() => {
          if (!platformFeeRecipient.trim() || !platformFeeRecipient.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setPlatformFeeRecipient',
              args: [platformFeeRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={platformFeeRecipient} onChange={(e) => setPlatformFeeRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setBurnFee(uint256 bps) — max 2000 (20%)"
        onExecute={() => {
          if (!burnFeeBps.trim()) {
            toast.error('Enter basis points (0–2000)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setBurnFee',
              args: [BigInt(burnFeeBps)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={burnFeeBps} onChange={(e) => setBurnFeeBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-24 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setLpDistributionFee(uint256 bps) — max 2000 (20%)"
        onExecute={() => {
          if (!lpDistributionFeeBps.trim()) {
            toast.error('Enter basis points (0–2000)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setLpDistributionFee',
              args: [BigInt(lpDistributionFeeBps)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={lpDistributionFeeBps} onChange={(e) => setLpDistributionFeeBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-24 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setEmergencyPause(bool) — emergency admin only"
        onExecute={() =>
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setEmergencyPause',
              args: [emergencyPause === 'true'],
            })
          )
        }
        loading={isPending || isConfirming}
      >
        <select
          value={emergencyPause}
          onChange={(e) => setEmergencyPause(e.target.value)}
          className="h-7 text-xs w-20 bg-slate-800 border border-slate-600 rounded px-2 text-slate-200"
          aria-label="Emergency pause (true/false)"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </WriteRow>
      <WriteRow
        label="emergencyWithdraw(uint256) — emergency admin only"
        onExecute={() => {
          if (!emergencyAmount.trim()) {
            toast.error('Enter amount (wei)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'emergencyWithdraw',
              args: [BigInt(emergencyAmount)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={emergencyAmount} onChange={(e) => setEmergencyAmount(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow label="pause()" onExecute={() => run(() => writeContract({ address: addr, abi: blackjackAbi, functionName: 'pause' }))} loading={isPending || isConfirming} />
      <WriteRow label="unpause()" onExecute={() => run(() => writeContract({ address: addr, abi: blackjackAbi, functionName: 'unpause' }))} loading={isPending || isConfirming} />
    </ContractSection>
  );
}

function EscrowAdminSection() {
  const [authServer, setAuthServer] = useState('');
  const [tournamentIdHex, setTournamentIdHex] = useState('');
  const [token, setToken] = useState('');
  const [amount, setAmount] = useState('');
  const [winner, setWinner] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [remainderTo, setRemainderTo] = useState('');
  const [reclaimTo, setReclaimTo] = useState('');
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) toast.success('Transaction confirmed');
    if (isError) toast.error('Transaction failed');
  }, [isSuccess, isError]);
  useEffect(() => {
    if (writeError) toast.error(writeError.message || 'Transaction rejected or failed');
  }, [writeError]);

  const run = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Invalid input');
      }
    },
    []
  );

  if (!TOURNAMENT_PRIZE_ESCROW_ADDRESS || TOURNAMENT_PRIZE_ESCROW_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return (
      <ContractSection title="Tournament Prize Escrow">
        <p className="text-[11px] text-slate-500">NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS not set.</p>
      </ContractSection>
    );
  }

  const addr = TOURNAMENT_PRIZE_ESCROW_ADDRESS as `0x${string}`;
  const tid: `0x${string}` =
    tournamentIdHex.startsWith('0x') && tournamentIdHex.length === 66
      ? (tournamentIdHex as `0x${string}`)
      : (toHex(keccak256(new TextEncoder().encode(tournamentIdHex || '0'))) as `0x${string}`);

  return (
    <ContractSection title="Tournament Prize Escrow">
      <WriteRow
        label="setAuthorizedServer(address)"
        onExecute={() => {
          if (!authServer.trim() || !authServer.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: tournamentPrizeEscrowAbi,
              functionName: 'setAuthorizedServer',
              args: [authServer as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={authServer} onChange={(e) => setAuthServer(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="depositPrizePool(bytes32 tournamentId, address token, uint256 amount)"
        onExecute={() => {
          if (!token.trim() || !token.startsWith('0x') || !amount.trim()) {
            toast.error('Enter tournamentId, valid token 0x address, and amount. Approve token first.');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: tournamentPrizeEscrowAbi,
              functionName: 'depositPrizePool',
              args: [tid, token as `0x${string}`, BigInt(amount)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={tournamentIdHex} onChange={(e) => setTournamentIdHex(e.target.value)} placeholder="0x… or UTF-8 string" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
        <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="token 0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="amount wei" className="h-7 text-xs w-32 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="payout(bytes32 tournamentId, address winner, uint256 amount)"
        onExecute={() => {
          if (!winner.trim() || !winner.startsWith('0x') || !payoutAmount.trim()) {
            toast.error('Enter tournamentId, valid winner 0x address, and amount');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: tournamentPrizeEscrowAbi,
              functionName: 'payout',
              args: [tid, winner as `0x${string}`, BigInt(payoutAmount)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={tournamentIdHex} onChange={(e) => setTournamentIdHex(e.target.value)} placeholder="tournamentId" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
        <Input value={winner} onChange={(e) => setWinner(e.target.value)} placeholder="winner 0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
        <Input value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} placeholder="amount" className="h-7 text-xs w-28 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="payoutRemainderTo(bytes32 tournamentId, address to)"
        onExecute={() => {
          if (!remainderTo.trim() || !remainderTo.startsWith('0x')) {
            toast.error('Enter tournamentId and valid 0x recipient');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: tournamentPrizeEscrowAbi,
              functionName: 'payoutRemainderTo',
              args: [tid, remainderTo as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={tournamentIdHex} onChange={(e) => setTournamentIdHex(e.target.value)} placeholder="tournamentId" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
        <Input value={remainderTo} onChange={(e) => setRemainderTo(e.target.value)} placeholder="to 0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="reclaimUnclaimed(bytes32 tournamentId, address to) — owner only"
        onExecute={() => {
          if (!reclaimTo.trim() || !reclaimTo.startsWith('0x')) {
            toast.error('Enter tournamentId and valid 0x recipient');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: tournamentPrizeEscrowAbi,
              functionName: 'reclaimUnclaimed',
              args: [tid, reclaimTo as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={tournamentIdHex} onChange={(e) => setTournamentIdHex(e.target.value)} placeholder="tournamentId" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
        <Input value={reclaimTo} onChange={(e) => setReclaimTo(e.target.value)} placeholder="to 0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
    </ContractSection>
  );
}

function DistributorAdminSection() {
  const [excludedAddr, setExcludedAddr] = useState('');
  const [removeAddr, setRemoveAddr] = useState('');
  const [rescueTokenAddr, setRescueTokenAddr] = useState('');
  const [rescueTo, setRescueTo] = useState('');
  const [rescueAmount, setRescueAmount] = useState('');
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) toast.success('Transaction confirmed');
    if (isError) toast.error('Transaction failed');
  }, [isSuccess, isError]);
  useEffect(() => {
    if (writeError) toast.error(writeError.message || 'Transaction rejected or failed');
  }, [writeError]);

  const run = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Invalid input');
      }
    },
    []
  );

  const addr = MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS as `0x${string}`;

  return (
    <ContractSection title="MORBIUS Holder Distributor">
      <WriteRow
        label="addExcludedAddress(address) — owner only"
        onExecute={() => {
          if (!excludedAddr.trim() || !excludedAddr.startsWith('0x')) {
            toast.error('Enter valid 0x address (e.g. new LP or contract)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: morbiusHolderDistributorAbi,
              functionName: 'addExcludedAddress',
              args: [excludedAddr as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input
          value={excludedAddr}
          onChange={(e) => setExcludedAddr(e.target.value)}
          placeholder="0x… (LP or contract)"
          className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono"
        />
      </WriteRow>
      <WriteRow
        label="removeExcludedAddress(address) — owner only"
        onExecute={() => {
          if (!removeAddr.trim() || !removeAddr.startsWith('0x')) {
            toast.error('Enter valid 0x address to remove');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: morbiusHolderDistributorAbi,
              functionName: 'removeExcludedAddress',
              args: [removeAddr as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input
          value={removeAddr}
          onChange={(e) => setRemoveAddr(e.target.value)}
          placeholder="0x…"
          className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono"
        />
      </WriteRow>
      <WriteRow
        label="rescueToken(token, to, amount) — owner only (not MORBIUS)"
        onExecute={() => {
          if (!rescueTokenAddr.trim() || !rescueTo.trim() || !rescueAmount.trim() || !rescueTokenAddr.startsWith('0x') || !rescueTo.startsWith('0x')) {
            toast.error('Enter token address, recipient 0x…, and amount');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: morbiusHolderDistributorAbi,
              functionName: 'rescueToken',
              args: [rescueTokenAddr as `0x${string}`, rescueTo as `0x${string}`, BigInt(rescueAmount)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={rescueTokenAddr} onChange={(e) => setRescueTokenAddr(e.target.value)} placeholder="token 0x…" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
        <Input value={rescueTo} onChange={(e) => setRescueTo(e.target.value)} placeholder="to 0x…" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
        <Input value={rescueAmount} onChange={(e) => setRescueAmount(e.target.value)} placeholder="amount" className="h-7 text-xs w-28 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
    </ContractSection>
  );
}

export default function AdminConfigTab() {
  const { address } = useAccount();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/config', {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load config');
      setConfig({});
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-wallet': address },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data ?? {});
      toast.success('Config saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      toast.error('Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  if (!address) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Connect wallet to load config.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="config" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1.5 bg-slate-800/80 border border-slate-700/50">
          <TabsTrigger value="config" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white">Config</TabsTrigger>
          <TabsTrigger value="calculator" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white">Calculator</TabsTrigger>
          <TabsTrigger value="lottery" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white">Lottery</TabsTrigger>
          <TabsTrigger value="keno" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white">Keno</TabsTrigger>
          <TabsTrigger value="plinko" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white">Plinko</TabsTrigger>
          <TabsTrigger value="blackjack" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white">Blackjack</TabsTrigger>
          <TabsTrigger value="escrow" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white">Escrow</TabsTrigger>
          <TabsTrigger value="distributor" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white">Distributor</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-3 space-y-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-amber-400" />
                Config
              </CardTitle>
              <button
                type="button"
                onClick={() => fetchConfig()}
                disabled={loading}
                className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white disabled:opacity-50"
                aria-label="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <p className="text-[10px] text-slate-500 mb-2">Game parameters (stored in DB). Server/games may use these; ensure keys match what the backend expects.</p>
              {error && <p className="text-[11px] text-red-400 mb-2">{error}</p>}
              {loading && Object.keys(config).length === 0 && <p className="text-[11px] text-slate-500">Loading…</p>}
              <form onSubmit={handleSave} className="space-y-2">
                {CONFIG_KEYS.map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <Label className="text-[11px] text-slate-400">{label}</Label>
                    <Input
                      value={config[key] ?? ''}
                      onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                      className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600 font-mono"
                      placeholder={placeholder}
                    />
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-700/50 mt-2">
                  <Label className="text-[11px] text-slate-400">Blackjack default table (for new users / no saved preference)</Label>
                  <div className="mt-1 flex flex-wrap gap-2 items-center">
                    <select
                      value={config.blackjack_default_theme_kind ?? 'image'}
                      onChange={(e) => {
                        const kind = e.target.value as 'image' | 'video';
                        const tableList = kind === 'video' ? BLACKJACK_VIDEO_BACKGROUNDS : BLACKJACK_IMAGE_BACKGROUNDS;
                        const currentId = config.blackjack_default_table_id ?? DEFAULT_BLACKJACK_IMAGE_ID;
                        const validId = tableList.some((t) => t.id === currentId) ? currentId : tableList[0].id;
                        setConfig((c) => ({ ...c, blackjack_default_theme_kind: kind, blackjack_default_table_id: validId }));
                      }}
                      className="h-8 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 px-2"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                    <select
                      value={config.blackjack_default_table_id ?? DEFAULT_BLACKJACK_IMAGE_ID}
                      onChange={(e) => setConfig((c) => ({ ...c, blackjack_default_table_id: e.target.value }))}
                      className="h-8 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 px-2 min-w-[140px]"
                    >
                      {(config.blackjack_default_theme_kind ?? 'image') === 'video'
                        ? BLACKJACK_VIDEO_BACKGROUNDS.map((v) => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                          ))
                        : BLACKJACK_IMAGE_BACKGROUNDS.map((b) => (
                            <option key={b.id} value={b.id}>{b.label}</option>
                          ))}
                    </select>
                  </div>
                </div>
                <div className="pt-2">
                  <Button type="submit" size="sm" className="text-xs h-7" disabled={saving}>
                    {saving ? 'Saving…' : 'Save config'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculator" className="mt-3">
          <WeiCalculator />
        </TabsContent>

        <TabsContent value="lottery" className="mt-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Contract admin: ensure wallet is on PulseChain. Only contract owner (or authorized) can execute.</p>
          <LotteryAdminSection />
        </TabsContent>

        <TabsContent value="keno" className="mt-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Contract admin: ensure wallet is on PulseChain. Only contract owner (or authorized) can execute.</p>
          <KenoAdminSection />
        </TabsContent>

        <TabsContent value="plinko" className="mt-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Contract admin: ensure wallet is on PulseChain. Only contract owner (or authorized) can execute.</p>
          <PlinkoAdminSection />
        </TabsContent>

        <TabsContent value="blackjack" className="mt-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Contract admin: ensure wallet is on PulseChain. Only contract owner (or authorized) can execute.</p>
          <BlackjackAdminSection />
        </TabsContent>

        <TabsContent value="escrow" className="mt-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Contract admin: ensure wallet is on PulseChain. Only contract owner (or authorized) can execute.</p>
          <EscrowAdminSection />
        </TabsContent>

        <TabsContent value="distributor" className="mt-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Contract admin: ensure wallet is on PulseChain. Only contract owner (or authorized) can execute.</p>
          <DistributorAdminSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
