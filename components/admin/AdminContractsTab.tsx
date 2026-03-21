'use client';

import React, { useState, useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { formatEther, formatUnits, isAddress, parseEther, parseUnits } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PLINKO_ADDRESS, KENO_ADDRESS, LOTTERY_INSTANT_ADDRESS, BLACKJACK_ADDRESS, TOURNAMENT_PRIZE_ESCROW_ADDRESS, MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS } from '@/lib/contracts';
import { PLINKO_ABI } from '@/abi/plinko';
import { KENO_ABI } from '@/lib/keno-abi';
import { INSTANT_LOTTERY_6OF55_ABI } from '@/abi/instant-lottery-6of55';
import { blackjackAbi } from '@/abi/blackjack';
import { tournamentPrizeEscrowAbi } from '@/abi/tournament-prize-escrow';
import { morbiusHolderDistributorAbi } from '@/abi/morbius-holder-distributor';
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';

const TOKEN_DECIMALS = 18;

interface FunctionCall {
  contractName: string;
  functionName: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ type: string }>;
  address: `0x${string}`;
  abi: any[];
}

function formatValue(value: any, outputType: string): string {
  if (value === null || value === undefined) return '—';
  
  if (Array.isArray(value)) {
    return `[${value.map((v, i) => formatValue(v, outputType)).join(', ')}]`;
  }
  
  if (typeof value === 'bigint') {
    if (outputType.includes('uint256') || outputType.includes('uint')) {
      // Try to format as token amount if it's large enough
      try {
        const formatted = formatEther(value);
        if (parseFloat(formatted) > 0.0001) {
          return `${formatted} (${value.toString()})`;
        }
        return value.toString();
      } catch {
        return value.toString();
      }
    }
    return value.toString();
  }
  
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  
  if (typeof value === 'string' && value.startsWith('0x')) {
    if (isAddress(value)) {
      return `${value.slice(0, 6)}…${value.slice(-4)}`;
    }
    return value;
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
  }
  
  return String(value);
}

