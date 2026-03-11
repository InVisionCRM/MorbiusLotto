'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { TutorialHighlight, TutorialStep } from '@/lib/poker-tutorial-script';

const PADDING = 12;

function getSelector(highlight: TutorialHighlight): string | null {
  if (highlight == null) return null;
  switch (highlight) {
    case 'table':
      return '[data-tutorial-target="table"]';
    case 'dealer-button':
      return '[data-tutorial-target="seat-2"]';
    case 'your-cards':
      return '[data-tutorial-target="seat-0"]';
    case 'pot':
      return '[data-tutorial-target="pot"]';
    case 'community-cards':
      return '[data-tutorial-target="community-cards"]';
    case 'action-bar':
    case 'raise-slider':
      return '[data-tutorial-target="action-bar"]';
    case 'seat-0':
      return '[data-tutorial-target="seat-0"]';
    default:
      return null;
  }
}

export interface PokerTutorialOverlayProps {
  stepIndex: number;
  steps: TutorialStep[];
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
}

export function PokerTutorialOverlay({
  stepIndex,
  steps,
  onNext,
  onBack,
  onSkip,
  containerRef,
}: PokerTutorialOverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[stepIndex];
  const highlight = step?.highlight ?? null;
  const selector = getSelector(highlight);

  const updateRect = useCallback(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) {
      const r = el.getBoundingClientRect();
      setRect(
        new DOMRect(
          r.left - PADDING,
          r.top - PADDING,
          r.width + PADDING * 2,
          r.height + PADDING * 2
        )
      );
    } else {
      setRect(null);
    }
  }, [selector]);

  useEffect(() => {
    updateRect();
    const ro = new ResizeObserver(updateRect);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [containerRef, updateRect, stepIndex]);

  const isLast = stepIndex >= steps.length - 1;
  const isFirst = stepIndex <= 0;

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none"
      aria-modal
      role="dialog"
      aria-label="Poker tutorial"
    >
      {/* Dimmed backdrop with cutout via box-shadow */}
      <div
        className="fixed inset-0 pointer-events-auto"
        style={{
          background: highlight && rect ? 'transparent' : 'rgba(0,0,0,0.7)',
        }}
      >
        {highlight && rect && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              borderRadius: 12,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)',
              border: '2px solid rgba(34, 211, 238, 0.6)',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      {/* Step card — compact floating panel, glass style, bottom-right so board stays visible */}
      <div
        className="fixed right-3 bottom-3 sm:right-4 sm:bottom-4 z-50 pointer-events-auto w-[260px] sm:w-[280px] p-3 rounded-xl border border-cyan-500/30 shadow-xl"
        style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="text-[10px] font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
          >
            Skip
          </button>
        </div>
        <h3 className="text-sm font-bold text-cyan-400 mb-1.5 leading-tight">{step?.title}</h3>
        <p className="text-xs text-slate-300 leading-relaxed mb-3">{step?.body}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isFirst}
            className="px-3 py-1.5 rounded-lg border border-cyan-500/50 text-cyan-400 text-xs font-medium hover:bg-cyan-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={isLast ? onSkip : onNext}
            className="flex-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold hover:from-cyan-700 hover:to-blue-700 transition-colors"
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
