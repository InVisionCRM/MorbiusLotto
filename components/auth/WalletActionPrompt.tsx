'use client';

import { useEffect, useState } from 'react';
import { Loader2, Smartphone, ArrowLeft } from 'lucide-react';

export type WalletActionPhase = 'open-wallet' | 'return-here' | 'finishing';

export type WalletActionVariant = 'sign-in' | 'transaction' | 'approval' | 'server';

export type WalletActionPromptProps = {
  visible: boolean;
  phase: WalletActionPhase;
  variant?: WalletActionVariant;
  /** e.g. "Sign in to MORBIUS" */
  title?: string;
};

type VariantCopy = Record<
  WalletActionPhase,
  { headline: string; body: string; step2?: string; step3?: string }
>;

const COPY: Record<WalletActionVariant, VariantCopy> = {
  'sign-in': {
    'open-wallet': {
      headline: 'Check your wallet app',
      body: 'We sent a sign-in request to your wallet. Open it and approve — no funds will move.',
      step2: 'Review and approve the sign-in request (not a transaction).',
      step3: 'Return to this browser tab — Morbius will complete sign-in.',
    },
    'return-here': {
      headline: 'Come back to Morbius',
      body: 'After you approve in your wallet, switch back to this browser tab to finish sign-in.',
    },
    finishing: {
      headline: 'Finishing sign-in…',
      body: 'Hang tight — we are verifying your signature and starting your session.',
    },
  },
  transaction: {
    'open-wallet': {
      headline: 'Confirm in your wallet app',
      body: 'Your wallet should open with a transaction to review. Approve it to continue.',
      step2: 'Review the amount and approve the transaction.',
      step3: 'Return to this browser tab — Morbius will pick up where you left off.',
    },
    'return-here': {
      headline: 'Come back to Morbius',
      body: 'After you approve the transaction in your wallet, switch back to this browser tab.',
    },
    finishing: {
      headline: 'Processing…',
      body: 'Waiting for the network and your balance to update.',
    },
  },
  approval: {
    'open-wallet': {
      headline: 'Approve MORBIUS spending',
      body: 'Open your wallet app and approve the token allowance — this is not a deposit yet.',
      step2: 'Approve MORBIUS so Morbius can pull your deposit amount.',
      step3: 'Return here, then tap Deposit again.',
    },
    'return-here': {
      headline: 'Come back to Morbius',
      body: 'After you approve in your wallet, switch back to this tab to continue your deposit.',
    },
    finishing: {
      headline: 'Approval received…',
      body: 'You can continue your deposit in a moment.',
    },
  },
  server: {
    'open-wallet': {
      headline: 'Check your wallet app',
      body: 'A wallet action is required before we can continue.',
    },
    'return-here': {
      headline: 'Come back to Morbius',
      body: 'Switch back to this browser tab after finishing in your wallet.',
    },
    finishing: {
      headline: 'Almost done…',
      body: 'Updating your balance on our servers.',
    },
  },
};

const DEFAULT_TITLES: Record<WalletActionVariant, string> = {
  'sign-in': 'Sign in to MORBIUS',
  transaction: 'Wallet transaction',
  approval: 'Token approval',
  server: 'Wallet action needed',
};

/**
 * Full-screen overlay for mobile WalletConnect / deep-link wallet flows.
 * Extension wallets on desktop never see this — they sign in-page.
 */
export function WalletActionPrompt({
  visible,
  phase,
  variant = 'sign-in',
  title,
}: WalletActionPromptProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  if (!visible && !mounted) return null;
  if (!visible) return null;

  const resolvedTitle = title ?? DEFAULT_TITLES[variant];
  const { headline, body, step2, step3 } = COPY[variant][phase];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 pointer-events-auto"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="wallet-action-title"
      aria-describedby="wallet-action-desc"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />

      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl"
        style={{
          boxShadow:
            '0 4px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.25),transparent_65%)] pointer-events-none" />

        <div className="relative px-5 pt-5 pb-6">
          <p
            id="wallet-action-title"
            className="text-[10px] uppercase tracking-[0.2em] font-semibold text-cyan-400/90 mb-3"
          >
            {resolvedTitle}
          </p>

          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
              {phase === 'finishing' ? (
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" aria-hidden />
              ) : phase === 'return-here' ? (
                <ArrowLeft className="w-6 h-6 text-cyan-400" aria-hidden />
              ) : (
                <Smartphone className="w-6 h-6 text-cyan-400" aria-hidden />
              )}
            </div>

            <div className="min-w-0 pt-0.5">
              <h2 className="text-lg font-semibold text-white leading-snug">{headline}</h2>
              <p id="wallet-action-desc" className="mt-2 text-sm text-white/70 leading-relaxed">
                {body}
              </p>
            </div>
          </div>

          {phase !== 'finishing' && step2 && step3 && (
            <ol className="mt-5 space-y-2 text-xs text-white/55 border-t border-white/10 pt-4">
              <li className="flex gap-2">
                <span className="text-cyan-400 font-semibold tabular-nums">1</span>
                <span>Leave this tab — your wallet app should open automatically.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400 font-semibold tabular-nums">2</span>
                <span>{step2}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400 font-semibold tabular-nums">3</span>
                <span>{step3}</span>
              </li>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