function FunctionCaller({ func, contractName }: { func: FunctionCall; contractName: string }) {
  const [args, setArgs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [manualCall, setManualCall] = useState(false);
  
  const hasArgs = func.inputs.length > 0;
  const argsArray = hasArgs ? func.inputs.map((input, idx) => {
    const inputKey = input.name || `arg${idx}`;
    const val = args[inputKey] || '';
    if (!val && input.type.includes('uint')) return 0n;
    if (!val && input.type.includes('int')) return 0n;
    if (input.type === 'address') return val ? (val as `0x${string}`) : '0x0000000000000000000000000000000000000000' as `0x${string}`;
    if (input.type.includes('uint')) return val ? BigInt(val) : 0n;
    if (input.type.includes('int')) return val ? BigInt(val) : 0n;
    if (input.type === 'bool') return val === 'true' || val === '1';
    if (input.type.includes('[]')) return val ? val.split(',').map((v: string) => v.trim()).filter(Boolean) : [];
    if (input.type.includes('bytes')) return val as `0x${string}`;
    return val || '';
  }) : undefined;

  const { data, isLoading, error, refetch } = useReadContract({
    address: func.address,
    abi: func.abi,
    functionName: func.functionName as any,
    args: argsArray as any,
    query: {
      enabled: !hasArgs || manualCall,
    },
  });

  const resultCopyText = useMemo(() => {
    if (data === undefined) return '';
    return typeof data === 'object'
      ? JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      : String(data);
  }, [data]);

  const handleCall = () => {
    if (hasArgs) {
      setManualCall(true);
      setTimeout(() => refetch(), 100);
    }
  };

  return (
    <div className="border border-slate-700/50 rounded-lg p-3 bg-slate-900/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <code className="text-xs font-mono text-cyan-400">{func.functionName}</code>
            <span className="text-[10px] text-slate-500">
              → {func.outputs.map((o) => o.type).join(', ')}
            </span>
          </div>
          
          {expanded && (
            <div className="ml-6 space-y-2">
              {hasArgs && (
                <div className="space-y-2">
                  {func.inputs.map((input, idx) => {
                    const inputKey = input.name || `arg${idx}`;
                    return (
                      <div key={idx}>
                        <Label className="text-[10px] text-slate-400">
                          {input.name || `arg${idx}`} ({input.type})
                        </Label>
                        <Input
                          value={args[inputKey] || ''}
                          onChange={(e) => setArgs({ ...args, [inputKey]: e.target.value })}
                          placeholder={
                            input.type === 'address' ? '0x...' : 
                            input.type.includes('uint') || input.type.includes('int') ? '0' : 
                            input.type === 'bool' ? 'true/false' :
                            input.type.includes('[]') ? 'comma-separated values' :
                            ''
                          }
                          className="h-7 text-xs bg-slate-800/60 border-slate-700"
                        />
                      </div>
                    );
                  })}
                  <Button
                    onClick={handleCall}
                    size="sm"
                    className="h-7 text-xs bg-cyan-600/80 hover:bg-cyan-600"
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Call'}
                  </Button>
                </div>
              )}
              
              {(data !== undefined || error) && (
                <div className="mt-2 p-2 bg-slate-800/60 rounded border border-slate-700/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400">Result:</span>
                    {data !== undefined && (
                      <CopyButton
                        content={resultCopyText}
                        copyToast="Result copied"
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0"
                      />
                    )}
                  </div>
                  {error ? (
                    <div className="text-[10px] text-red-400 font-mono break-all">
                      {error.message || String(error)}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-200 font-mono break-all">
                      {Array.isArray(data) ? (
                        <div className="space-y-1">
                          {data.map((val, idx) => (
                            <div key={idx}>
                              <span className="text-slate-500">[{idx}]:</span>{' '}
                              <span className="text-cyan-300">{formatValue(val, func.outputs[idx]?.type || '')}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-cyan-300">{formatValue(data, func.outputs[0]?.type || '')}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {!hasArgs && (
          <div className="flex items-center gap-1">
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            {data !== undefined && (
              <CopyButton
                content={resultCopyText}
                copyToast="Result copied"
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContractSection({ 
  contractName, 
  address, 
  abi, 
  functions 
}: { 
  contractName: string; 
  address: `0x${string}`;
  abi: any[];
  functions: Array<{ name: string; inputs: Array<{ name: string; type: string }>; outputs: Array<{ type: string }> }>;
}) {
  const [expanded, setExpanded] = useState(true);
  
  const functionCalls: FunctionCall[] = functions.map((fn) => ({
    contractName,
    functionName: fn.name,
    inputs: fn.inputs || [],
    outputs: fn.outputs || [],
    address,
    abi,
  }));

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-slate-200"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {contractName}
            <span className="text-[10px] text-slate-500 font-mono">
              ({address.slice(0, 6)}…{address.slice(-4)})
            </span>
            <a
              href={`https://scan.pulsechain.com/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-cyan-400"
              title="View on PulseScan"
              aria-label="View contract on PulseScan"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </CardTitle>
          <span className="text-[10px] text-slate-500">{functions.length} functions</span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
          {functionCalls.map((func, idx) => (
            <FunctionCaller key={idx} func={func} contractName={contractName} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default function AdminContractsTab() {
  // Extract read functions from ABIs
  const plinkoReadFunctions = PLINKO_ABI.filter(
    (fn: any) => fn.type === 'function' && (fn.stateMutability === 'view' || fn.stateMutability === 'pure')
  ).map((fn: any) => ({
    name: fn.name,
    inputs: fn.inputs || [],
    outputs: fn.outputs || [],
  }));
  
  const kenoReadFunctions = KENO_ABI.filter(
    (fn: any) => fn.type === 'function' && (fn.stateMutability === 'view' || fn.stateMutability === 'pure')
  ).map((fn: any) => ({
    name: fn.name,
    inputs: fn.inputs || [],
    outputs: fn.outputs || [],
  }));
  
  const lotteryReadFunctions = INSTANT_LOTTERY_6OF55_ABI.filter(
    (fn: any) => fn.type === 'function' && (fn.stateMutability === 'view' || fn.stateMutability === 'pure')
  ).map((fn: any) => ({
    name: fn.name,
    inputs: fn.inputs || [],
    outputs: fn.outputs || [],
  }));
  
  const blackjackReadFunctions = blackjackAbi.filter(
    (fn: any) => fn.type === 'function' && (fn.stateMutability === 'view' || fn.stateMutability === 'pure')
  ).map((fn: any) => ({
    name: fn.name,
    inputs: fn.inputs || [],
    outputs: fn.outputs || [],
  }));
  
  const escrowReadFunctions = tournamentPrizeEscrowAbi.filter(
    (fn: any) => fn.type === 'function' && (fn.stateMutability === 'view' || fn.stateMutability === 'pure')
  ).map((fn: any) => ({
    name: fn.name,
    inputs: fn.inputs || [],
    outputs: fn.outputs || [],
  }));

  const distributorReadFunctions = morbiusHolderDistributorAbi.filter(
    (fn: any) => fn.type === 'function' && (fn.stateMutability === 'view' || fn.stateMutability === 'pure')
  ).map((fn: any) => ({
    name: fn.name,
    inputs: fn.inputs || [],
    outputs: fn.outputs || [],
  }));

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-200">
            Contract Read Functions
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Call read-only functions on deployed contracts. Functions without parameters are called automatically.
          </p>
        </CardHeader>
      </Card>

      <Tabs defaultValue="plinko" className="w-full">
        <TabsList className="h-8 w-full grid grid-cols-6 bg-slate-800/80 border border-slate-700/50 rounded-md p-0.5 text-xs">
          <TabsTrigger value="plinko" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">
            Plinko ({plinkoReadFunctions.length})
          </TabsTrigger>
          <TabsTrigger value="keno" className="rounded data-[state=active]:bg-purple-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">
            Keno ({kenoReadFunctions.length})
          </TabsTrigger>
          <TabsTrigger value="lottery" className="rounded data-[state=active]:bg-emerald-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">
            Lottery ({lotteryReadFunctions.length})
          </TabsTrigger>
          <TabsTrigger value="blackjack" className="rounded data-[state=active]:bg-amber-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">
            Blackjack ({blackjackReadFunctions.length})
          </TabsTrigger>
          <TabsTrigger value="escrow" className="rounded data-[state=active]:bg-rose-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">
            Escrow ({escrowReadFunctions.length})
          </TabsTrigger>
          <TabsTrigger value="distributor" className="rounded data-[state=active]:bg-teal-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">
            Distributor ({distributorReadFunctions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plinko" className="mt-3">
          <ContractSection
            contractName="Plinko"
            address={PLINKO_ADDRESS}
            abi={PLINKO_ABI}
            functions={plinkoReadFunctions}
          />
        </TabsContent>

        <TabsContent value="keno" className="mt-3">
          <ContractSection
            contractName="Keno"
            address={KENO_ADDRESS}
            abi={KENO_ABI}
            functions={kenoReadFunctions}
          />
        </TabsContent>

        <TabsContent value="lottery" className="mt-3">
          <ContractSection
            contractName="Lottery"
            address={LOTTERY_INSTANT_ADDRESS}
            abi={INSTANT_LOTTERY_6OF55_ABI}
            functions={lotteryReadFunctions}
          />
        </TabsContent>

        <TabsContent value="blackjack" className="mt-3">
          <ContractSection
            contractName="Blackjack"
            address={BLACKJACK_ADDRESS}
            abi={blackjackAbi}
            functions={blackjackReadFunctions}
          />
        </TabsContent>

        <TabsContent value="escrow" className="mt-3">
          {TOURNAMENT_PRIZE_ESCROW_ADDRESS && TOURNAMENT_PRIZE_ESCROW_ADDRESS !== '0x0000000000000000000000000000000000000000' ? (
            <ContractSection
              contractName="Tournament Prize Escrow"
              address={TOURNAMENT_PRIZE_ESCROW_ADDRESS}
              abi={tournamentPrizeEscrowAbi}
              functions={escrowReadFunctions}
            />
          ) : (
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="py-4 px-3 text-xs text-slate-500 text-center">
                Escrow contract address not configured
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="distributor" className="mt-3">
          <ContractSection
            contractName="MORBIUS Holder Distributor"
            address={MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS}
            abi={morbiusHolderDistributorAbi}
            functions={distributorReadFunctions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
