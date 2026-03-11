'use client';

import { useState, useEffect, useCallback } from 'react';

export interface PendingWithdrawalJob {
  jobId: string;
  status: 'queued' | 'broadcasting' | 'pending_confirmation';
  txHash?: string;
  netToUser?: string;
}

/**
 * Polls /api/withdraw/pending for an in-progress hot withdrawal job.
 * Used to show a page-level banner and disable deposit/withdraw controls
 * after a page refresh mid-withdrawal.
 */
export function usePendingWithdrawal(address: string | undefined, serverUrl: string | undefined) {
  const [job, setJob] = useState<PendingWithdrawalJob | null>(null);
  const [checked, setChecked] = useState(false);

  const check = useCallback(async () => {
    if (!address || !serverUrl) return;
    try {
      const res = await fetch(`${serverUrl}/api/withdraw/pending?address=${address}`);
      if (!res.ok) return;
      const data = await res.json();
      setJob(data.job ?? null);
    } catch {
      // ignore
    } finally {
      setChecked(true);
    }
  }, [address, serverUrl]);

  // Initial check on mount / address change
  useEffect(() => {
    setChecked(false);
    setJob(null);
    check();
  }, [check]);

  // Poll every 3s while a job is active
  useEffect(() => {
    if (!job) return;
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [job, check]);

  return { pendingJob: job, pendingChecked: checked, clearPendingJob: () => setJob(null) };
}
