'use client'

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RiskLevel } from '../types';

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
  // Function to determine color based on risk level and multiplier
  const getMultiplierColor = (item: HistoryItem) => {
    const isDark = item.multiplier < 1;

    if (item.risk === 'GREEN') {
      return isDark ? 'bg-[rgb(100,140,45)]' : 'bg-[rgb(140,185,60)]';
    } else if (item.risk === 'YELLOW') {
      return isDark ? 'bg-[rgb(200,190,30)]' : 'bg-[rgb(255,240,60)]';
    } else if (item.risk === 'RED') {
      return isDark ? 'bg-[rgb(160,35,35)]' : 'bg-[rgb(210,50,50)]';
    }
    return 'bg-gray-500';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px] bg-gradient-to-b from-teal-700 to-teal-800 border-2 border-teal-600 p-3">
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-bold text-white uppercase tracking-wide">Last Results</DialogTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-full border-2 border-white/40 bg-white/10 hover:bg-white/20 text-white transition-all flex items-center justify-center"
            >
              <i className="fas fa-sync-alt text-xs"></i>
            </button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
          <div className="grid grid-cols-4 gap-1.5">
            {history.length > 0 ? history.map((item) => (
              <div
                key={item.id}
                className={`${getMultiplierColor(item)} rounded-lg px-2 py-1.5 text-center font-black text-xs shadow-[0_2px_4px_rgba(0,0,0,0.3)] border border-black/20 text-black transition-transform hover:scale-105`}
              >
                {item.multiplier}
              </div>
            )) : (
              <div className="col-span-4 text-center text-white/60 py-4 text-xs">
                No results yet
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
