'use client';

import { useEffect, useState } from 'react';

const SPLASH_KEY = 'sophie_splash_seen';

interface Props {
  address: string | undefined;
  onOpenProfileSettings?: () => void;
  /** When true, force the modal open regardless of localStorage (e.g. user clicked "Voice OFF" toggle) */
  forceOpen?: boolean;
  /** Called when the modal closes (so parent can reset forceOpen state) */
  onClose?: () => void;
  /** Called when the user clicks "Enable voice" — parent is responsible for enabling */
  onEnable?: () => void;
}

export function SophieSplashModal({ address: _address, onOpenProfileSettings, forceOpen, onClose, onEnable }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SPLASH_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  // forceOpen from parent overrides localStorage check
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
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-cyan-500/30 bg-neutral-900 p-6 shadow-2xl"
        style={{ boxShadow: '0 0 40px rgba(34,211,238,0.15)' }}
      >
        {/* Glow ring */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.25), rgba(14,116,144,0.1))', border: '1px solid rgba(34,211,238,0.4)' }}>
          <svg className="h-7 w-7 text-cyan-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 8a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V21h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-1.062A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z" />
          </svg>
        </div>

        <h2 className="mb-1 text-center text-lg font-bold text-white tracking-wide">Voice Actions</h2>
        <p className="mb-4 text-center text-sm text-gray-400 leading-relaxed">
          Control the game hands-free. Speak commands and they&apos;ll be executed for you.
        </p>

        {/* Command lists */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          {/* Blackjack */}
          <div className="rounded-xl border border-white/10 bg-neutral-800/60 px-3 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-cyan-400">Blackjack</p>
            <div className="space-y-1.5">
              {[
                { cmd: '"Hit"', note: 'take a card' },
                { cmd: '"Stand"', note: 'hold hand' },
                { cmd: '"Double"', note: 'double down' },
                { cmd: '"Split"', note: 'split pair' },
                { cmd: '"Bet 500"', note: 'bet amount' },
                { cmd: '"Rebet"', note: 'repeat last bet' },
              ].map(({ cmd, note }) => (
                <div key={cmd} className="flex items-baseline justify-between gap-2">
                  <span className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 whitespace-nowrap">{cmd}</span>
                  <span className="text-[10px] text-gray-500 text-right">{note}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Poker */}
          <div className="rounded-xl border border-white/10 bg-neutral-800/60 px-3 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-cyan-400">Poker</p>
            <div className="space-y-1.5">
              {[
                { cmd: '"Fold"', note: 'fold hand' },
                { cmd: '"Check"', note: 'check / tap' },
                { cmd: '"Call"', note: 'call bet' },
                { cmd: '"Bet 500"', note: 'open bet' },
                { cmd: '"Raise 1000"', note: 'raise to amount' },
                { cmd: '"All in"', note: 'go all in' },
              ].map(({ cmd, note }) => (
                <div key={cmd} className="flex items-baseline justify-between gap-2">
                  <span className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 whitespace-nowrap">{cmd}</span>
                  <span className="text-[10px] text-gray-500 text-right">{note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mb-4 text-center text-xs text-gray-500">Works in Chrome &amp; Edge — microphone access required</p>

        {/* Caution block */}
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-amber-400">
            <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
            </svg>
            Experimental feature
          </div>
          <p>
            Voice commands are keyword-triggered — background music and general chatter are unlikely to cause accidental actions, but not impossible.
          </p>
          <p>
            Nothing is recorded or stored. The live transcript shown on screen is only to let you see what&apos;s being heard in real time.
          </p>
          <p className="font-medium text-amber-400">
            Always disable voice commands when you step away from the screen.
          </p>
        </div>

        <p className="mb-5 text-center text-xs text-gray-500">
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
          .
        </p>

        <div className="flex gap-3">
          <button
            onClick={dismiss}
            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-neutral-700"
          >
            Not now
          </button>
          <button
            onClick={enable}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #0e7490)', boxShadow: '0 0 16px rgba(6,182,212,0.3)' }}
          >
            Enable voice
          </button>
        </div>
      </div>
    </div>
  );
}
