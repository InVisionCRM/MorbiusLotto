'use client'

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PresetAmountsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAmount: (amount: number) => void;
}

const PRESET_AMOUNTS = [
  0.10, 0.20,
  0.30, 0.40,
  0.50, 0.60,
  0.70, 0.80,
  1.20, 2.00,
  4.00, 10.00,
  20.00, 50.00,
  100.00
];

export default function PresetAmountsModal({
  open,
  onOpenChange,
  onSelectAmount
}: PresetAmountsModalProps) {
  const handleSelectAmount = (amount: number) => {
    onSelectAmount(amount);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-gradient-to-b from-gray-700 to-gray-800 border-gray-600">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-center">Bet USD</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 p-4">
          {PRESET_AMOUNTS.map((amount) => (
            <button
              key={amount}
              onClick={() => handleSelectAmount(amount)}
              className="bg-gradient-to-b from-gray-600 to-gray-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-3 px-4 rounded-lg shadow-md active:scale-95 transition-all border border-gray-500"
            >
              {amount.toFixed(2)}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
