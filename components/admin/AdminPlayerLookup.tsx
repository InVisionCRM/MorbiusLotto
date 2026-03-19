'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAddress, getAddress } from 'viem';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserSearch } from 'lucide-react';

/**
 * Admin-only: jump to /player/[address] (player stats dashboard) for any wallet.
 */
export default function AdminPlayerLookup() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = useCallback(() => {
    const raw = value.trim();
    if (!raw) {
      setError('Enter a wallet address');
      return;
    }
    if (!isAddress(raw)) {
      setError('Invalid address (expected 0x + 40 hex characters)');
      return;
    }
    setError(null);
    router.push(`/player/${getAddress(raw)}`);
  }, [value, router]);

  return (
    <Card className="mb-4 border border-slate-700/50 bg-slate-900/40">
      <CardHeader className="py-3 px-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-100">
          <UserSearch className="w-4 h-4 text-cyan-400/90" />
          Player dashboard
        </CardTitle>
        <CardDescription className="text-xs text-slate-500">
          Enter any wallet address to open that player&apos;s stats dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4">
        <form
          className="flex flex-col sm:flex-row gap-2 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label htmlFor="admin-player-address" className="text-[11px] text-slate-400">
              Wallet address
            </Label>
            <Input
              id="admin-player-address"
              type="text"
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              className="font-mono text-xs h-9 bg-slate-950/80 border-slate-600/60 text-slate-100 placeholder:text-slate-600"
            />
            {error ? <p className="text-[11px] text-red-400/90">{error}</p> : null}
          </div>
          <Button
            type="submit"
            size="sm"
            className="shrink-0 bg-cyan-600 hover:bg-cyan-500 text-white h-9 text-xs"
          >
            Open dashboard
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
