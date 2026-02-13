'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  LOTTERY_ADDRESS,
  KENO_ADDRESS,
  PLINKO_ADDRESS,
  BLACKJACK_ADDRESS,
  TOURNAMENT_PRIZE_ESCROW_ADDRESS,
} from '@/lib/contracts';
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2';
import { KENO_ABI } from '@/lib/keno-abi';
import { PLINKO_ABI } from '@/abi/plinko';
import { blackjackAbi } from '@/abi/blackjack';
import { tournamentPrizeEscrowAbi } from '@/abi/tournament-prize-escrow';
import { keccak256, toHex } from 'viem';

const CONFIG_KEYS = [
  { key: 'blackjack_min_bet', label: 'Blackjack min bet (wei)', placeholder: '1000000000000000000' },
  { key: 'blackjack_max_bet', label: 'Blackjack max bet (wei)', placeholder: '100000000000000000000000' },
  { key: 'blackjack_fee_percent', label: 'Blackjack fee %', placeholder: '0' },
] as const;

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
  const [roundDuration, setRoundDuration] = useState('');
  const [morbiusPrice, setMorbiusPrice] = useState('');
  const [plsPrice, setPlsPrice] = useState('');
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

  return (
    <ContractSection title="Lottery (6-of-55 V2)">
      <WriteRow
        label="finalizeRound()"
        onExecute={() => run(() => writeContract({ address: LOTTERY_ADDRESS as `0x${string}`, abi: LOTTERY_6OF55_V2_ABI, functionName: 'finalizeRound' }))}
        loading={isPending || isConfirming}
      >
        <span className="text-[10px] text-slate-500">No args. Finalizes current round when duration elapsed.</span>
      </WriteRow>
      <WriteRow
        label="updateRoundDuration(uint256)"
        onExecute={() => {
          if (!roundDuration.trim()) {
            toast.error('Enter round duration (seconds)');
            return;
          }
          run(() => {
            const d = BigInt(roundDuration.trim());
            writeContract({ address: LOTTERY_ADDRESS as `0x${string}`, abi: LOTTERY_6OF55_V2_ABI, functionName: 'updateRoundDuration', args: [d] });
          });
        }}
        loading={isPending || isConfirming}
      >
        <Input
          value={roundDuration}
          onChange={(e) => setRoundDuration(e.target.value)}
          placeholder="300"
          className="h-7 text-xs w-32 bg-slate-800 border-slate-600 font-mono"
        />
      </WriteRow>
      <WriteRow
        label="updateTicketPrices(uint256 newMORBIUSPrice, uint256 newPlsPrice)"
        onExecute={() => {
          if (!morbiusPrice.trim() || !plsPrice.trim()) {
            toast.error('Enter both MORBIUS and PLS price (wei)');
            return;
          }
          run(() => {
            const m = BigInt(morbiusPrice.trim());
            const p = BigInt(plsPrice.trim());
            writeContract({ address: LOTTERY_ADDRESS as `0x${string}`, abi: LOTTERY_6OF55_V2_ABI, functionName: 'updateTicketPrices', args: [m, p] });
          });
        }}
        loading={isPending || isConfirming}
      >
        <Input
          value={morbiusPrice}
          onChange={(e) => setMorbiusPrice(e.target.value)}
          placeholder="MORBIUS wei"
          className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono"
        />
        <Input
          value={plsPrice}
          onChange={(e) => setPlsPrice(e.target.value)}
          placeholder="PLS wei"
          className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono"
        />
      </WriteRow>
    </ContractSection>
  );
}

