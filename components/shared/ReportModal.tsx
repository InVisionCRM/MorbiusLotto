'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getRecentErrors } from '@/lib/error-log';

const CATEGORIES = ['Balance Issue', 'Game Bug', 'Transaction Failed', 'Other'] as const;
type Category = (typeof CATEGORIES)[number];

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Off-chain MORBIUS balance snapshot at time of report (optional, passed from game context) */
  balance?: bigint;
}

export function ReportModal({ isOpen, onClose, balance }: ReportModalProps) {
  const { address } = useAccount();
  const [category, setCategory] = useState<Category | ''>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCategory('');
      setDescription('');
    }
  }, [isOpen]);

  async function handleSubmit() {
    if (!category) {
      toast.error('Please select a category');
      return;
    }
    if (description.trim().length < 5) {
      toast.error('Please describe the issue (at least 5 characters)');
      return;
    }

    setSubmitting(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
      const recentErrors = getRecentErrors();

      const res = await fetch(`${serverUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address ?? null,
          category,
          description: description.trim(),
          pageUrl: typeof window !== 'undefined' ? window.location.href : null,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          balanceSnapshot: balance != null ? balance.toString() : null,
          recentErrors: recentErrors.length > 0 ? recentErrors : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      toast.success('Report submitted', { description: "Thanks — we'll look into it." });
      onClose();
    } catch (err) {
      toast.error('Failed to submit report', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = 2000 - description.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-100">Report an Issue</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full h-9 rounded-md border border-slate-600 bg-slate-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="" disabled>Select a category...</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">
              Description <span className="text-slate-500">(what happened?)</span>
            </Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
              placeholder="Describe what you were doing and what went wrong..."
              rows={5}
              className="w-full rounded-md border border-slate-600 bg-slate-100 px-3 py-2 text-sm text-black/90 placeholder:text-black/50 focus:outline-none focus:ring-1 focus:ring-slate-500 resize-none"
            />
            <p className={`text-right text-[11px] ${remaining < 100 ? 'text-amber-400' : 'text-slate-500'}`}>
              {remaining} chars remaining
            </p>
          </div>

          {/* Auto-captured debug info summary */}
          <div className="rounded-md bg-slate-800/60 border border-slate-700/50 px-3 py-2 space-y-1">
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Auto-captured debug info</p>
            <div className="text-[11px] text-slate-500 space-y-0.5">
              <p>Wallet: <span className="text-slate-300">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'not connected'}</span></p>
              <p>Page: <span className="text-slate-300 break-all">{typeof window !== 'undefined' ? window.location.pathname : '—'}</span></p>
              {balance != null && (
                <p>Balance: <span className="text-slate-300">{Number(formatEther(balance)).toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS</span></p>
              )}
              <p>Recent errors: <span className="text-slate-300">{getRecentErrors().length} captured</span></p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-white">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !category || description.trim().length < 5}
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
