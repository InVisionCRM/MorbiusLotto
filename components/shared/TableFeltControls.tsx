'use client';

/**
 * TableFeltControls — the two felt preferences every table game shares: sound
 * on/off and which back the cards wear.
 *
 * Both persist globally rather than per game (see lib/table-audio.ts and
 * lib/table-card-backs.ts), so this is deliberately a thin control surface over
 * that shared state rather than a place to keep any.
 *
 * A game uses it in two lines:
 *
 *   const felt = useTableFelt();
 *   <TableFeltControls felt={felt} />          // in the header
 *   <TableCard back={felt.back} … />           // wherever cards render
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Layers } from 'lucide-react';
import { tableAudio } from '@/lib/table-audio';
import {
  DEFAULT_CARD_BACK,
  TABLE_CARD_BACKS,
  loadCardBack,
  saveCardBack,
  type TableCardBack,
} from '@/lib/table-card-backs';

export interface TableFelt {
  muted: boolean;
  toggleMute: () => void;
  back: TableCardBack;
  setBack: (b: TableCardBack) => void;
}

export function useTableFelt(): TableFelt {
  // Start from the defaults on both server and first client render, then adopt
  // the stored preferences in an effect. Reading localStorage during render
  // would make the markup differ between server and client and hydration would
  // throw the whole felt away.
  const [muted, setMuted] = useState(false);
  const [back, setBackState] = useState<TableCardBack>(DEFAULT_CARD_BACK);

  useEffect(() => {
    setMuted(tableAudio.muted);
    setBackState(loadCardBack());
  }, []);

  const toggleMute = useCallback(() => {
    tableAudio.init();
    setMuted(tableAudio.toggleMute());
  }, []);

  const setBack = useCallback((b: TableCardBack) => {
    setBackState(b);
    saveCardBack(b.id);
  }, []);

  return { muted, toggleMute, back, setBack };
}

export function TableFeltControls({ felt }: { felt: TableFelt }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close the back picker on an outside click, so it behaves like every other
  // popover on the site rather than trapping the player.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="flex items-center gap-1.5" ref={wrapRef}>
      <button
        type="button"
        onClick={felt.toggleMute}
        aria-label={felt.muted ? 'Unmute sound' : 'Mute sound'}
        title={felt.muted ? 'Unmute' : 'Mute'}
        className="rounded-md border border-cyan-500/25 bg-cyan-500/5 p-1.5 text-cyan-300 transition-colors hover:bg-cyan-500/15"
      >
        {felt.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Choose card back"
          aria-expanded={open}
          title="Card back"
          className="rounded-md border border-cyan-500/25 bg-cyan-500/5 p-1.5 text-cyan-300 transition-colors hover:bg-cyan-500/15"
        >
          <Layers className="h-4 w-4" />
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-1.5 w-[188px] rounded-lg border border-cyan-500/25 bg-[#061520] p-2 shadow-[0_10px_30px_-10px_rgba(0,0,0,.9)]">
            <div className="mb-1.5 px-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Card back
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {TABLE_CARD_BACKS.map((b) => {
                const active = b.id === felt.back.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      felt.setBack(b);
                      setOpen(false);
                    }}
                    title={b.label}
                    aria-label={b.label}
                    aria-pressed={active}
                    className={`flex items-center justify-center rounded transition-transform hover:scale-105 ${
                      active ? 'ring-2 ring-cyan-400' : ''
                    }`}
                    style={{
                      aspectRatio: '5 / 7',
                      background: b.background,
                      boxShadow: b.boxShadow,
                      color: b.glyphColor,
                      fontSize: 12,
                    }}
                  >
                    {b.glyph}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 px-0.5 text-[10px] text-slate-500">{felt.back.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}
