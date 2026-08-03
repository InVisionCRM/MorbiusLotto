'use client';

/**
 * Sound library, ported from the slot builder.
 *
 * Every shipped clip with its waveform and length, searchable and filterable by
 * duration. Clips decode lazily and draw themselves, which is what makes the
 * catalog self-describing — nothing needs hand-labelling.
 *
 * Picking a clip routes through the trimmer, same as an upload does.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SOUND_LIBRARY,
  SOUND_LIBRARY_GROUPS,
  durationBucket,
  type SoundLibraryClip,
} from '@/lib/blackjack-sound-library';
import { audioCtx, loadBuffer, waveformMinMax } from '@/lib/blackjack-sound-fx';

type Filter = 'all' | 'short' | 'medium' | 'long';

/** One row: name, group, lazily-decoded waveform + duration, preview and Use. */
function LibRow({
  clip,
  onDuration,
  onUse,
}: {
  clip: SoundLibraryClip;
  onDuration: (file: string, seconds: number) => void;
  onUse: () => void;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [dur, setDur] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadBuffer(clip.file).then((buf) => {
      if (!alive || !buf) return;
      setDur(buf.duration);
      onDuration(clip.file, buf.duration);
      const cv = cvRef.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;
      const pk = waveformMinMax(buf, 120);
      const W = cv.width;
      const H = cv.height;
      const mid = H / 2;
      const half = H / 2 - 1;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(34,211,238,.6)';
      // Display-only normalisation, same reason as the trimmer: these clips vary
      // wildly in level and a quiet one should still show its shape.
      let peak = 0;
      for (let i = 0; i < 120; i++) peak = Math.max(peak, pk[i * 2 + 1], -pk[i * 2]);
      const norm = peak > 0.001 ? 1 / peak : 1;
      const cw = W / 120;
      for (let i = 0; i < 120; i++) {
        const mn = pk[i * 2] * norm;
        const mx = pk[i * 2 + 1] * norm;
        ctx.fillRect(i * cw, mid - mx * half, Math.max(1, cw - 0.4), Math.max(1, (mx - mn) * half));
      }
    });
    return () => {
      alive = false;
    };
  }, [clip.file, onDuration]);

  return (
    <div className="bjsnd-lib-row">
      <div className="bjsnd-lib-meta">
        <div className="bjsnd-lib-name">{clip.name}</div>
        <div className="bjsnd-lib-group">
          {clip.group}
          {dur != null ? ` · ${dur.toFixed(1)}s` : ' · …'}
        </div>
      </div>
      <canvas ref={cvRef} className="bjsnd-lib-wave" width={220} height={30} />
      <button
        type="button"
        className="bjsnd-btn"
        onClick={() => {
          const c = audioCtx();
          if (!c) return;
          void loadBuffer(clip.file).then((buf) => {
            if (!buf) return;
            const src = c.createBufferSource();
            src.buffer = buf;
            const g = c.createGain();
            g.gain.value = 0.85;
            src.connect(g);
            g.connect(c.destination);
            src.start();
          });
        }}
      >
        ▶
      </button>
      <button type="button" className="bjsnd-btn on" onClick={onUse}>
        Use
      </button>
    </div>
  );
}

export function LibraryModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (clip: SoundLibraryClip) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [durations, setDurations] = useState<Record<string, number>>({});

  const noteDuration = useCallback((file: string, seconds: number) => {
    setDurations((prev) => (prev[file] === seconds ? prev : { ...prev, [file]: seconds }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOUND_LIBRARY.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.group.toLowerCase().includes(q)) return false;
      if (filter === 'all') return true;
      // An undecoded clip stays visible rather than vanishing mid-load.
      const b = durationBucket(durations[c.file] ?? null);
      return b == null || b === filter;
    });
  }, [query, filter, durations]);

  const counts = useMemo(() => {
    const c = { all: SOUND_LIBRARY.length, short: 0, medium: 0, long: 0 };
    SOUND_LIBRARY.forEach((clip) => {
      const b = durationBucket(durations[clip.file] ?? null);
      if (b) c[b] += 1;
    });
    return c;
  }, [durations]);

  return (
    <div className="bjsnd-ov open" onPointerDown={onClose}>
      <div
        className="bjsnd-trim-card"
        role="dialog"
        aria-modal="true"
        aria-label="Sound library"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="bjsnd-trim-head">
          <div className="bjsnd-trim-title">Sound library</div>
          <button type="button" className="bjsnd-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="bjsnd-lib-bar">
          <input
            type="search"
            placeholder="Search clips…"
            aria-label="Search clips"
            className="bjsnd-lib-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {(['all', 'short', 'medium', 'long'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`bjsnd-lib-chip${filter === f ? ' on' : ''}`}
              title={
                f === 'short' ? 'under 1.5s' : f === 'medium' ? '1.5s – 4s' : f === 'long' ? 'over 4s' : undefined
              }
              onClick={() => setFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)} <span className="cnt">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="bjsnd-lib-list">
          {SOUND_LIBRARY_GROUPS.map((group) => {
            const rows = visible.filter((c) => c.group === group);
            if (!rows.length) return null;
            return (
              <div key={group}>
                <div className="bjsnd-lib-grouphead">{group}</div>
                {rows.map((clip) => (
                  <LibRow
                    key={clip.file}
                    clip={clip}
                    onDuration={noteDuration}
                    onUse={() => onPick(clip)}
                  />
                ))}
              </div>
            );
          })}
          {visible.length === 0 && <div className="bjsnd-lib-empty">No clips match.</div>}
        </div>
      </div>
    </div>
  );
}
