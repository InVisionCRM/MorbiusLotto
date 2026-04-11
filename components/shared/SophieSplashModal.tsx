'use client';

import { useEffect, useState } from 'react';

const SPLASH_KEY = 'sophie_splash_seen';

interface Props {
  address: string | undefined;
  onOpenProfileSettings?: () => void;
  forceOpen?: boolean;
  onClose?: () => void;
  onEnable?: () => void;
  /** If false, skip first-visit auto-open; modal opens only when forceOpen is true (e.g. voice toggle). Default true. */
  openOnFirstVisit?: boolean;
  /** When set, shows a "How it works" link that opens the tutorial video in a new tab (e.g. Blackjack voice). */
  voiceTutorialVideoUrl?: string;
}

const BJ_COMMANDS = [
  { cmd: 'Hit',                         alts: null,                              note: 'Take a card' },
  { cmd: 'Stand',                        alts: ['Stay'],                          note: 'Hold your hand' },
  { cmd: 'Double',                       alts: ['Double down'],                   note: 'Double your bet' },
  { cmd: 'Split',                        alts: null,                              note: 'Split a pair' },
  { cmd: 'Bet [amount]',                 alts: null,                              note: 'Place a bet — confirms before firing' },
  { cmd: 'Rebet',                        alts: ['Same bet', 'Run it back', 'Again'], note: 'Repeat your last bet' },
];

const POKER_COMMANDS = [
  { cmd: 'Fold',    alts: ['Muck', 'Give up'],   note: 'Fold your hand' },
  { cmd: 'Check',   alts: ['Tap', 'Knock'],       note: 'Check / tap the table' },
  { cmd: 'Call',    alts: ['Snap'],               note: 'Call the current bet' },
  { cmd: 'Bet [amount]',   alts: null,            note: 'Open betting — confirms before firing' },
  { cmd: 'Raise [amount]', alts: null,            note: 'Raise to amount — confirms before firing' },
  { cmd: 'All in',  alts: ['Shove', 'Jam'],       note: 'Go all in — confirms before firing' },
];

function CommandRow({ cmd, alts, note }: { cmd: string; alts: string[] | null; note: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-0.5 py-2 border-b border-white/5 last:border-0">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs font-semibold text-cyan-300">"{cmd}"</span>
        {alts && (
          <div className="flex flex-wrap gap-1">
            {alts.map(a => (
              <span key={a} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">"{a}"</span>
            ))}
          </div>
        )}
      </div>
      <span className="text-right text-[11px] text-gray-500 leading-tight pt-0.5">{note}</span>
    </div>
  );
}

export function SophieSplashModal({
  address: _address,
  onOpenProfileSettings,
  forceOpen,
  onClose,
  onEnable,
  openOnFirstVisit = true,
  voiceTutorialVideoUrl,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!openOnFirstVisit) return;
    try {
      if (!localStorage.getItem(SPLASH_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, [openOnFirstVisit]);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  function dismiss() {
    try { localStorage.setItem(SPLASH_KEY, 'true'); } catch { /* ignore */ }
    setOpen(false);
    onClose?.();
  }

  function enable() {
    onEnable?.();
    dismiss();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 font-poppins"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-cyan-500/20 bg-neutral-900 shadow-2xl flex flex-col max-h-[90vh]"
        style={{ boxShadow: '0 0 60px rgba(34,211,238,0.1)' }}
      >
        {/* Header */}
        <div className="flex flex-col items-center px-8 pt-8 pb-6 border-b border-white/5 shrink-0">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.2), rgba(14,116,144,0.05))', border: '1px solid rgba(34,211,238,0.35)' }}
          >
            <svg className="h-6 w-6 text-cyan-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 8a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V21h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-1.062A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">Voice Actions</h2>
          <p className="mt-1 text-sm text-gray-400 text-center max-w-sm">
            Control the game hands-free. Speak any of the commands below and they&apos;ll be executed instantly.
          </p>
          <p className="mt-2 text-xs text-gray-600">Works in Chrome &amp; Edge — microphone access required</p>
          {voiceTutorialVideoUrl ? (
            <a
              href={voiceTutorialVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 text-sm font-medium text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
            >
              How it works
            </a>
          ) : null}
        </div>

        {/* Command grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-white/5 px-0 overflow-y-auto">
          <div className="px-6 py-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-cyan-400">Blackjack</p>
            {BJ_COMMANDS.map(c => <CommandRow key={c.cmd} {...c} />)}
          </div>
          <div className="px-6 py-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-cyan-400">Poker</p>
            {POKER_COMMANDS.map(c => <CommandRow key={c.cmd} {...c} />)}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-white/5 space-y-4 shrink-0">
          {/* Warning */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/80 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-amber-400 mb-1">
              <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
              </svg>
              Experimental feature
            </div>
            <p>Keyword-triggered — background music and chatter are unlikely to cause accidental actions, but not impossible. Nothing is recorded or stored.</p>
            <p className="font-medium text-amber-400">Always disable voice commands when stepping away from the screen.</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-gray-600">
              Toggle anytime in{' '}
              {onOpenProfileSettings ? (
                <button
                  onClick={() => { dismiss(); onOpenProfileSettings(); }}
                  className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
                >
                  Profile Settings
                </button>
              ) : (
                <span className="text-cyan-400">Profile Settings</span>
              )}
            </p>
            <div className="flex gap-3 shrink-0">
              <button
                onClick={dismiss}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-neutral-700"
              >
                Not now
              </button>
              <button
                onClick={enable}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition"
                style={{ background: 'linear-gradient(135deg, #06b6d4, #0e7490)', boxShadow: '0 0 16px rgba(6,182,212,0.25)' }}
              >
                Enable voice
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
