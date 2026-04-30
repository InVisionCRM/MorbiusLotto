'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const SPLASH_KEY = 'sophie_splash_seen';

const PRIMARY_BTN =
  'rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-slate-900';

const PRIMARY_BTN_STYLE: CSSProperties = {
  background: 'linear-gradient(to right, rgb(8 145 178), rgb(37 99 235))',
  boxShadow: '0 2px 12px rgba(34, 211, 238, 0.25)',
};

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
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-0.5 border-b border-white/10 py-2.5 last:border-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-xs font-semibold text-cyan-400">&quot;{cmd}&quot;</span>
        {alts && (
          <div className="flex flex-wrap gap-1">
            {alts.map(a => (
              <span
                key={a}
                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
              >
                &quot;{a}&quot;
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="pt-0.5 text-right text-[11px] leading-tight text-slate-500">{note}</span>
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
      className="surface-modal-shell z-[200]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sophie-voice-title"
      aria-describedby="sophie-voice-desc"
    >
      <div
        className="surface-modal-card relative flex max-h-[90vh] min-h-0 w-full max-w-2xl flex-col items-center justify-center overflow-hidden"
        style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
        <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col self-stretch px-5 pt-6 pb-6 sm:px-7 sm:pt-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-400/90">Voice</p>
          <h2 id="sophie-voice-title" className="mb-3 text-xl font-bold text-white sm:text-2xl">
            Voice actions
          </h2>
          <div id="sophie-voice-desc" className="space-y-3 text-sm leading-relaxed text-slate-300">
            <p>
              <span className="font-medium text-slate-200">Hands-free control:</span>{' '}
              speak any of the commands below and they&apos;ll run when it&apos;s your turn (bet amounts confirm before firing).
            </p>
            <p className="text-slate-400 text-sm">
              Works in Chrome &amp; Edge — microphone access required.
            </p>
            {voiceTutorialVideoUrl ? (
              <p>
                <a
                  href={voiceTutorialVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
                >
                  How it works
                </a>
                <span className="text-slate-500"> — short tutorial (new tab)</span>
              </p>
            ) : null}
          </div>

          <div className="mt-5 grid min-h-0 flex-1 grid-cols-1 gap-0 divide-white/10 overflow-y-auto border-t border-white/10 pt-4 sm:grid-cols-2 sm:divide-x">
            <div className="min-h-0 px-0 pb-2 sm:pr-5 sm:pb-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-400/90">Blackjack</p>
              {BJ_COMMANDS.map(c => <CommandRow key={c.cmd} {...c} />)}
            </div>
            <div className="min-h-0 px-0 pt-4 sm:pl-5 sm:pt-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-400/90">Poker</p>
              {POKER_COMMANDS.map(c => <CommandRow key={c.cmd} {...c} />)}
            </div>
          </div>

          <div className="mt-5 space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-xs leading-relaxed text-slate-300">
            <div className="flex items-center gap-1.5 font-semibold text-amber-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
                  clipRule="evenodd"
                />
              </svg>
              Experimental feature
            </div>
            <p>
              Keyword-triggered — loud audio nearby is unlikely to trigger actions, but not impossible. Nothing is
              recorded or stored.
            </p>
            <p className="font-medium text-amber-400/95">
              Disable voice when stepping away from the screen.
            </p>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Toggle anytime in{' '}
            {onOpenProfileSettings ? (
              <button
                type="button"
                onClick={() => { dismiss(); onOpenProfileSettings(); }}
                className="font-medium text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
              >
                Profile Settings
              </button>
            ) : (
              <span className="font-medium text-cyan-400">Profile Settings</span>
            )}
            .
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={dismiss}
              className="w-full rounded-xl border border-white/15 bg-slate-900/40 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800/80 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:ring-offset-2 focus:ring-offset-slate-900 sm:w-auto sm:min-w-[140px]"
            >
              Not now
            </button>
            <button type="button" onClick={enable} className={`${PRIMARY_BTN} w-full sm:min-w-[200px]`} style={PRIMARY_BTN_STYLE}>
              Enable voice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
