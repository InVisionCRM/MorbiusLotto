'use client';

/**
 * HeistVault — the immersive vault room for /heist (faithful port of the
 * approved lab, public/heist-lab.html).
 *
 * Reproduces the lab's vault scene: a cyan spotlight shaft + grid wall, two
 * sweeping rose laser lines, a loot read-out, and a row of dial-faced vault
 * doors. The current room's doors are live and clickable; once a pick resolves,
 * the chosen safe door glows amber with the gained loot, the others dim; on a
 * bust every alarm door in the room strobes rose with an ✕. A win/loss banner
 * overlays the scene. Purely presentational — the parent owns state, money and
 * sounds.
 */

import type { ReactNode } from 'react';

export type DoorState =
  | { kind: 'idle' }
  | { kind: 'safe'; gain: number }
  | { kind: 'alarm' }
  | { kind: 'dim' };

interface HeistVaultProps {
  doors: number;
  /** Per-door visual state for the live/just-resolved room. */
  doorStates: DoorState[];
  /** Clickable doors (true while the room is live and not busy). */
  clickable: boolean;
  loot: number;
  vaultMid: string;
  /** Banner overlay, or null. */
  banner: { kind: 'win' | 'loss'; title: string; value: string } | null;
  onPick: (door: number) => void;
}

function Dial(): ReactNode {
  return (
    <span className="heist-dial">
      <span className="heist-knob" />
    </span>
  );
}

