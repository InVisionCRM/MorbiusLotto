'use client'

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RiskLevel } from '@/app/PLINKO/types';

interface HistoryItem {
  id: number;
  multiplier: number;
  risk: RiskLevel;
}

interface ExtendedHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: HistoryItem[];
}

export default function ExtendedHistoryModal({
  open,
  onOpenChange,
  history
}: ExtendedHistoryModalProps) {

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[280px] p-2 z-[100]"
        style={{
          background: 'linear-gradient(145deg,rgb(16, 26, 35),rgb(35, 36, 41))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xs font-bold text-white uppercase tracking-wide text-center">All Results</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
          <div className="grid grid-cols-4 gap-1.5">
            {history.length > 0 ? history.map((item) => (
              <div
                key={item.id}
                className="rounded-sm px-2 py-2 text-center font-black text-lg text-white/60 transition-transform hover:scale-105"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  border: '1px inset rgba(60, 60, 60, 0.5)',
                }}
              >
                {item.multiplier}
              </div>
            )) : (
              <div className="col-span-4 text-center text-white py-4 text-sm">
                No results yet
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
