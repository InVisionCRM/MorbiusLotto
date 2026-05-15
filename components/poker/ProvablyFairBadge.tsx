'use client';

import { useState } from 'react';
import { Shield, ExternalLink } from 'lucide-react';

/**
 * Small mid-hand provably-fair indicator. Shows a shield icon with the first
 * 12 characters of the deck commitment hash; the full hash + an explanation
 * appear in a tooltip on hover/focus. After the hand finishes a "verify ↗"
 * link surfaces alongside (parent passes `handId` once it's safe to expose).
 *
 * Renders nothing if `serverSeedHash` is missing (e.g. legacy hands, or
 * pre-deal state before the server has populated it).
 */
export function ProvablyFairBadge({
  serverSeedHash,
  handId,
  isComplete,
}: {
  serverSeedHash?: string | null;
  handId?: string | null;
  /** When true, the verify link replaces the in-flight messaging. */
  isComplete?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!serverSeedHash) return null;

  const short = serverSeedHash.length > 12 ? `${serverSeedHash.slice(0, 12)}…` : serverSeedHash;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-300/80 bg-cyan-950/30 border border-cyan-500/30 hover:bg-cyan-900/40 hover:text-cyan-200 transition-colors"
        title="Provably-fair deck commitment"
        aria-label={`Provably-fair deck commitment ${serverSeedHash}`}
      >
        <Shield className="w-3 h-3" aria-hidden />
        <span className="font-mono">{short}</span>
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-cyan-500/30 bg-slate-950/95 p-3 text-xs text-white/80 shadow-xl backdrop-blur"
        >
          <div className="font-semibold text-cyan-300 mb-1 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Deck commitment
          </div>
          <p className="mb-2 leading-snug text-white/70">
            The server published this hash <span className="text-white">before</span> any card was
            dealt. After the hand finishes, the secret seed is revealed —{' '}
            <span className="text-white">re-hashing it must produce this exact value</span>, proving
            the deck was locked in advance.
          </p>
          <div className="rounded bg-white/5 p-1.5 font-mono text-[10px] break-all text-white/90">
            {serverSeedHash}
          </div>
          {isComplete && handId ? (
            <a
              href={`/poker/verify?handId=${handId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
            >
              Verify this hand <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <div className="mt-2 text-white/50">
              Seed reveals at showdown.{' '}
              <a
                href="/poker/verify"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300"
              >
                Learn more
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