function KenoAdminSection() {
  const [spotSize, setSpotSize] = useState('');
  const [hits, setHits] = useState('');
  const [multiplier, setMultiplier] = useState('');
  const [feeBps, setFeeBps] = useState('');
  const [feeRecipient, setFeeRecipient] = useState('');
  const [randomnessProvider, setRandomnessProvider] = useState('');
  const [roundDuration, setRoundDuration] = useState('');
  const [maxWager, setMaxWager] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawTo, setWithdrawTo] = useState('');
  const [reclaimRoundId, setReclaimRoundId] = useState('');
  const [commitRoundId, setCommitRoundId] = useState('');
  const [commitment, setCommitment] = useState('');
  const [revealRoundId, setRevealRoundId] = useState('');
  const [seed, setSeed] = useState('');
  const [burnThreshold, setBurnThreshold] = useState('');
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
    <ContractSection title="CryptoKeno">
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
        label="setFee(uint256 feeBps, address recipient)"
        onExecute={() => {
          if (!feeBps.trim() || !feeRecipient.trim() || !feeRecipient.startsWith('0x')) {
            toast.error('Enter fee (bps) and valid 0x recipient address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setFee',
              args: [BigInt(feeBps), feeRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={feeBps} onChange={(e) => setFeeBps(e.target.value)} placeholder="bps" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={feeRecipient} onChange={(e) => setFeeRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setRandomnessProvider(address)"
        onExecute={() => {
          if (!randomnessProvider.trim() || !randomnessProvider.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setRandomnessProvider',
              args: [randomnessProvider as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={randomnessProvider} onChange={(e) => setRandomnessProvider(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setRoundDuration(uint256)"
        onExecute={() => {
          if (!roundDuration.trim()) {
            toast.error('Enter round duration (seconds)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'setRoundDuration',
              args: [BigInt(roundDuration)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={roundDuration} onChange={(e) => setRoundDuration(e.target.value)} placeholder="seconds" className="h-7 text-xs w-28 bg-slate-800 border-slate-600 font-mono" />
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
        label="startNextRound()"
        onExecute={() => run(() => writeContract({ address: addr, abi: KENO_ABI, functionName: 'startNextRound' }))}
        loading={isPending || isConfirming}
      >
        <span className="text-[10px] text-slate-500">No args.</span>
      </WriteRow>
      <WriteRow label="pause()" onExecute={() => run(() => writeContract({ address: addr, abi: KENO_ABI, functionName: 'pause' }))} loading={isPending || isConfirming} />
      <WriteRow label="unpause()" onExecute={() => run(() => writeContract({ address: addr, abi: KENO_ABI, functionName: 'unpause' }))} loading={isPending || isConfirming} />
      <WriteRow
        label="withdrawBankroll(uint256 amount, address to)"
        onExecute={() => {
          if (!withdrawAmount.trim() || !withdrawTo.trim() || !withdrawTo.startsWith('0x')) {
            toast.error('Enter amount and valid 0x recipient');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'withdrawBankroll',
              args: [BigInt(withdrawAmount), withdrawTo as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="amount" className="h-7 text-xs w-32 bg-slate-800 border-slate-600 font-mono" />
        <Input value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="reclaimExpiredPrizes(uint256 roundId)"
        onExecute={() => {
          if (!reclaimRoundId.trim()) {
            toast.error('Enter round ID');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'reclaimExpiredPrizes',
              args: [BigInt(reclaimRoundId)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={reclaimRoundId} onChange={(e) => setReclaimRoundId(e.target.value)} placeholder="roundId" className="h-7 text-xs w-28 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="commitRandom(uint256 roundId, bytes32 commitment)"
        onExecute={() => {
          if (!commitRoundId.trim() || !commitment.trim() || !commitment.startsWith('0x')) {
            toast.error('Enter round ID and 0x commitment (32 bytes)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'commitRandom',
              args: [BigInt(commitRoundId), commitment as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={commitRoundId} onChange={(e) => setCommitRoundId(e.target.value)} placeholder="roundId" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder="0x… 32 bytes" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="revealRandom(uint256 roundId, bytes32 seed)"
        onExecute={() => {
          if (!revealRoundId.trim() || !seed.trim() || !seed.startsWith('0x')) {
            toast.error('Enter round ID and 0x seed');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'revealRandom',
              args: [BigInt(revealRoundId), seed as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={revealRoundId} onChange={(e) => setRevealRoundId(e.target.value)} placeholder="roundId" className="h-7 text-xs w-20 bg-slate-800 border-slate-600 font-mono" />
        <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="0x… seed" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="updateBurnThreshold(uint256)"
        onExecute={() => {
          if (!burnThreshold.trim()) {
            toast.error('Enter burn threshold (wei)');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: KENO_ABI,
              functionName: 'updateBurnThreshold',
              args: [BigInt(burnThreshold)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={burnThreshold} onChange={(e) => setBurnThreshold(e.target.value)} placeholder="wei" className="h-7 text-xs w-40 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
    </ContractSection>
  );
}

function PlinkoAdminSection() {
  const [minWager, setMinWager] = useState('');
  const [maxWager, setMaxWager] = useState('');
  const [emergencyAmount, setEmergencyAmount] = useState('');
  const [fundAmount, setFundAmount] = useState('');
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
    </ContractSection>
  );
}

function BlackjackAdminSection() {
  const [authorizedServer, setAuthorizedServer] = useState('');
  const [emergencyAdmin, setEmergencyAdmin] = useState('');
  const [betFeeBps, setBetFeeBps] = useState('');
  const [feeRecipient, setFeeRecipient] = useState('');
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
    <ContractSection title="Blackjack V2">
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
        label="setBetFee(uint256 bps)"
        onExecute={() => {
          if (!betFeeBps.trim()) {
            toast.error('Enter basis points');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setBetFee',
              args: [BigInt(betFeeBps)],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={betFeeBps} onChange={(e) => setBetFeeBps(e.target.value)} placeholder="basis points" className="h-7 text-xs w-24 bg-slate-800 border-slate-600 font-mono" />
      </WriteRow>
      <WriteRow
        label="setFeeRecipient(address)"
        onExecute={() => {
          if (!feeRecipient.trim() || !feeRecipient.startsWith('0x')) {
            toast.error('Enter valid 0x address');
            return;
          }
          run(() =>
            writeContract({
              address: addr,
              abi: blackjackAbi,
              functionName: 'setFeeRecipient',
              args: [feeRecipient as `0x${string}`],
            })
          );
        }}
        loading={isPending || isConfirming}
      >
        <Input value={feeRecipient} onChange={(e) => setFeeRecipient(e.target.value)} placeholder="0x…" className="h-7 text-xs w-52 bg-slate-800 border-slate-600 font-mono" />
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
            <div className="pt-2">
              <Button type="submit" size="sm" className="text-xs h-7" disabled={saving}>
                {saving ? 'Saving…' : 'Save config'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="text-xs font-medium text-slate-400 pt-2 border-t border-slate-700/50">Contract admin: ensure wallet is on PulseChain. Only contract owner (or authorized) can execute these functions.</div>

      <LotteryAdminSection />
      <KenoAdminSection />
      <PlinkoAdminSection />
      <BlackjackAdminSection />
      <EscrowAdminSection />
    </div>
  );
}
