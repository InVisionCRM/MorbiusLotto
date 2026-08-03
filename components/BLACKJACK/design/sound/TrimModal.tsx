'use client';

/**
 * Clip trimmer, ported from the slot builder.
 *
 * Every recording and upload passes through here before it is saved, so dead
 * air — record-button lag, silent file heads — gets cut. The silence is
 * pre-detected, so the common case is: glance at it, hit Use.
 *
 * "Use clip" bakes the highlighted region to a 16-bit WAV data URL, "Keep full"
 * stores the original bytes untouched, and closing cancels.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  audioBufferToWavDataUrl,
  audioCtx,
  clamp,
  fmtDur,
  suggestTrim,
  waveformMinMax,
} from '@/lib/blackjack-sound-fx';

const COLS = 600;

export interface TrimTarget {
  eventKey: string;
  dataUrl: string;
  label: string;
  buf: AudioBuffer;
}

export function TrimModal({
  target,
  onCancel,
  onApply,
}: {
  target: TrimTarget;
  onCancel: () => void;
  /** Called with the final data URL and the label to show on the tile. */
  onApply: (dataUrl: string, label: string) => void;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<Float32Array | null>(null);
  const [range, setRange] = useState(() => ({ start: 0, end: 1 }));
  const [playhead, setPlayhead] = useState<number | null>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef(0);

  // Pre-trim to the detected silence bounds when the clip arrives.
  useEffect(() => {
    peaksRef.current = waveformMinMax(target.buf, COLS);
    setRange(suggestTrim(target.buf));
  }, [target]);

  const stopPreview = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (srcRef.current) {
      try {
        srcRef.current.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current = null;
    }
    setPlayhead(null);
  }, []);

  useEffect(() => stopPreview, [stopPreview]);

  // Escape cancels, matching the slot builder's modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopPreview();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, stopPreview]);

  // Draw: unselected regions greyed, selected region highlighted, playhead on top.
  useEffect(() => {
    const cv = cvRef.current;
    const pk = peaksRef.current;
    if (!cv || !pk) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width;
    const H = cv.height;
    const mid = H / 2;
    const half = H / 2 - 6;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(34,211,238,.07)';
    ctx.fillRect(range.start * W, 0, (range.end - range.start) * W, H);
    // Normalise the DRAWING to the clip's own peak. Quiet sources (a card snap
    // sits near -30dBFS) otherwise render as a flat line, which defeats the
    // point of looking at a waveform. Audio output is untouched — this only
    // scales pixels.
    let peak = 0;
    for (let i = 0; i < COLS; i++) peak = Math.max(peak, pk[i * 2 + 1], -pk[i * 2]);
    const norm = peak > 0.001 ? 1 / peak : 1;
    const cwid = W / COLS;
    for (let i = 0; i < COLS; i++) {
      const f = (i + 0.5) / COLS;
      ctx.fillStyle =
        f >= range.start && f <= range.end ? 'rgba(34,211,238,.75)' : 'rgba(148,163,184,.28)';
      const mn = pk[i * 2] * norm;
      const mx = pk[i * 2 + 1] * norm;
      ctx.fillRect(i * cwid, mid - mx * half, Math.max(1, cwid), Math.max(1, (mx - mn) * half));
    }
    if (playhead != null) {
      ctx.fillStyle = '#eaffff';
      ctx.fillRect(playhead * W - 1, 0, 2, H);
    }
  }, [range, playhead]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, which: 'start' | 'end') => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = which;
    },
    [],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const which = dragRef.current;
    const cv = cvRef.current;
    if (!which || !cv) return;
    const r = cv.getBoundingClientRect();
    const f = clamp((e.clientX - r.left) / r.width, 0, 1);
    setRange((cur) =>
      which === 'start'
        ? { start: Math.min(f, cur.end - 0.005), end: cur.end }
        : { start: cur.start, end: Math.max(f, cur.start + 0.005) },
    );
  }, []);

  const preview = useCallback(() => {
    stopPreview();
    const c = audioCtx();
    if (!c) return;
    try {
      const src = c.createBufferSource();
      src.buffer = target.buf;
      const g = c.createGain();
      g.gain.value = 0.95;
      src.connect(g);
      g.connect(c.destination);
      const dur = target.buf.duration * (range.end - range.start);
      src.start(0, target.buf.duration * range.start, dur);
      srcRef.current = src;
      const t0 = performance.now();
      const frame = (now: number) => {
        const t = (now - t0) / 1000;
        if (t >= dur) {
          setPlayhead(null);
          rafRef.current = 0;
          return;
        }
        setPlayhead(range.start + t / target.buf.duration);
        rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    } catch {
      /* preview is a nicety — never block trimming on it */
    }
  }, [range, target, stopPreview]);

  const useClip = useCallback(() => {
    stopPreview();
    try {
      const n = target.buf.length;
      const s0 = Math.floor(range.start * n);
      const s1 = Math.max(s0 + 1, Math.floor(range.end * n));
      const url = audioBufferToWavDataUrl(target.buf, s0, s1);
      onApply(url, `${target.label} · trimmed (${((s1 - s0) / target.buf.sampleRate).toFixed(1)}s)`);
    } catch {
      // Bake failed — keep the full original rather than losing the clip.
      onApply(target.dataUrl, target.label);
    }
  }, [range, target, onApply, stopPreview]);

  const d = target.buf.duration;

  return (
    <div
      className="bjsnd-ov open"
      onPointerDown={() => {
        stopPreview();
        onCancel();
      }}
    >
      <div
        className="bjsnd-trim-card"
        role="dialog"
        aria-modal="true"
        aria-label="Trim clip"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="bjsnd-trim-head">
          <div className="bjsnd-trim-title">Trim — {target.label}</div>
          <button
            type="button"
            className="bjsnd-x"
            aria-label="Close"
            onClick={() => {
              stopPreview();
              onCancel();
            }}
          >
            ✕
          </button>
        </div>
        <p className="bjsnd-trim-hint">
          Drag the handles to cut dead air — only the highlighted part becomes the sound. We
          pre-trimmed the silence for you.
        </p>
        <div className="bjsnd-trim-wave" onPointerMove={onPointerMove} onPointerUp={() => (dragRef.current = null)}>
          <canvas ref={cvRef} width={600} height={150} />
          <div
            className="bjsnd-trim-handle"
            style={{ left: `${range.start * 100}%` }}
            onPointerDown={(e) => onPointerDown(e, 'start')}
            onPointerMove={onPointerMove}
            onPointerUp={() => (dragRef.current = null)}
            role="slider"
            aria-label="Clip start"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(range.start * 100)}
            tabIndex={0}
          />
          <div
            className="bjsnd-trim-handle"
            style={{ left: `${range.end * 100}%` }}
            onPointerDown={(e) => onPointerDown(e, 'end')}
            onPointerMove={onPointerMove}
            onPointerUp={() => (dragRef.current = null)}
            role="slider"
            aria-label="Clip end"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(range.end * 100)}
            tabIndex={0}
          />
        </div>
        <div className="bjsnd-read">
          {(d * range.start).toFixed(2)}s – {(d * range.end).toFixed(2)}s · clip{' '}
          {(d * (range.end - range.start)).toFixed(2)}s of {d.toFixed(2)}s
        </div>
        <div className="bjsnd-trim-btns">
          <button type="button" className="bjsnd-btn" onClick={preview}>
            ▶ Preview clip
          </button>
          <button type="button" className="bjsnd-btn on" onClick={useClip}>
            ✓ Use clip
          </button>
          <button
            type="button"
            className="bjsnd-btn"
            onClick={() => {
              stopPreview();
              onApply(target.dataUrl, `${target.label} (${fmtDur(target.buf.duration)})`);
            }}
          >
            Keep full
          </button>
        </div>
      </div>
    </div>
  );
}
