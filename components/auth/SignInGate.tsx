'use client';

import { Loader2, ShieldCheck, X } from 'lucide-react';

export type SignInGateProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  onSignIn: () => void;
  onCancel: () => void;
};

/**
 * One-tap "Sign in to play" prompt for mobile WalletConnect.
 *
 * On a WalletConnect deep-link, a wallet signature can only foreground the
 * wallet app from a fresh user gesture. When an authed request 401s in the
 * background (no gesture), we open this gate instead of silently signing
 * off-gesture — the Sign in button's tap IS the gesture that lets the wallet
 * deep-link fire. The "check your wallet app" overlay (WalletActionPrompt,
 * z-200) then renders above this while the signature is pending.
 */
export function SignInGate({ open, busy, error, onSignIn, onCancel }: SignInGateProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[190] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-gate-title"
    >
      <button
        type="button"
        aria-label="Cancel sign-in"
        onClick={onCancel}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl"
        style={{
          boxShadow: '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.25),transparent_65%)]" />

        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative px-5 pb-6 pt-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400/90">
            One-time sign-in
          </p>

          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10">
              <ShieldCheck className="h-6 w-6 text-cyan-400" aria-hidden />
            </div>
            <div className="min-w-0 pt-0.5">
              <h2 id="signin-gate-title" className="text-lg font-semibold leading-snug text-white">
                Sign in to play
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Tap below to open your wallet and approve a quick sign-in. It proves you own this
                wallet — no funds will move.
              </p>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onSignIn}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {busy ? 'Check your wallet…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="mt-2 w-full rounded-xl py-2 text-sm text-white/50 transition hover:text-white/80 disabled:opacity-40"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