export function HeistVault({
  doors,
  doorStates,
  clickable,
  loot,
  vaultMid,
  banner,
  onPick,
}: HeistVaultProps) {
  return (
    <div className="heist-vault relative flex min-h-[clamp(280px,55vw,360px)] flex-col items-center justify-center gap-3.5 overflow-hidden rounded-2xl px-3.5 py-5">
      {/* Sweeping lasers (decorative). */}
      <div className="heist-laser" style={{ top: '24%' }} />
      <div className="heist-laser" style={{ top: '68%' }} />

      {/* Loot read-out. */}
      <div className="z-[2] flex items-center gap-2 font-[var(--font-arc-mono)] text-sm text-amber-200">
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Loot</span>
        <span className="arc-mono tabular-nums">{loot.toLocaleString()}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">chips</span>
      </div>

      {/* Doors. */}
      <div
        className="z-[2] flex justify-center"
        style={{ gap: 'clamp(10px, 3vw, 18px)' }}
      >
        {Array.from({ length: doors }).map((_, i) => {
          const st = doorStates[i] ?? { kind: 'idle' as const };
          const cls =
            st.kind === 'safe'
              ? 'heist-door heist-door-safe'
              : st.kind === 'alarm'
                ? 'heist-door heist-door-alarm'
                : st.kind === 'dim'
                  ? 'heist-door heist-door-dim'
                  : 'heist-door';
          return (
            <button
              key={i}
              type="button"
              disabled={!clickable}
              onClick={() => onPick(i)}
              aria-label={`Vault door ${i + 1}`}
              className={cls}
            >
              {st.kind === 'safe' ? (
                <span className="heist-vc heist-vc-safe arc-mono">
                  +{st.gain.toLocaleString()}
                </span>
              ) : st.kind === 'alarm' ? (
                <span className="heist-vc heist-vc-alarm">✕</span>
              ) : (
                <Dial />
              )}
            </button>
          );
        })}
      </div>

      {/* Status line. */}
      <div className="z-[2] min-h-[18px] text-center text-[12.5px] text-slate-300 drop-shadow-[0_1px_4px_#000]">
        {vaultMid}
      </div>

      {/* Win / loss banner. */}
      {banner && (
        <div className="pointer-events-none absolute inset-0 z-[9] grid place-items-center">
          <div
            className={[
              'arc-banner-in rounded-2xl px-7 py-4 text-center',
              banner.kind === 'win'
                ? 'bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.24),rgba(4,12,19,0.6))] ring-1 ring-amber-500/50 shadow-[0_0_50px_-8px_rgba(245,158,11,0.55)]'
                : 'bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.2),rgba(4,12,19,0.65))] ring-1 ring-rose-400/45',
            ].join(' ')}
          >
            <div
              className={`text-[12px] uppercase tracking-[0.22em] ${
                banner.kind === 'win' ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              {banner.title}
            </div>
            <div className="arc-mono mt-1 text-[clamp(24px,7vw,38px)] font-bold tabular-nums text-white">
              {banner.value}
            </div>
          </div>
        </div>
      )}

      {/* Scoped styles for the vault scene — faithful to the lab. */}
      <style jsx>{`
        .heist-vault {
          background:
            radial-gradient(ellipse 60% 50% at 50% 0%, rgba(34, 211, 238, 0.1), transparent 60%),
            linear-gradient(180deg, #0a141d, #050c12);
        }
        .heist-vault::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent 0 38px,
            rgba(34, 211, 238, 0.05) 38px 39px
          );
          pointer-events: none;
        }
        .heist-laser {
          position: absolute;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(251, 113, 133, 0.4), transparent);
          opacity: 0.5;
          pointer-events: none;
        }
        .heist-door {
          width: clamp(74px, 21vw, 104px);
          aspect-ratio: 4 / 5;
          border-radius: 12px;
          background: linear-gradient(160deg, #2b3744, #161f29);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            0 12px 22px -10px rgba(0, 0, 0, 0.85),
            0 0 0 1px rgba(34, 211, 238, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition:
            transform 0.15s,
            box-shadow 0.2s;
        }
        .heist-door:disabled {
          cursor: default;
        }
        .heist-door:not(:disabled):hover {
          transform: translateY(-3px);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            0 16px 26px -10px rgba(0, 0, 0, 0.9),
            0 0 0 1px rgba(34, 211, 238, 0.35);
        }
        .heist-door-safe {
          background: radial-gradient(circle at 50% 45%, rgba(245, 158, 11, 0.3), rgba(34, 211, 238, 0.12));
          box-shadow:
            0 0 26px -4px #f59e0b,
            0 0 0 2px #22d3ee;
        }
        .heist-door-alarm {
          background: radial-gradient(circle at 50% 45%, rgba(251, 113, 133, 0.4), rgba(40, 8, 12, 0.6));
          box-shadow:
            0 0 30px -2px #fb7185,
            0 0 0 2px #fb7185;
          animation: heist-strobe 0.18s steps(2) 4;
        }
        .heist-door-dim {
          opacity: 0.4;
        }
        @keyframes heist-strobe {
          0% {
            filter: brightness(1);
          }
          100% {
            filter: brightness(1.8);
          }
        }
        .heist-vc {
          position: relative;
          z-index: 2;
        }
        .heist-vc-safe {
          font-weight: 700;
          color: #fbd36b;
          font-size: 15px;
          text-shadow: 0 0 10px rgba(245, 158, 11, 0.7);
        }
        .heist-vc-alarm {
          color: #fecdd3;
          font-size: 24px;
        }
        .heist-dial {
          width: 46%;
          aspect-ratio: 1;
          border-radius: 50%;
          border: 3px solid rgba(34, 211, 238, 0.35);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .heist-dial::before {
          content: '';
          position: absolute;
          width: 60%;
          height: 3px;
          background: rgba(34, 211, 238, 0.5);
          border-radius: 2px;
        }
        .heist-dial::after {
          content: '';
          position: absolute;
          height: 60%;
          width: 3px;
          background: rgba(34, 211, 238, 0.5);
          border-radius: 2px;
        }
        .heist-knob {
          width: 18%;
          aspect-ratio: 1;
          border-radius: 50%;
          background: rgba(34, 211, 238, 0.5);
          position: absolute;
          top: 12%;
        }
      `}</style>
    </div>
  );
}
