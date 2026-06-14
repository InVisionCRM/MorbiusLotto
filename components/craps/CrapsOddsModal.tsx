'use client';

// Craps odds — the shared ArcadeOddsTab in a modal, matching the rail's
// Rules / Verify / History pattern (craps has no tab strip).

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Percent } from 'lucide-react';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { crapsOdds } from './crapsOdds';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CrapsOddsModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="arcade2-scope max-w-2xl max-h-[88vh] overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display text-xl uppercase tracking-wider text-white flex items-center gap-2">
            <Percent className="w-5 h-5 text-cyan-400" />
            Craps odds
          </DialogTitle>
        </DialogHeader>
        <div className="arc-panel rounded-xl p-3 sm:p-4 mt-1">
          <ArcadeOddsTab odds={crapsOdds} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
