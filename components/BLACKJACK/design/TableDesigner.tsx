'use client';

/**
 * Blackjack table designer.
 *
 * Renders the real seat and dealer components against fixture state, inside a
 * BlackjackTableLayoutProvider driven by this editor. The editing model is
 * direct manipulation, same spirit as the slot builder: grab a seat or the
 * dealer and drag it, drag the tilt handle to rotate a seat, click the card
 * back to swap its art. The side panel is for fine-tuning, not the primary
 * way in.
 *
 * Like the Theme Studio, the chrome is styled with fixed inline colours rather
 * than app classes: it is a tool for judging the table, so it must not shift
 * when the table's own styling does.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlackjackMultiSeatGrid } from '@/components/BLACKJACK/multi/BlackjackMultiSeatGrid';
import { BlackjackMultiDealerArea } from '@/components/BLACKJACK/multi/BlackjackMultiDealerArea';
import { BlackjackTableLayoutProvider } from '@/components/BLACKJACK/BlackjackTableLayoutContext';
import {
  DEFAULT_BLACKJACK_TABLE_LAYOUT,
  mergeTableLayout,
  type BlackjackTableLayout,
} from '@/lib/blackjack-table-layout';
import { DESIGN_SCENARIOS } from '@/lib/blackjack-design-fixtures';
import {
  BLACKJACK_SOUND_EVENT_INFO,
  DEFAULT_BLACKJACK_SOUND_MAP,
  mergeSoundMap,
  pickSound,
  type BlackjackSoundEventKey,
  type BlackjackSoundOverrides,
} from '@/lib/blackjack-sounds';
import {
  decodeUrl,
  fxFor,
  isFxCustomised,
  playEventWithFx,
  type SoundFx,
  type SoundFxMap,
} from '@/lib/blackjack-sound-fx';
import type { SoundLibraryClip } from '@/lib/blackjack-sound-library';
import { SoundEventTile } from '@/components/BLACKJACK/design/sound/SoundEventTile';
import { TrimModal, type TrimTarget } from '@/components/BLACKJACK/design/sound/TrimModal';
import { LibraryModal } from '@/components/BLACKJACK/design/sound/LibraryModal';
import { useTablePublish } from '@/components/BLACKJACK/design/useTablePublish';
import type { BlackjackTableThemeConfig } from '@/lib/blackjack-table-theme';
import '@/components/BLACKJACK/design/sound/sound-designer.css';
import type { BJMultiSeatState } from '@/lib/websocket-client';

const UI = {
  bg: '#0b0f14',
  panel: '#0f151c',
  border: '#1f2933',
  raised: '#161e27',
  text: '#e6edf3',
  dim: '#8b98a5',
  accent: '#4493f8',
  selected: '#f0b429',
} as const;

const CANVAS_W = DEFAULT_BLACKJACK_TABLE_LAYOUT.canvas.width;
const CANVAS_H = DEFAULT_BLACKJACK_TABLE_LAYOUT.canvas.height;

type Selection =
  | { kind: 'seat'; index: number }
  | { kind: 'dealer' }
  | { kind: 'cards' }
  | { kind: 'motion' }
  | { kind: 'sounds' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One editable number, rendered as a slider plus a readout. */
function Knob({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
  onGestureStart,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  onGestureStart: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <label style={{ width: 78, fontSize: 11, color: UI.dim }}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onGestureStart}
        onKeyDown={onGestureStart}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: UI.accent, height: 16 }}
      />
      <span
        style={{
          width: 52,
          textAlign: 'right',
          fontSize: 10,
          fontVariantNumeric: 'tabular-nums',
          color: UI.text,
        }}
      >
        {Math.round(value * 100) / 100}
        {suffix}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: UI.text }}>{title}</div>
      {children}
    </div>
  );
}

