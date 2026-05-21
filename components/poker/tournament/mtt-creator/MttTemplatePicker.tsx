'use client';

import React from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useMttCreator } from './MttCreatorContext';
import { MTT_TEMPLATES, type MttTemplate } from './mtt-templates';

/**
 * Entry screen. Shows three preset MTT templates as large clickable cards plus a
 * "Start from scratch" option. Picking a template prefills the form and jumps to
 * Review; picking "scratch" walks the wizard from step 1.
 *
 * This screen replaces the wizard header chrome — it owns its own brand/close strip
 * and renders the giant Mitr title block itself so newbies have a clear "you're at
 * the beginning" anchor.
 */
export interface MttTemplatePickerProps {
  onClose: () => void;
}

export function MttTemplatePicker({ onClose }: MttTemplatePickerProps) {
  const { applyTemplate, go } = useMttCreator();

  const pickTemplate = (template: MttTemplate) => {
    applyTemplate(template);
    go('review');
  };

  const startFromScratch = () => {
    go('name');
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at top, rgba(6,182,212,0.10), transparent 60%), linear-gradient(180deg, #050a14 0%, #020409 100%)',
      }}
    >
      {/* Close — return to lobby */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 rounded-full p-2 text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close MTT creator"
      >
        <X size={18} />
      </button>

      <div className="mx-auto flex w-full max-w-5xl flex-col items-stretch gap-10 px-6 py-12 sm:px-10 sm:py-16">
        {/* Hero */}
        <div className="text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold uppercase text-cyan-300"
            style={{ letterSpacing: '0.2em' }}
          >
            <Sparkles size={12} /> Multi-Table Tournament
          </div>
          <h1
            className="mx-auto mt-5 max-w-3xl text-white"
            style={{
              fontFamily: '"Mitr", sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(40px, 7vw, 72px)',
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
            }}
          >
            Pick a template{' '}
            <span style={{ color: '#06b6d4', fontStyle: 'italic' }}>or build your own</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
            Templates fill in everything except your tournament name and start time. Tweak any
            setting before you publish.
          </p>
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MTT_TEMPLATES.map((t) => (
            <TemplateCard key={t.id} template={t} onPick={() => pickTemplate(t)} />
          ))}
        </div>

        {/* Divider + scratch button */}
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
          <div className="flex w-full items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-600">
            <div className="h-px flex-1 bg-white/10" />
            or
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <button
            type="button"
            onClick={startFromScratch}
            className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-white"
          >
            Start from scratch
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>

        {/* Advanced escape hatch */}
        <p className="text-center text-xs text-slate-500">
          Need a custom PRC-20 token tournament?{' '}
          <a
            href="/poker?tab=tournaments"
            className="text-cyan-400 underline-offset-2 hover:text-cyan-300 hover:underline"
          >
            Use the classic creator
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onPick,
}: {
  template: MttTemplate;
  onPick: () => void;
}) {
  const tableCount = Math.ceil(template.maxPlayers / template.seatsPerTable);
  return (
    <button
      type="button"
      onClick={onPick}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 p-5 text-left transition-all hover:-translate-y-1 hover:border-cyan-500/50"
      style={{
        background: 'linear-gradient(155deg, #0c1929 0%, #0a0f1a 60%, #0d1117 100%)',
        boxShadow: '0 14px 40px -22px rgba(6,182,212,0.25)',
      }}
    >
      {/* Hover top-edge accent */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.7), transparent)',
        }}
        aria-hidden
      />

      {template.chip && (
        <div
          className="self-start rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-300"
          style={{ letterSpacing: '0.18em' }}
        >
          {template.chip}
        </div>
      )}

      <div>
        <h3
          className="text-white"
          style={{
            fontFamily: '"Mitr", sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(22px, 2.5vw, 28px)',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
          }}
        >
          {template.label}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{template.tagline}</p>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="text-[11px] text-slate-500">
          <div className="font-mono tabular-nums">
            {template.maxPlayers} players · {tableCount} {tableCount === 1 ? 'table' : 'tables'}
          </div>
          <div className="mt-0.5 font-mono tabular-nums">
            {template.buyInMode === 'freeroll'
              ? `Freeroll · ${Number(template.guaranteedPool).toLocaleString()} pool`
              : `${Number(template.buyInChips).toLocaleString()} MORBIUS buy-in`}
          </div>
        </div>
        <ArrowRight
          size={18}
          className="shrink-0 text-cyan-400 transition-transform group-hover:translate-x-1"
        />
      </div>
    </button>
  );
}
