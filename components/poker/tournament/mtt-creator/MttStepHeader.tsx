'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { MTT_STEP_TAGS, MTT_WIZARD_STEPS, useMttCreator } from './MttCreatorContext';

/**
 * Shared chrome rendered at the top of every wizard step (NOT shown on template or review screens).
 *
 * Visual language mirrors PokerOnboardingChecklist:
 *   - Mitr display font for the giant remaining-steps counter
 *   - Segmented progress bar with cyan fill on active + done; pulse animation on active
 *   - Brutalist uppercase tag row beneath the bar
 *   - Cyan top-accent line + radial glow
 *
 * Layout: header is FULL-WIDTH (no padding on the host element). The card containing
 * the step's form sits below this header.
 */
export interface MttStepHeaderProps {
  onClose: () => void;
}

export function MttStepHeader({ onClose }: MttStepHeaderProps) {
  const { screen, stepIndex, stepCount } = useMttCreator();

  const rows = useMemo(() => {
    return MTT_WIZARD_STEPS.map((s, i) => {
      const state: 'done' | 'active' | 'todo' =
        i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo';
      return { tag: MTT_STEP_TAGS[s], state };
    });
  }, [stepIndex]);

  const remaining = Math.max(0, stepCount - stepIndex - 1);
  const remainingLabel = remaining === 1 ? 'Step left' : 'Steps left';
  const activeTag = stepIndex >= 0 ? MTT_STEP_TAGS[MTT_WIZARD_STEPS[stepIndex]] : '';

  // Header is hidden on the template picker + the review screen — both have their own chrome.
  if (screen === 'template' || screen === 'review') return null;

  return (
    <div
      className="relative w-full overflow-hidden border-b border-cyan-500/20"
      style={{
        background: 'linear-gradient(135deg, #0c1929 0%, #050a14 100%)',
      }}
    >
      {/* Cyan radial glow on the right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 92% 50%, rgba(6,182,212,0.18), transparent 60%)',
        }}
        aria-hidden
      />
      {/* Top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55), transparent)',
        }}
        aria-hidden
      />

      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close MTT creator"
      >
        <X size={16} />
      </button>

      <div className="relative mx-auto grid w-full max-w-5xl items-center gap-6 px-6 py-7 sm:gap-8 sm:px-9 sm:py-8 lg:grid-cols-[1fr_auto]">
        {/* Left: label + heading + bar + tags */}
        <div className="min-w-0">
          <div
            className="text-[11px] font-bold uppercase text-cyan-400"
            style={{ letterSpacing: '0.3em' }}
          >
            Create MTT
          </div>

          <h2
            className="mt-2 text-white"
            style={{
              fontFamily: '"Mitr", sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(32px, 5vw, 56px)',
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
            }}
          >
            {activeTag}{' '}
            <span style={{ color: '#06b6d4', fontStyle: 'italic' }}>
              your tournament
            </span>
          </h2>

          <p className="mt-4 max-w-[460px] text-sm leading-relaxed text-slate-400 sm:text-[15px]">
            One decision at a time. You can jump back to edit anything before publishing.
          </p>

          {/* Segmented progress bar */}
          <div className="mt-6 flex gap-1.5" aria-hidden>
            {rows.map((row, i) => (
              <div
                key={i}
                className="h-1.5 flex-1 overflow-hidden rounded-full"
                style={{
                  background:
                    row.state === 'done'
                      ? '#06b6d4'
                      : row.state === 'active'
                        ? 'linear-gradient(90deg, #06b6d4 50%, rgba(6,182,212,0.2) 50%)'
                        : 'rgba(148,163,184,0.15)',
                  animation:
                    row.state === 'active' ? 'mtt-step-flash 1.8s ease-in-out infinite' : undefined,
                }}
              />
            ))}
          </div>

          {/* Brutalist tag row */}
          <div className="mt-2.5 flex gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
            {rows.map((row) => (
              <div
                key={row.tag}
                className="flex-1"
                style={{
                  color:
                    row.state === 'done'
                      ? '#06b6d4'
                      : row.state === 'active'
                        ? '#ffffff'
                        : '#475569',
                }}
              >
                {row.tag}
              </div>
            ))}
          </div>
        </div>

        {/* Right: giant Mitr counter */}
        <div className="flex flex-row items-end gap-5 lg:flex-col lg:items-end lg:gap-5">
          <div className="text-right">
            <div
              className="text-white tabular-nums"
              style={{
                fontFamily: '"Mitr", sans-serif',
                fontWeight: 700,
                fontSize: 'clamp(80px, 14vw, 140px)',
                lineHeight: 0.85,
                letterSpacing: '-0.05em',
              }}
            >
              {remaining}
            </div>
            <div
              className="mt-1 text-[11px] font-bold uppercase text-cyan-400"
              style={{ letterSpacing: '0.2em' }}
            >
              {remainingLabel}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes mtt-step-flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}