export default function TableDesigner() {
  const [layout, setLayout] = useState<BlackjackTableLayout>(DEFAULT_BLACKJACK_TABLE_LAYOUT);
  const [scenarioId, setScenarioId] = useState(DESIGN_SCENARIOS[0].id);
  const [selection, setSelection] = useState<Selection>({ kind: 'seat', index: 1 });
  const [showGuides, setShowGuides] = useState(true);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);

  // ── Publish: pick a real table, load its saved theme, save this design ────
  const publish = useTablePublish();
  const [publishTableId, setPublishTableId] = useState('');

  // ── Sounds ────────────────────────────────────────────────────────────────
  // Two sparse layers, both the shape a saved table theme will carry:
  //   soundOverrides — which file(s) an event plays ([] silences it)
  //   soundFx        — the per-event FX chain (envelope/spatial/echo)
  // Uploads are object URLs: local preview until themes are persisted.
  const [soundOverrides, setSoundOverrides] = useState<BlackjackSoundOverrides>({});
  const [soundFx, setSoundFx] = useState<SoundFxMap>({});
  const [expandedSound, setExpandedSound] = useState<BlackjackSoundEventKey | null>(null);
  const [playingSound, setPlayingSound] = useState<BlackjackSoundEventKey | null>(null);
  const [autoPlaySound, setAutoPlaySound] = useState(false);
  // Read inside timers, which outlive the render that scheduled them.
  const autoPlayRef = useRef(autoPlaySound);
  autoPlayRef.current = autoPlaySound;
  const [customSoundLabels, setCustomSoundLabels] = useState<Record<string, string>>({});
  const playingTimer = useRef<number | null>(null);

  const effectiveSoundMap = useMemo(
    () => mergeSoundMap(DEFAULT_BLACKJACK_SOUND_MAP, soundOverrides),
    [soundOverrides],
  );

  // Preview reads the sound state through refs, not through the closure. A
  // change and its audition happen in the same tick, but setState has not
  // committed yet at that point — reading the closed-over value would audition
  // the FX from *before* the tweak, so every auto-play would lag one edit
  // behind.
  const soundFxRef = useRef(soundFx);
  soundFxRef.current = soundFx;
  const soundMapRef = useRef(effectiveSoundMap);
  soundMapRef.current = effectiveSoundMap;

  /** Plays one event through its FX chain, flashing the tile while it sounds. */
  const previewSound = useCallback((event: BlackjackSoundEventKey) => {
    const path = pickSound(soundMapRef.current, event);
    if (!path) return;
    playEventWithFx(event, path, fxFor(soundFxRef.current, event));
    setPlayingSound(event);
    if (playingTimer.current) window.clearTimeout(playingTimer.current);
    playingTimer.current = window.setTimeout(() => setPlayingSound(null), 700);
  }, []);

  // ── Auto-play pacing ──────────────────────────────────────────────────────
  // Dragging a pad emits a change per pointer frame. Auditioning each one turns
  // the studio into a machine gun, so requests are coalesced: wait for the
  // gesture to settle, then hold a floor between plays. Continuous fiddling
  // therefore auditions about once every AUTO_PLAY_MIN_MS instead of per frame.
  const AUTO_PLAY_SETTLE_MS = 260;
  const AUTO_PLAY_MIN_MS = 1600;
  const autoPlayTimer = useRef<number | null>(null);
  const autoPlayPending = useRef<BlackjackSoundEventKey | null>(null);
  const autoPlayLastAt = useRef(0);

  const requestAutoPlay = useCallback(
    (event: BlackjackSoundEventKey) => {
      if (!autoPlayRef.current) return;
      // Newest request wins; an already-scheduled play just picks it up.
      autoPlayPending.current = event;
      if (autoPlayTimer.current) return;
      const since = Date.now() - autoPlayLastAt.current;
      const wait = Math.max(AUTO_PLAY_SETTLE_MS, AUTO_PLAY_MIN_MS - since);
      autoPlayTimer.current = window.setTimeout(() => {
        autoPlayTimer.current = null;
        const key = autoPlayPending.current;
        autoPlayPending.current = null;
        if (!key || !autoPlayRef.current) return;
        autoPlayLastAt.current = Date.now();
        previewSound(key);
      }, wait);
    },
    [previewSound],
  );

  useEffect(
    () => () => {
      if (autoPlayTimer.current) window.clearTimeout(autoPlayTimer.current);
    },
    [],
  );

  /** Applies an FX patch, then asks for a (paced) audition. */
  const patchSoundFx = useCallback(
    (event: BlackjackSoundEventKey, patch: Partial<SoundFx>) => {
      setSoundFx((prev) => ({ ...prev, [event]: { ...fxFor(prev, event), ...patch } }));
      requestAutoPlay(event);
    },
    [requestAutoPlay],
  );

  // Trimmer + library. Every acquisition — upload, recording, library pick —
  // routes through the trimmer before it is saved, so dead air gets cut once
  // rather than being baked into whatever the table ends up playing.
  const [trimTarget, setTrimTarget] = useState<TrimTarget | null>(null);
  const [libraryFor, setLibraryFor] = useState<BlackjackSoundEventKey | null>(null);
  const [recordingFor, setRecordingFor] = useState<BlackjackSoundEventKey | null>(null);
  const recRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const recStopTimer = useRef<number | null>(null);

  /** Decodes an acquired clip and hands it to the trimmer. */
  const openTrimmer = useCallback(
    async (event: BlackjackSoundEventKey, dataUrl: string, label: string) => {
      const buf = await decodeUrl(dataUrl);
      if (!buf) {
        // Undecodable: store as-is rather than losing what the user just picked.
        setSoundOverrides((prev) => ({ ...prev, [event]: [dataUrl] }));
        setCustomSoundLabels((prev) => ({ ...prev, [event]: label }));
        requestAutoPlay(event);
        return;
      }
      setTrimTarget({ eventKey: event, dataUrl, label, buf });
    },
    [requestAutoPlay],
  );

  const uploadSound = useCallback(
    (event: BlackjackSoundEventKey, file: File) => {
      const fr = new FileReader();
      fr.onload = () => void openTrimmer(event, String(fr.result), file.name || 'uploaded file');
      try {
        fr.readAsDataURL(file);
      } catch {
        /* unreadable file — the tile keeps its previous sound */
      }
    },
    [openTrimmer],
  );

  const finishRecording = useCallback(
    (event: BlackjackSoundEventKey, chunks: Blob[], mimeType: string) => {
      if (!chunks.length) return;
      const fr = new FileReader();
      fr.onload = () => void openTrimmer(event, String(fr.result), 'recording');
      try {
        fr.readAsDataURL(new Blob(chunks, { type: mimeType }));
      } catch {
        /* unreadable blob — nothing to save */
      }
    },
    [openTrimmer],
  );

  /** One recording at a time, auto-stopping at 6s like the slot builder. */
  const toggleRecord = useCallback(
    async (event: BlackjackSoundEventKey) => {
      if (recordingFor) {
        try {
          recRef.current?.recorder.stop();
        } catch {
          /* already stopped */
        }
        return;
      }
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recRef.current = { recorder, stream, chunks };
        recorder.ondataavailable = (e) => {
          if (e.data?.size) chunks.push(e.data);
        };
        recorder.onstop = () => {
          if (recStopTimer.current) window.clearTimeout(recStopTimer.current);
          recStopTimer.current = null;
          stream.getTracks().forEach((t) => t.stop());
          recRef.current = null;
          setRecordingFor(null);
          finishRecording(event, chunks, recorder.mimeType || 'audio/webm');
        };
        recorder.start();
        setRecordingFor(event);
        recStopTimer.current = window.setTimeout(() => {
          try {
            recorder.stop();
          } catch {
            /* already stopped */
          }
        }, 6000);
      } catch {
        // Mic unavailable or permission denied — Upload and Library still work.
        setRecordingFor(null);
      }
    },
    [recordingFor, finishRecording],
  );

  const resetSound = useCallback((event: BlackjackSoundEventKey) => {
    setSoundOverrides((prev) => {
      const next = { ...prev };
      delete next[event];
      return next;
    });
    setSoundFx((prev) => {
      const next = { ...prev };
      delete next[event];
      return next;
    });
    setCustomSoundLabels((prev) => {
      const next = { ...prev };
      delete next[event];
      return next;
    });
    requestAutoPlay(event);
  }, [requestAutoPlay]);

  // ── Undo / redo ────────────────────────────────────────────────────────────
  // A gesture (drag start, slider grab, first nudge of a burst) snapshots the
  // layout; undo walks back through snapshots. Kept in refs so pointer-move
  // storms never re-render for history bookkeeping.
  const past = useRef<BlackjackTableLayout[]>([]);
  const future = useRef<BlackjackTableLayout[]>([]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [historyVersion, setHistoryVersion] = useState(0);

  const beginGesture = useCallback(() => {
    past.current.push(layoutRef.current);
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(layoutRef.current);
    setLayout(prev);
    setHistoryVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(layoutRef.current);
    setLayout(next);
    setHistoryVersion((v) => v + 1);
  }, []);

  // ── Stage scaling ──────────────────────────────────────────────────────────
  // The logical canvas is 800×450; scale it to fill the available width so the
  // table is big enough to actually work on. Drag math divides by this scale.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stageScale, setStageScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStageScale(clamp(el.clientWidth / CANVAS_W, 0.4, 1.6));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Dragging ───────────────────────────────────────────────────────────────
  const dragRef = useRef<{ startX: number; startY: number; apply: (dx: number, dy: number) => void } | null>(null);

  const beginDrag = useCallback(
    (e: React.PointerEvent, apply: (dx: number, dy: number) => void) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      beginGesture();
      dragRef.current = { startX: e.clientX, startY: e.clientY, apply };
      setDragging(true);
    },
    [beginGesture],
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.apply((e.clientX - d.startX) / stageScale, (e.clientY - d.startY) / stageScale);
    },
    [stageScale],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const patch = useCallback((fn: (draft: BlackjackTableLayout) => BlackjackTableLayout) => {
    setLayout((prev) => fn(prev));
  }, []);

  const setSeat = useCallback(
    (index: number, key: 'cx' | 'floorY' | 'angle', value: number) => {
      patch((prev) => ({
        ...prev,
        seats: prev.seats.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
      }));
    },
    [patch],
  );

  // ── Keyboard nudging ───────────────────────────────────────────────────────
  const lastNudge = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (!e.key.startsWith('Arrow')) return;
      const sel = selection;
      if (sel.kind !== 'seat' && sel.kind !== 'dealer') return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastNudge.current > 800) beginGesture();
      lastNudge.current = now;
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (sel.kind === 'seat') {
        const s = layoutRef.current.seats[sel.index];
        setSeat(sel.index, 'cx', clamp(s.cx + dx, 0, CANVAS_W));
        setSeat(sel.index, 'floorY', clamp(s.floorY + dy, 0, CANVAS_H));
      } else {
        patch((p) => ({
          ...p,
          dealer: {
            cx: clamp(p.dealer.cx + dx, 0, CANVAS_W),
            top: clamp(p.dealer.top + dy, 0, CANVAS_H),
          },
        }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, setSeat, patch, beginGesture, undo, redo]);

  // ── Card back picker ───────────────────────────────────────────────────────
  const backFileRef = useRef<HTMLInputElement>(null);
  const pickCardBack = useCallback(
    (file: File | null) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      beginGesture();
      patch((p) => ({ ...p, cards: { ...p.cards, backImage: url } }));
    },
    [beginGesture, patch],
  );

  const scenario = DESIGN_SCENARIOS.find((s) => s.id === scenarioId) ?? DESIGN_SCENARIOS[0];
  const state = scenario.state;

  const seats = useMemo(
    () =>
      [0, 1, 2].map((p) => state.seats.find((s) => s.position === p) ?? null) as [
        BJMultiSeatState | null,
        BJMultiSeatState | null,
        BJMultiSeatState | null,
      ],
    [state],
  );

  /** Only the fields that differ from the shipped defaults — what a table theme would store. */
  const diff = useMemo(() => {
    const base = DEFAULT_BLACKJACK_TABLE_LAYOUT;
    const out: Record<string, unknown> = {};
    if (JSON.stringify(layout.seats) !== JSON.stringify(base.seats)) out.seats = layout.seats;
    if (JSON.stringify(layout.dealer) !== JSON.stringify(base.dealer)) out.dealer = layout.dealer;
    if (JSON.stringify(layout.cards) !== JSON.stringify(base.cards)) out.cards = layout.cards;
    if (JSON.stringify(layout.motion) !== JSON.stringify(base.motion)) out.motion = layout.motion;
    if (JSON.stringify(layout.emotes) !== JSON.stringify(base.emotes)) out.emotes = layout.emotes;
    if (Object.keys(soundOverrides).length > 0) out.sounds = soundOverrides;
    if (Object.keys(soundFx).length > 0) out.soundFx = soundFx;
    return out;
  }, [layout, soundOverrides, soundFx]);

  const changeCount = Object.keys(diff).length;

  /** Hydrates the editor from a saved theme (or resets to stock for null). */
  const applyLoadedTheme = useCallback(
    (theme: BlackjackTableThemeConfig | null) => {
      beginGesture();
      setLayout(mergeTableLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT, theme?.layout));
      setSoundOverrides(theme?.sounds ?? {});
      setSoundFx(theme?.soundFx ?? {});
      const labels: Record<string, string> = {};
      for (const [event, pool] of Object.entries(theme?.sounds ?? {})) {
        if (Array.isArray(pool) && pool.length > 0) {
          try {
            labels[event] = decodeURIComponent(pool[0].split('/').pop() ?? 'saved sound');
          } catch {
            labels[event] = 'saved sound';
          }
        }
      }
      setCustomSoundLabels(labels);
    },
    [beginGesture],
  );

  /** The sparse theme this editor currently describes — the diff, reshaped. */
  const currentThemeConfig = useMemo((): BlackjackTableThemeConfig => {
    const layoutPart: Record<string, unknown> = {};
    for (const key of ['seats', 'dealer', 'cards', 'motion', 'emotes'] as const) {
      if (diff[key] !== undefined) layoutPart[key] = diff[key];
    }
    const theme: BlackjackTableThemeConfig = { version: 1 };
    if (Object.keys(layoutPart).length > 0) theme.layout = layoutPart as BlackjackTableThemeConfig['layout'];
    if (diff.sounds) theme.sounds = diff.sounds as BlackjackTableThemeConfig['sounds'];
    if (diff.soundFx) theme.soundFx = diff.soundFx as BlackjackTableThemeConfig['soundFx'];
    return theme;
  }, [diff]);

  const handleLoad = useCallback(async () => {
    if (!publishTableId) return;
    applyLoadedTheme(await publish.loadTheme(publishTableId));
  }, [publishTableId, publish, applyLoadedTheme]);

  const handleSave = useCallback(async () => {
    if (!publishTableId) return;
    const saved = await publish.saveTheme(publishTableId, currentThemeConfig);
    // Adopt the uploaded media paths so the design survives the editor too.
    if (saved) applyLoadedTheme(saved);
  }, [publishTableId, publish, currentThemeConfig, applyLoadedTheme]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diff, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the JSON is still visible below */
    }
  }, [diff]);

  const isSel = (s: Selection) =>
    s.kind === selection.kind && (s.kind !== 'seat' || s.index === (selection as { index: number }).index);

  const selectedSeat = selection.kind === 'seat' ? layout.seats[selection.index] : null;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: UI.bg,
        color: UI.text,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Stage ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: 20, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Blackjack table designer</h1>
          <span style={{ fontSize: 12, color: UI.dim }}>
            Drag pieces to move them · drag the ⟳ handle to tilt a seat · arrow keys nudge (⇧ = ×10) · Ctrl+Z undoes
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          {DESIGN_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.description}
              onClick={() => setScenarioId(s.id)}
              style={{
                background: s.id === scenarioId ? UI.accent : UI.raised,
                color: s.id === scenarioId ? '#fff' : UI.text,
                border: `1px solid ${s.id === scenarioId ? UI.accent : UI.border}`,
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {s.name}
            </button>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: UI.dim, marginLeft: 4 }}>
            <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
            Guides
          </label>
        </div>

        {/* ── Publish bar: this design ↔ a real table ── */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 12,
            padding: '8px 10px',
            background: UI.panel,
            border: `1px solid ${UI.border}`,
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700 }}>Publish</span>
          {!publish.address ? (
            <span style={{ fontSize: 11, color: UI.dim }}>
              Connect an admin wallet to load or save table themes.
            </span>
          ) : (
            <>
              <select
                value={publishTableId}
                onChange={(e) => setPublishTableId(e.target.value)}
                style={{
                  background: UI.raised,
                  color: UI.text,
                  border: `1px solid ${UI.border}`,
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 11,
                  maxWidth: 260,
                }}
              >
                <option value="">Choose a table…</option>
                {publish.tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id.slice(0, 8)} · {t.status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleLoad()}
                disabled={!publishTableId || publish.status.kind === 'busy'}
                style={{
                  background: UI.raised,
                  border: `1px solid ${UI.border}`,
                  color: publishTableId ? UI.text : UI.border,
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  cursor: publishTableId ? 'pointer' : 'default',
                }}
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!publishTableId || publish.status.kind === 'busy'}
                style={{
                  background: publishTableId ? UI.accent : UI.raised,
                  border: `1px solid ${publishTableId ? UI.accent : UI.border}`,
                  color: publishTableId ? '#fff' : UI.border,
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: publishTableId ? 'pointer' : 'default',
                }}
              >
                Save to table
              </button>
              <span
                style={{
                  fontSize: 11,
                  color:
                    publish.status.kind === 'error'
                      ? '#f87171'
                      : publish.status.kind === 'ok'
                        ? '#4ade80'
                        : UI.dim,
                }}
              >
                {publish.status.kind !== 'idle'
                  ? publish.status.note
                  : publish.tablesError
                    ? publish.tablesError
                    : `${publish.tables.length} table${publish.tables.length === 1 ? '' : 's'}`}
              </span>
            </>
          )}
        </div>

        {/* Scaled stage. The wrapper reserves the scaled height so the page flows. */}
        <div ref={wrapRef} style={{ width: '100%' }}>
          <div style={{ width: CANVAS_W * stageScale, height: CANVAS_H * stageScale, position: 'relative' }}>
            <BlackjackTableLayoutProvider layout={layout}>
              <div
                className="blackjack-table"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: CANVAS_W,
                  height: CANVAS_H,
                  transform: `scale(${stageScale})`,
                  transformOrigin: 'top left',
                  background: 'radial-gradient(ellipse at 50% 35%, #12331f 0%, #0a1f13 60%, #06120b 100%)',
                  border: `1px solid ${UI.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {showGuides && (
                  <svg
                    width={CANVAS_W}
                    height={CANVAS_H}
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}
                  >
                    <line
                      x1={CANVAS_W / 2}
                      y1={0}
                      x2={CANVAS_W / 2}
                      y2={CANVAS_H}
                      stroke="rgba(255,255,255,0.12)"
                      strokeDasharray="4 6"
                    />
                    {selectedSeat && (
                      <text
                        x={selectedSeat.cx}
                        y={clamp(selectedSeat.floorY + 22, 14, CANVAS_H - 4)}
                        textAnchor="middle"
                        fill={UI.selected}
                        fontSize={11}
                        fontFamily="ui-monospace, monospace"
                      >
                        {Math.round(selectedSeat.cx)}, {Math.round(selectedSeat.floorY)} · {Math.round(selectedSeat.angle)}°
                      </text>
                    )}
                    {selection.kind === 'dealer' && (
                      <text
                        x={layout.dealer.cx}
                        y={clamp(layout.dealer.top - 8, 14, CANVAS_H - 4)}
                        textAnchor="middle"
                        fill={UI.selected}
                        fontSize={11}
                        fontFamily="ui-monospace, monospace"
                      >
                        {Math.round(layout.dealer.cx)}, {Math.round(layout.dealer.top)}
                      </text>
                    )}
                  </svg>
                )}

                {/* Dealer — same placement rule as the live table; draggable here. */}
                <div
                  style={{
                    position: 'absolute',
                    left: layout.dealer.cx,
                    top: layout.dealer.top,
                    transform: 'translateX(-50%)',
                    outline:
                      selection.kind === 'dealer'
                        ? `2px solid ${UI.selected}`
                        : '1px dashed rgba(255,255,255,0.12)',
                    outlineOffset: 6,
                    borderRadius: 6,
                    cursor: dragging ? 'grabbing' : 'grab',
                    touchAction: 'none',
                  }}
                  onPointerDown={(e) => {
                    setSelection({ kind: 'dealer' });
                    const orig = { ...layoutRef.current.dealer };
                    beginDrag(e, (dx, dy) =>
                      patch((p) => ({
                        ...p,
                        dealer: {
                          cx: clamp(Math.round(orig.cx + dx), 0, CANVAS_W),
                          top: clamp(Math.round(orig.top + dy), 0, CANVAS_H),
                        },
                      })),
                    );
                  }}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <BlackjackMultiDealerArea tableViewState={state} visibleDealerCards={state.dealerCards.length} />
                </div>

                <BlackjackMultiSeatGrid
                  seats={seats}
                  addressLower={undefined}
                  phase={state.phase}
                  actingSeatPosition={state.actingSeatPosition}
                  myPosition={null}
                  wsConnected
                  afkTimeoutsBeforeKick={3}
                  myBalanceLabel=""
                  showOutcomeLabel={false}
                  turnStartedAt={null}
                  bettingStartedAt={null}
                  onTakeSeat={() => {}}
                  onOpenProfile={() => {}}
                />

                {/* Seat grab surfaces — cover the whole seat column, above the seats. */}
                {layout.seats.map((s, i) => (
                  <div
                    key={i}
                    role="button"
                    aria-label={`Select seat ${i + 1}`}
                    onPointerDown={(e) => {
                      setSelection({ kind: 'seat', index: i });
                      const orig = { ...layoutRef.current.seats[i] };
                      beginDrag(e, (dx, dy) => {
                        setSeat(i, 'cx', clamp(Math.round(orig.cx + dx), 0, CANVAS_W));
                        setSeat(i, 'floorY', clamp(Math.round(orig.floorY + dy), 0, CANVAS_H));
                      });
                    }}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    style={{
                      position: 'absolute',
                      left: s.cx - 65,
                      top: s.floorY - 155,
                      width: 130,
                      height: 165,
                      borderRadius: 10,
                      border: isSel({ kind: 'seat', index: i })
                        ? `2px solid ${UI.selected}`
                        : '1px dashed rgba(255,255,255,0.12)',
                      cursor: dragging ? 'grabbing' : 'grab',
                      touchAction: 'none',
                      zIndex: 45,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: -20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: 10,
                        fontWeight: 700,
                        color: isSel({ kind: 'seat', index: i }) ? UI.selected : 'rgba(255,255,255,0.45)',
                        background: 'rgba(0,0,0,0.55)',
                        padding: '2px 8px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Seat {i + 1}
                    </span>
                  </div>
                ))}

                {/* Tilt handle for the selected seat — drag sideways to rotate. */}
                {selectedSeat && (
                  <div
                    title="Drag sideways to tilt the seat"
                    onPointerDown={(e) => {
                      const sel = selection as { kind: 'seat'; index: number };
                      const origAngle = layoutRef.current.seats[sel.index].angle;
                      beginDrag(e, (dx) =>
                        setSeat(sel.index, 'angle', clamp(Math.round(origAngle + dx * 0.4), -45, 45)),
                      );
                    }}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    style={{
                      position: 'absolute',
                      left: selectedSeat.cx - 14,
                      top: selectedSeat.floorY - 195,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: UI.selected,
                      color: '#1a1200',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 800,
                      cursor: 'ew-resize',
                      touchAction: 'none',
                      zIndex: 46,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                      userSelect: 'none',
                    }}
                  >
                    ⟳
                  </div>
                )}
              </div>
            </BlackjackTableLayoutProvider>
          </div>
        </div>

        {/* Sound studio lives full-width under the table: its four-module grid
            needs real horizontal room, which the 330px side panel cannot give. */}
        {selection.kind === 'sounds' && (
          <div className="bjsnd">
            <p style={{ fontSize: 11, color: UI.dim, margin: '0 0 10px', lineHeight: 1.5 }}>
              Click a tile to open its studio — shape the envelope, place it in space, add echo.
              Hovering a tile previews the animation it plays with.
            </p>
            <div className="bjsnd-grid">
              {BLACKJACK_SOUND_EVENT_INFO.map((info) => {
                const override = soundOverrides[info.key];
                const isMuted = Array.isArray(override) && override.length === 0;
                const hasCustomFile = Array.isArray(override) && override.length > 0;
                return (
                  <SoundEventTile
                    key={info.key}
                    info={info}
                    fx={fxFor(soundFx, info.key)}
                    hasCustomFile={hasCustomFile}
                    fxTweaked={isFxCustomised(soundFx, info.key)}
                    isMuted={isMuted}
                    customLabel={customSoundLabels[info.key]}
                    autoPlay={autoPlaySound}
                    expanded={expandedSound === info.key}
                    playing={playingSound === info.key}
                    sourceUrl={pickSound(effectiveSoundMap, info.key)}
                    onToggleExpand={() =>
                      setExpandedSound((cur) => (cur === info.key ? null : info.key))
                    }
                    onPlay={() => previewSound(info.key)}
                    onUpload={(file) => uploadSound(info.key, file)}
                    onOpenLibrary={() => setLibraryFor(info.key)}
                    onToggleRecord={() => void toggleRecord(info.key)}
                    recording={recordingFor === info.key}
                    onToggleMute={() =>
                      setSoundOverrides((prev) => {
                        const next = { ...prev };
                        if (isMuted) {
                          delete next[info.key];
                          requestAutoPlay(info.key); // unmuting is worth hearing
                        } else {
                          next[info.key] = [];
                        }
                        return next;
                      })
                    }
                    onReset={() => resetSound(info.key)}
                    onToggleAutoPlay={() => setAutoPlaySound((v) => !v)}
                    onFxChange={(patch) => patchSoundFx(info.key, patch)}
                    onGestureStart={beginGesture}
                  />
                );
              })}
            </div>
            <p style={{ fontSize: 10, color: UI.dim, marginTop: 10, lineHeight: 1.5 }}>
              Uploads and FX are local previews until saved themes land — that&apos;s when they get
              stored and heard by everyone at the table.
            </p>
          </div>
        )}
      </div>


      {/* ── Panel — fine-tuning; the stage is the primary editor ─────────── */}
      <aside
        style={{
          width: 330,
          flexShrink: 0,
          background: UI.panel,
          borderLeft: `1px solid ${UI.border}`,
          padding: 16,
          overflowY: 'auto',
          maxHeight: '100vh',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <strong style={{ fontSize: 13 }}>Fine-tune</strong>
          <span style={{ fontSize: 11, color: UI.dim }}>
            {changeCount ? `${changeCount} group${changeCount === 1 ? '' : 's'} changed` : 'default'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} data-history-version={historyVersion}>
            <button
              type="button"
              onClick={undo}
              disabled={past.current.length === 0}
              title="Undo (Ctrl+Z)"
              style={{
                background: 'transparent',
                border: `1px solid ${UI.border}`,
                color: past.current.length ? UI.text : UI.border,
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                cursor: past.current.length ? 'pointer' : 'default',
              }}
            >
              ↩ Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={future.current.length === 0}
              title="Redo (Ctrl+Shift+Z)"
              style={{
                background: 'transparent',
                border: `1px solid ${UI.border}`,
                color: future.current.length ? UI.text : UI.border,
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                cursor: future.current.length ? 'pointer' : 'default',
              }}
            >
              ↪
            </button>
            <button
              type="button"
              onClick={() => {
                beginGesture();
                setLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT);
              }}
              style={{
                background: 'transparent',
                border: `1px solid ${UI.border}`,
                color: UI.dim,
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {([
            { label: 'Seat 1', sel: { kind: 'seat', index: 0 } as Selection },
            { label: 'Seat 2', sel: { kind: 'seat', index: 1 } as Selection },
            { label: 'Seat 3', sel: { kind: 'seat', index: 2 } as Selection },
            { label: 'Dealer', sel: { kind: 'dealer' } as Selection },
            { label: 'Cards', sel: { kind: 'cards' } as Selection },
            { label: 'Sounds', sel: { kind: 'sounds' } as Selection },
            { label: 'Motion', sel: { kind: 'motion' } as Selection },
          ]).map(({ label, sel }) => (
            <button
              key={label}
              type="button"
              onClick={() => setSelection(sel)}
              style={{
                background: isSel(sel) ? UI.accent : 'transparent',
                color: isSel(sel) ? '#fff' : UI.dim,
                border: `1px solid ${isSel(sel) ? UI.accent : UI.border}`,
                borderRadius: 6,
                padding: '4px 9px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {selection.kind === 'seat' && (
          <Section title={`Seat ${selection.index + 1} — or just drag it on the table`}>
            <Knob
              label="Across"
              value={layout.seats[selection.index].cx}
              min={0}
              max={CANVAS_W}
              onGestureStart={beginGesture}
              onChange={(v) => setSeat(selection.index, 'cx', v)}
            />
            <Knob
              label="Down"
              value={layout.seats[selection.index].floorY}
              min={0}
              max={CANVAS_H}
              onGestureStart={beginGesture}
              onChange={(v) => setSeat(selection.index, 'floorY', v)}
            />
            <Knob
              label="Tilt"
              value={layout.seats[selection.index].angle}
              min={-45}
              max={45}
              suffix="°"
              onGestureStart={beginGesture}
              onChange={(v) => setSeat(selection.index, 'angle', v)}
            />
          </Section>
        )}

        {selection.kind === 'dealer' && (
          <Section title="Dealer — or just drag it on the table">
            <Knob
              label="Across"
              value={layout.dealer.cx}
              min={0}
              max={CANVAS_W}
              onGestureStart={beginGesture}
              onChange={(v) => patch((p) => ({ ...p, dealer: { ...p.dealer, cx: v } }))}
            />
            <Knob
              label="Down"
              value={layout.dealer.top}
              min={0}
              max={CANVAS_H}
              onGestureStart={beginGesture}
              onChange={(v) => patch((p) => ({ ...p, dealer: { ...p.dealer, top: v } }))}
            />
          </Section>
        )}

        {selection.kind === 'cards' && (
          <>
            <Section title="Card back">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                { }
                <img
                  src={layout.cards.backImage}
                  alt="Card back"
                  width={44}
                  height={62}
                  style={{
                    borderRadius: 6,
                    objectFit: 'cover',
                    border: `1px solid ${UI.border}`,
                    background: '#0a2540',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => backFileRef.current?.click()}
                    style={{
                      background: UI.raised,
                      border: `1px solid ${UI.border}`,
                      color: UI.text,
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Choose image…
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      beginGesture();
                      patch((p) => ({
                        ...p,
                        cards: { ...p.cards, backImage: DEFAULT_BLACKJACK_TABLE_LAYOUT.cards.backImage },
                      }));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: UI.dim,
                      fontSize: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: 0,
                    }}
                  >
                    reset to default
                  </button>
                </div>
                <input
                  ref={backFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => pickCardBack(e.target.files?.[0] ?? null)}
                />
              </div>
              <p style={{ fontSize: 10, color: UI.dim, marginTop: 6, lineHeight: 1.5 }}>
                Local preview only for now — a picked image lives in this tab until saved themes land
                (that&apos;s when it gets uploaded and shared).
              </p>
            </Section>
            <Section title="Stacking">
              <Knob
                label="Dealer"
                value={layout.cards.overlap.dealer}
                min={-60}
                max={20}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, cards: { ...p.cards, overlap: { ...p.cards.overlap, dealer: v } } }))
                }
              />
              <Knob
                label="Player"
                value={layout.cards.overlap.player}
                min={-60}
                max={20}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, cards: { ...p.cards, overlap: { ...p.cards.overlap, player: v } } }))
                }
              />
            </Section>
            <Section title="Card size (dealer)">
              <Knob
                label="Width"
                value={layout.cards.sizes.normal.w}
                min={40}
                max={160}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, normal: { ...p.cards.sizes.normal, w: v } } },
                  }))
                }
              />
              <Knob
                label="Height"
                value={layout.cards.sizes.normal.h}
                min={56}
                max={224}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, normal: { ...p.cards.sizes.normal, h: v } } },
                  }))
                }
              />
            </Section>
            <Section title="Card size (seats)">
              <Knob
                label="Width"
                value={layout.cards.sizes.small.w}
                min={32}
                max={120}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, small: { ...p.cards.sizes.small, w: v } } },
                  }))
                }
              />
              <Knob
                label="Height"
                value={layout.cards.sizes.small.h}
                min={44}
                max={168}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, small: { ...p.cards.sizes.small, h: v } } },
                  }))
                }
              />
            </Section>
          </>
        )}

        {selection.kind === 'sounds' && (
          <p style={{ fontSize: 11, color: UI.dim, lineHeight: 1.6 }}>
            Sound studio is below the table — it needs the full width.
          </p>
        )}

        {selection.kind === 'motion' && (
          <>
            <Section title="Deal in">
              <Knob
                label="From X"
                value={layout.motion.dealIn.fromX}
                min={-400}
                max={400}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, dealIn: { ...p.motion.dealIn, fromX: v } } }))
                }
              />
              <Knob
                label="From Y"
                value={layout.motion.dealIn.fromY}
                min={-400}
                max={400}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, dealIn: { ...p.motion.dealIn, fromY: v } } }))
                }
              />
              <Knob
                label="Duration"
                value={layout.motion.dealIn.durationMs}
                min={100}
                max={2000}
                step={25}
                suffix="ms"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, dealIn: { ...p.motion.dealIn, durationMs: v } } }))
                }
              />
              <Knob
                label="Stagger"
                value={layout.motion.dealIn.staggerMs}
                min={0}
                max={800}
                step={10}
                suffix="ms"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, dealIn: { ...p.motion.dealIn, staggerMs: v } } }))
                }
              />
            </Section>
            <Section title="Collect">
              <Knob
                label="To X"
                value={layout.motion.clearOut.toX}
                min={-400}
                max={400}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, clearOut: { ...p.motion.clearOut, toX: v } } }))
                }
              />
              <Knob
                label="To Y"
                value={layout.motion.clearOut.toY}
                min={-400}
                max={400}
                suffix="px"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, clearOut: { ...p.motion.clearOut, toY: v } } }))
                }
              />
              <Knob
                label="Scale"
                value={layout.motion.clearOut.scale}
                min={0}
                max={2}
                step={0.05}
                suffix="×"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, clearOut: { ...p.motion.clearOut, scale: v } } }))
                }
              />
              <Knob
                label="Duration"
                value={layout.motion.clearOut.durationMs}
                min={100}
                max={2000}
                step={25}
                suffix="ms"
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    motion: { ...p.motion, clearOut: { ...p.motion.clearOut, durationMs: v } },
                  }))
                }
              />
            </Section>
            <p style={{ fontSize: 11, color: UI.dim, lineHeight: 1.5 }}>
              Motion is easier to judge on a live table — the fixtures here are static, so these
              values are applied but not animated.
            </p>
          </>
        )}

        <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Overrides</span>
            <button
              type="button"
              onClick={copyJson}
              style={{
                marginLeft: 'auto',
                background: UI.raised,
                border: `1px solid ${UI.border}`,
                color: UI.text,
                borderRadius: 6,
                padding: '3px 9px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre
            style={{
              background: UI.bg,
              border: `1px solid ${UI.border}`,
              borderRadius: 6,
              padding: 8,
              fontSize: 10,
              lineHeight: 1.45,
              maxHeight: 200,
              overflow: 'auto',
              margin: 0,
              color: UI.dim,
            }}
          >
            {changeCount ? JSON.stringify(diff, null, 2) : '// unchanged from defaults'}
          </pre>
          <p style={{ fontSize: 10, color: UI.dim, marginTop: 8, lineHeight: 1.5 }}>
            Only what differs from the shipped layout. This is the shape a saved table theme will
            carry once themes are persisted per table.
          </p>
        </div>
      </aside>

      {/* Every acquired clip lands here first; Use / Keep full / cancel decide
          what actually reaches the event. */}
      {trimTarget && (
        <TrimModal
          target={trimTarget}
          onCancel={() => setTrimTarget(null)}
          onApply={(dataUrl, label) => {
            const key = trimTarget.eventKey as BlackjackSoundEventKey;
            setSoundOverrides((prev) => ({ ...prev, [key]: [dataUrl] }));
            setCustomSoundLabels((prev) => ({ ...prev, [key]: label }));
            setTrimTarget(null);
            requestAutoPlay(key);
          }}
        />
      )}

      {libraryFor && (
        <LibraryModal
          onClose={() => setLibraryFor(null)}
          onPick={(clip: SoundLibraryClip) => {
            const key = libraryFor;
            setLibraryFor(null);
            // Fetch to a data URL so the trimmer can decode and bake it like any
            // other acquisition, rather than special-casing shipped clips.
            void fetch(clip.file)
              .then((r) => r.blob())
              .then(
                (b) =>
                  new Promise<string>((res, rej) => {
                    const fr = new FileReader();
                    fr.onload = () => res(String(fr.result));
                    fr.onerror = rej;
                    fr.readAsDataURL(b);
                  }),
              )
              .then((url) => openTrimmer(key, url, clip.name))
              .catch(() => {
                // Fetch failed — point the event straight at the public path.
                setSoundOverrides((prev) => ({ ...prev, [key]: [clip.file] }));
                setCustomSoundLabels((prev) => ({ ...prev, [key]: clip.name }));
                requestAutoPlay(key);
              });
          }}
        />
      )}
    </div>
  );
}

/** Exported for tests: applies overrides the way a stored theme eventually will. */
export function applyThemeOverrides(overrides: Parameters<typeof mergeTableLayout>[1]) {
  return mergeTableLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT, overrides);
}
