'use client';

// MinesInfoTabs — gives /mines2 a tab row (it previously rendered history alone)
// so the FAQ has a home next to the player's round history.

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { MinesHistory } from './MinesHistory';
import { minesFaqs } from './minesFaqs';
import { minesOdds } from './minesOdds';
import type { MinesHistoryRound } from '@/lib/mines-client';

const TRIGGER_CLASS =
  'arc-display rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500 ' +
  'transition-colors hover:text-slate-300 data-[state=active]:bg-cyan-500/15 ' +
  'data-[state=active]:text-cyan-300 data-[state=active]:ring-1 data-[state=active]:ring-cyan-500/50';

interface MinesInfoTabsProps {
  rounds: MinesHistoryRound[];
  loading: boolean;
  onVerify: (roundId: string) => void;
}

export function MinesInfoTabs({ rounds, loading, onVerify }: MinesInfoTabsProps) {
  return (
    <section aria-label="Mines information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="mine">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My rounds</TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>Odds</TabsTrigger>
          <TabsTrigger value="faq" className={TRIGGER_CLASS}>FAQ</TabsTrigger>
        </TabsList>
        <TabsContent value="mine" className="mt-3 focus-visible:outline-none">
          <MinesHistory rounds={rounds} loading={loading} onVerify={onVerify} />
        </TabsContent>
        <TabsContent value="odds" className="mt-3 focus-visible:outline-none">
          <ArcadeOddsTab odds={minesOdds} />
        </TabsContent>
        <TabsContent value="faq" className="mt-2 focus-visible:outline-none">
          <ArcadeFAQ items={minesFaqs} accent="#22D3EE" />
        </TabsContent>
      </Tabs>
    </section>
  );
}
