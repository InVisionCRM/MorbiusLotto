'use client'

import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface SwapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SwapModal({ open, onOpenChange }: SwapModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent modalZIndex="z-[100000]" className="max-w-4xl w-full h-[80vh] p-0 bg-black border border-cyan-500/30">
        <div className="relative w-full h-full">
          <iframe
            src="https://swap.internetmoney.io/"
            className="w-full h-full rounded-lg"
            title="Internet Money Swap"
            allow="clipboard-write"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}