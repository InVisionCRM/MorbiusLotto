'use client';

// ArcadeFAQ — a neat, themeable FAQ accordion shared by every arcade game's
// info tabs. Questions render in the arc-display face; answers in readable prose.
// `accent` colours the open/hover question and any highlighted terms.

import type { CSSProperties, ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export interface FaqItem {
  q: string;
  a: ReactNode;
}

interface ArcadeFAQProps {
  items: FaqItem[];
  accent?: string;
}

export function ArcadeFAQ({ items, accent = '#22D3EE' }: ArcadeFAQProps) {
  const rootStyle = { ['--faq-accent']: accent } as CSSProperties;
  return (
    <Accordion type="single" collapsible className="w-full" style={rootStyle}>
      {items.map((it, i) => (
        <AccordionItem key={i} value={`faq-${i}`} className="border-white/[0.06]">
          <AccordionTrigger className="arc-display py-3.5 text-left text-[13px] font-semibold uppercase tracking-wide text-slate-200 transition-colors hover:text-[var(--faq-accent)] hover:no-underline data-[state=open]:text-[var(--faq-accent)]">
            {it.q}
          </AccordionTrigger>
          <AccordionContent className="space-y-2.5 pb-4 text-[13px] leading-relaxed text-slate-400">
            {it.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
