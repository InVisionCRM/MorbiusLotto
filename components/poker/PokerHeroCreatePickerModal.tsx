'use client';

import React from 'react';
import { X, Coins, Trophy, Layers } from 'lucide-react';

const PANEL_BG = 'linear-gradient(155deg, #0c1929 0%, #0a0f1a 50%, #0d1117 100%)';

export interface PokerHeroCreatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  onCreateCash: () => void;
  onCreateTournament: () => void;
  onCreateMtt: () => void;
}

interface CreateOption {
  id: string;
  title: string;
  description: string;
  badge?: string;
  icon: React.ReactNode;
  accentClass: string;
  iconBg: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}

export function PokerHeroCreatePickerModal({
  isOpen,
  onClose,
  isConnected,
  onCreateCash,
  onCreateTournament,
  onCreateMtt,
}: PokerHeroCreatePickerModalProps) {
  if (!isOpen) return null;

  const options: CreateOption[] = [
    {
      id: 'cash',
      title: 'Cash game',
      description: 'Host a no-limit Hold\'em table with custom blinds and seats.',
      icon: <Coins className="w-5 h-5" aria-hidden />,
      accentClass: 'hover:border-cyan-400/40 hover:bg-cyan-500/[0.06]',
      iconBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
      onClick: () => {
        onClose();
        onCreateCash();
      },
      disabled: !isConnected,
      hint: !isConnected ? 'Connect wallet to host' : undefined,
    },
    {
      id: 'sng',
      title: 'Sit & Go',
      description: 'Create a single-table tournament that starts when seats fill.',
      icon: <Trophy className="w-5 h-5" aria-hidden />,
      accentClass: 'hover:border-amber-400/40 hover:bg-amber-500/[0.06]',
      iconBg: 'bg-amber-500/15 text-amber-200 border-amber-500/25',
      onClick: () => {
        onClose();
        onCreateTournament();
      },
    },
    {
      id: 'mtt',
      title: 'Multi-table (MTT)',
      description: 'Schedule a large field with levels, payouts, and late reg.',
      badge: 'new',
      icon: <Layers className="w-5 h-5" aria-hidden />,
      accentClass: 'hover:border-blue-400/40 hover:bg-blue-500/[0.06]',
      iconBg: 'bg-blue-500/15 text-blue-200 border-blue-500/25',
      onClick: () => {
        onClose();
        onCreateMtt();
      },
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poker-create-picker-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/10"
        style={{ background: PANEL_BG }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" aria-hidden />

        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="px-5 pt-6 pb-5 sm:px-7 sm:pt-7 sm:pb-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-400/80 font-bold">
            Create a game
          </div>
          <h2 id="poker-create-picker-title" className="mt-1 text-xl sm:text-2xl font-bold text-white pr-8">
            What do you want to host?
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Pick a format — you can always join existing tables below with Play.
          </p>

          <div className="mt-5 space-y-3">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={opt.disabled}
                onClick={opt.onClick}
                className={`w-full text-left rounded-xl border border-white/[0.08] bg-slate-900/50 p-4 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900/50 ${opt.accentClass}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${opt.iconBg}`}
                  >
                    {opt.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{opt.title}</span>
                      {opt.badge ? (
                        <span className="rounded-full bg-cyan-300/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-cyan-100 tracking-wider">
                          {opt.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed">{opt.description}</p>
                    {opt.hint ? (
                      <p className="mt-1.5 text-[11px] font-medium text-amber-300/90">{opt.hint}</p>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
