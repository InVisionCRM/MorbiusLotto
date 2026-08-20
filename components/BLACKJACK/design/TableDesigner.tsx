'use client';

/**
 * Create-A-Table — the blackjack table designer.
 *
 * Structured to feel like the slot builder (public/slot-builder-lab.html):
 * a top-bar of whole-table presets, a quick-edit toolbar, a grouped control
 * deck on the left (Build / Style / Ship), and a pinned live table on the
 * right rendered from the real seat and dealer components against fixture
 * state. Every choice leads with a named style — mech-cards with a live
 * example, one-click sound styles — and the sliders sit behind a
 * "fine-tune" fold for afterwards.
 *
 * The editing model is direct manipulation: grab a seat or the dealer and
 * drag it on the felt, drag the tilt handle to rotate a seat. Everything
 * here is presentation only — nothing the designer stores can change the
 * cards, the shuffle, or a payout.
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
import { SOUND_FX_PRESETS, fxFromPreset } from '@/lib/blackjack-sound-fx-presets';
import {
  CLEAR_OUT_PRESETS,
  DEAL_IN_PRESETS,
  activeClearOutPresetId,
  activeDealInPresetId,
} from '@/lib/blackjack-motion-presets';
import {
  BLACKJACK_TABLE_PRESETS,
  soundStyleForTablePreset,
  tablePresetById,
} from '@/lib/blackjack-table-presets';
import {
  CARD_ANGLE_PRESETS,
  CARD_FX_PRESETS,
  activeCardAnglePresetId,
  activeCardFxPresetId,
} from '@/lib/blackjack-card-presets';
import { SoundEventTile } from '@/components/BLACKJACK/design/sound/SoundEventTile';
import { TrimModal, type TrimTarget } from '@/components/BLACKJACK/design/sound/TrimModal';
import { LibraryModal } from '@/components/BLACKJACK/design/sound/LibraryModal';
import { useTablePublish } from '@/components/BLACKJACK/design/useTablePublish';
import { useMyTableDesigns } from '@/components/BLACKJACK/design/useMyTableDesigns';
import { CardBackSwatch } from '@/components/BLACKJACK/CardBackSwatch';
import { Prc20TokenPicker, type SelectedPrc20Token } from '@/components/shared/Prc20TokenPicker';
import { TABLE_CARD_BACKS, DEFAULT_CARD_BACK } from '@/lib/table-card-backs';
import { BLACKJACK_IMAGE_BACKGROUNDS, DEFAULT_BLACKJACK_IMAGE_ID } from '@/app/BLACKJACK/constants';
import type { BlackjackTableThemeConfig } from '@/lib/blackjack-table-theme';
import '@/components/BLACKJACK/design/sound/sound-designer.css';
import '@/components/BLACKJACK/design/table-designer.css';
import type { BJMultiSeatState } from '@/lib/websocket-client';

const CANVAS_W = DEFAULT_BLACKJACK_TABLE_LAYOUT.canvas.width;
const CANVAS_H = DEFAULT_BLACKJACK_TABLE_LAYOUT.canvas.height;

/** What's highlighted on the felt; the deck tab tracks it. */
type Selection = { kind: 'seat'; index: number } | { kind: 'dealer' } | null;

/** Which step of the flow is open. */
type DeckTab = 'art' | 'cards' | 'anim' | 'sound' | 'tune' | 'share';

/** What the designer paints when no art has been chosen yet. */
const DEFAULT_TABLE_ART =
  BLACKJACK_IMAGE_BACKGROUNDS.find((b) => b.id === DEFAULT_BLACKJACK_IMAGE_ID)?.src ??
  BLACKJACK_IMAGE_BACKGROUNDS[0].src;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One editable number: label, slider, live mono readout. */
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
    <div className="bjtd-ctl">
      <div className="bjtd-ctl-lbl">
        <span>{label}</span>
        <span className="bjtd-val">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onGestureStart}
        onKeyDown={onGestureStart}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function TableDesigner() {
  const [layout, setLayout] = useState<BlackjackTableLayout>(DEFAULT_BLACKJACK_TABLE_LAYOUT);
  const [scenarioId, setScenarioId] = useState(DESIGN_SCENARIOS[0].id);
  const [selection, setSelection] = useState<Selection>({ kind: 'seat', index: 1 });
  const [tab, setTab] = useState<DeckTab>('art');
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

  // Clicking a named style should always be heard, auto-play toggle or not —
  // that's the whole point of a one-click style. Deferred one beat so the
  // setState it follows has committed by the time the refs are read.
  const auditionTimer = useRef<number | null>(null);
  const auditionSoon = useCallback(
    (event: BlackjackSoundEventKey) => {
      if (auditionTimer.current) window.clearTimeout(auditionTimer.current);
      auditionTimer.current = window.setTimeout(() => previewSound(event), 320);
    },
    [previewSound],
  );

  useEffect(
    () => () => {
      if (autoPlayTimer.current) window.clearTimeout(autoPlayTimer.current);
      if (auditionTimer.current) window.clearTimeout(auditionTimer.current);
    },
    [],
  );

  // ── Deal preview ──────────────────────────────────────────────────────────
  // Plays the current motion settings on the real table: collect every card,
  // then deal them back in through the actual card-slide-in path. This is what
  // makes the animation styles pickable by eye instead of by number.
  const [dealPreview, setDealPreview] = useState<'exit' | 'enter' | null>(null);
  const previewTimers = useRef<number[]>([]);
  const layoutForPreview = useRef(layout);
  layoutForPreview.current = layout;

  const runDealPreview = useCallback(() => {
    previewTimers.current.forEach((t) => window.clearTimeout(t));
    previewTimers.current = [];
    const m = layoutForPreview.current.motion;
    setDealPreview('exit');
    const exitMs =
      m.clearOut.durationMs + Math.max(m.clearOut.dealerStaggerMs, m.clearOut.playerStaggerMs) * 5 + 80;
    previewTimers.current.push(
      window.setTimeout(() => {
        setDealPreview('enter');
        const enterMs = m.dealIn.durationMs + m.dealIn.staggerMs * 5 + 150;
        previewTimers.current.push(window.setTimeout(() => setDealPreview(null), enterMs));
      }, exitMs),
    );
  }, []);

  useEffect(
    () => () => previewTimers.current.forEach((t) => window.clearTimeout(t)),
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
  // The logical canvas is 800×450; scale it to fill the preview column so the
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
      if (!sel) return;
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

  // ── Image pickers: table art + card back ──────────────────────────────────
  const backFileRef = useRef<HTMLInputElement>(null);
  /* Card-back token badge: open state for the picker, plus the token it
     resolved, kept so the 'no logo published' hint can name it. */
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [backToken, setBackToken] = useState<SelectedPrc20Token | null>(null);
  const pickCardBack = useCallback(
    (file: File | null) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      beginGesture();
      patch((p) => ({ ...p, cards: { ...p.cards, backImage: url } }));
    },
    [beginGesture, patch],
  );

  const artFileRef = useRef<HTMLInputElement>(null);
  const setTableArt = useCallback(
    (src: string) => {
      beginGesture();
      patch((p) => ({ ...p, table: { ...p.table, image: src } }));
    },
    [beginGesture, patch],
  );
  const pickTableArt = useCallback(
    (file: File | null) => {
      if (!file) return;
      setTableArt(URL.createObjectURL(file));
    },
    [setTableArt],
  );

  /** What the stage paints right now: chosen art, or the stock branded table. */
  const stageArt = layout.table.image || DEFAULT_TABLE_ART;
  const artIsUpload =
    layout.table.image.startsWith('blob:') ||
    layout.table.image.startsWith('data:') ||
    layout.table.image.startsWith('/uploads');

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

  // Card marks for the deal preview: every card at the table is "new" during
  // the enter phase, so the whole board re-deals through the real animation.
  const previewNewPlayerCards = useMemo(() => {
    if (dealPreview !== 'enter') return undefined;
    const marks: Record<string, Set<number>> = {};
    state.seats.forEach((seat) => {
      seat.hands.forEach((hand, hi) => {
        marks[`${seat.position}-${hi}`] = new Set(hand.cards.map((_, ci) => ci));
      });
    });
    return marks;
  }, [dealPreview, state]);

  const previewNewDealerCards = useMemo(() => {
    if (dealPreview !== 'enter') return null;
    return new Set(state.dealerCards.map((_, i) => i));
  }, [dealPreview, state]);

  // ── Whole-table presets ────────────────────────────────────────────────────
  // A preset speaks for the motion block and the whole-table sound style; seat
  // placement, card art and uploaded clips are the user's and survive it.
  const applyTablePreset = useCallback(
    (id: string) => {
      const preset = tablePresetById(id);
      if (!preset) return;
      beginGesture();
      const merged = mergeTableLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT, preset.layout);
      setLayout((prev) => ({ ...prev, motion: merged.motion }));
      const style = soundStyleForTablePreset(preset);
      setSoundFx((prev) => {
        const next: SoundFxMap = {};
        for (const info of BLACKJACK_SOUND_EVENT_INFO) {
          next[info.key] = fxFromPreset(style, fxFor(prev, info.key).sample);
        }
        return next;
      });
      runDealPreview();
      auditionSoon('cardDeal');
    },
    [beginGesture, runDealPreview, auditionSoon],
  );

  /** Which whole-table preset the current state exactly matches, if any. */
  const activeTablePresetId = useMemo(() => {
    for (const preset of BLACKJACK_TABLE_PRESETS) {
      const merged = mergeTableLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT, preset.layout);
      if (JSON.stringify(layout.motion) !== JSON.stringify(merged.motion)) continue;
      const style = soundStyleForTablePreset(preset);
      const want = JSON.stringify({ ...fxFromPreset(style, null), sample: null });
      const allMatch = BLACKJACK_SOUND_EVENT_INFO.every(
        (info) => JSON.stringify({ ...fxFor(soundFx, info.key), sample: null }) === want,
      );
      if (allMatch) return preset.id;
    }
    return null;
  }, [layout.motion, soundFx]);

  /** Which sound style all events share (highlights the row in the Sound tab). */
  const activeWholeTableStyleId = useMemo(() => {
    for (const style of SOUND_FX_PRESETS) {
      const want = JSON.stringify({ ...fxFromPreset(style, null), sample: null });
      const allMatch = BLACKJACK_SOUND_EVENT_INFO.every(
        (info) => JSON.stringify({ ...fxFor(soundFx, info.key), sample: null }) === want,
      );
      if (allMatch) return style.id;
    }
    return null;
  }, [soundFx]);

  /** Only the fields that differ from the shipped defaults — what a table theme would store. */
  const diff = useMemo(() => {
    const base = DEFAULT_BLACKJACK_TABLE_LAYOUT;
    const out: Record<string, unknown> = {};
    if (JSON.stringify(layout.table) !== JSON.stringify(base.table)) out.table = layout.table;
    if (JSON.stringify(layout.seats) !== JSON.stringify(base.seats)) out.seats = layout.seats;
    if (JSON.stringify(layout.dealer) !== JSON.stringify(base.dealer)) out.dealer = layout.dealer;
    if (JSON.stringify(layout.cards) !== JSON.stringify(base.cards)) out.cards = layout.cards;
    if (JSON.stringify(layout.motion) !== JSON.stringify(base.motion)) out.motion = layout.motion;
    if (JSON.stringify(layout.emotes) !== JSON.stringify(base.emotes)) out.emotes = layout.emotes;
    if (Object.keys(soundOverrides).length > 0) out.sounds = soundOverrides;
    // Entries sitting at stock (e.g. after clicking the Dry style) are noise in
    // a saved theme — only genuinely customised events export.
    const fxEntries = Object.fromEntries(
      Object.entries(soundFx).filter(([key]) => isFxCustomised(soundFx, key)),
    );
    if (Object.keys(fxEntries).length > 0) out.soundFx = fxEntries;
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
    for (const key of ['table', 'seats', 'dealer', 'cards', 'motion', 'emotes'] as const) {
      if (diff[key] !== undefined) layoutPart[key] = diff[key];
    }
    const theme: BlackjackTableThemeConfig = { version: 1 };
    if (Object.keys(layoutPart).length > 0) theme.layout = layoutPart as BlackjackTableThemeConfig['layout'];
    if (diff.sounds) theme.sounds = diff.sounds as BlackjackTableThemeConfig['sounds'];
    if (diff.soundFx) theme.soundFx = diff.soundFx as BlackjackTableThemeConfig['soundFx'];
    return theme;
  }, [diff]);

  /* The design a personal save stores. Deliberately the WHOLE layout, not the
     diff: a saved design has to stand on its own when it's reloaded later,
     and a diff only means anything relative to whatever the defaults happened
     to be on the day it was written. The admin path keeps sending the sparse
     version, because a live table layers its theme over the stock table. */
  const currentFullDesign = useMemo((): BlackjackTableThemeConfig => {
    const design: BlackjackTableThemeConfig = { version: 1, layout };
    if (Object.keys(soundOverrides).length > 0) design.sounds = soundOverrides;
    if (Object.keys(soundFx).length > 0) design.soundFx = soundFx;
    return design;
  }, [layout, soundOverrides, soundFx]);

  const handleLoad = useCallback(async () => {
    if (!publishTableId) return;
    const result = await publish.loadTheme(publishTableId);
    // Only touch the editor on a successful load. `theme: null` there means the
    // table is genuinely stock; a failed fetch must not wipe unsaved work.
    if (result.ok) applyLoadedTheme(result.theme);
  }, [publishTableId, publish, applyLoadedTheme]);

  const handleSave = useCallback(async () => {
    if (!publishTableId) return;
    const saved = await publish.saveTheme(publishTableId, currentThemeConfig);
    // Adopt the uploaded media paths so the design survives the editor too.
    if (saved) applyLoadedTheme(saved);
  }, [publishTableId, publish, currentThemeConfig, applyLoadedTheme]);

  /* ── My tables: saving for everyone, not just admins ────────────────────
     useTablePublish above writes a theme onto a live multiplayer table and
     needs the admin wallet. This is the player-facing save: any signed-in
     wallet keeps its own designs, and saving one never touches a live table. */
  const mine = useMyTableDesigns();
  const [designName, setDesignName] = useState('My table');

  const handleSaveMine = useCallback(async () => {
    const name = designName.trim() || 'My table';
    // Overwrite the design being edited; otherwise start a new one. Saving is
    // the one place the whole layout goes to the server — the diff-only theme
    // config the admin path sends can't reconstruct a design on its own.
    if (mine.activeSlug) await mine.update(mine.activeSlug, name, currentFullDesign);
    else await mine.create(name, currentFullDesign);
  }, [designName, mine, currentFullDesign]);

  const handleSaveMineAsNew = useCallback(async () => {
    const name = designName.trim() || 'My table';
    await mine.create(name, currentFullDesign);
  }, [designName, mine, currentFullDesign]);

  const handleLoadMine = useCallback((slug: string) => {
    const found = mine.designs.find((d) => d.slug === slug);
    if (!found) return;
    // Merge onto the stock layout rather than trusting the blob wholesale, so
    // a design saved before a field existed still opens with that field set.
    applyLoadedTheme(found.design);
    mine.setActiveSlug(found.slug);
    setDesignName(found.name);
    mine.setStatus({ kind: 'ok', note: `Loaded \u201c${found.name}\u201d.` });
  }, [mine, applyLoadedTheme]);

  /* Deep link from the admin page: /blackjack-multi/design?table=<id> opens
     the designer already pointed at that table, and pulls its saved theme as
     soon as the admin wallet is known. One-shot — after the initial load the
     designer behaves exactly as if the table had been picked by hand. */
  const deepLinkLoadedRef = useRef(false);
  useEffect(() => {
    if (deepLinkLoadedRef.current) return;
    const id = new URLSearchParams(window.location.search).get('table')?.trim();
    if (!id) { deepLinkLoadedRef.current = true; return; }
    setPublishTableId(id);
    if (!publish.address) return; // effect re-runs once the wallet arrives
    deepLinkLoadedRef.current = true;
    void publish.loadTheme(id).then((result) => {
      if (result.ok) applyLoadedTheme(result.theme);
    });
  }, [publish, applyLoadedTheme]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diff, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the JSON is still visible below */
    }
  }, [diff]);

  const selectSeat = useCallback((index: number) => {
    setSelection({ kind: 'seat', index });
    setTab('tune');
  }, []);

  const selectedSeatIndex = selection?.kind === 'seat' ? selection.index : 1;
  const selectedSeat = selection?.kind === 'seat' ? layout.seats[selection.index] : null;

  // One numbered path through the studio. A step lights its check the moment
  // it differs from stock, so you can see at a glance what you've styled.
  const steps: { id: DeckTab; n: number; label: string; done: boolean }[] = [
    { id: 'art', n: 1, label: 'Table art', done: diff.table !== undefined },
    { id: 'cards', n: 2, label: 'Cards', done: diff.cards !== undefined },
    { id: 'anim', n: 3, label: 'Animations', done: diff.motion !== undefined },
    { id: 'sound', n: 4, label: 'Sounds', done: diff.sounds !== undefined || diff.soundFx !== undefined },
    { id: 'tune', n: 5, label: 'Fine-tune', done: diff.seats !== undefined || diff.dealer !== undefined },
    { id: 'share', n: 6, label: 'Save', done: false },
  ];
  const stepIndex = steps.findIndex((s) => s.id === tab);
  const currentStep = steps[stepIndex];
  const prevStep = stepIndex > 0 ? steps[stepIndex - 1] : null;
  const nextStep = stepIndex < steps.length - 1 ? steps[stepIndex + 1] : null;

  const stepNav = (
    <div className="bjtd-step-nav">
      {prevStep && (
        <button type="button" className="bjtd-sm-btn" onClick={() => setTab(prevStep.id)}>
          &larr; {prevStep.label}
        </button>
      )}
      {nextStep && (
        <button
          type="button"
          className="bjtd-sm-btn go"
          style={{ marginLeft: 'auto' }}
          onClick={() => setTab(nextStep.id)}
        >
          Next: {nextStep.label} &rarr;
        </button>
      )}
    </div>
  );

  return (
    <div className="bjtd">
      {/* React hoists these into <head>; same faces the slot builder uses. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
      />
      <div className="bjtd-wrap">
        <header className="bjtd-header">
          <h1 className="bjtd-title">
            Create-A-Table<span className="bjtd-glyph">&#9670;</span>
          </h1>
          <p className="bjtd-tagline">
            1 table art &middot; 2 cards &middot; 3 animations &middot; 4 sounds &middot; 5 fine-tune &middot; 6
            save &mdash; played in MORBIUS
          </p>
        </header>

        <div className="bjtd-topbar">
          <span className="bjtd-tagline" style={{ margin: 0 }}>
            In a hurry? A preset styles the whole table in one click:
          </span>
          <div className="bjtd-topbar-right">
            <select
              className="bjtd-preset-sel"
              aria-label="Table preset"
              value={activeTablePresetId ?? 'custom'}
              onChange={(e) => applyTablePreset(e.target.value)}
            >
              {activeTablePresetId === null && (
                <option value="custom" disabled>
                  Preset: Custom
                </option>
              )}
              {BLACKJACK_TABLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id} title={p.hint}>
                  Preset: {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bjtd-studio">
          {/* ── The five steps ────────────────────────────────────────────── */}
          <div className="bjtd-col-controls">
            <div className="bjtd-steps">
              {steps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`bjtd-step${tab === s.id ? ' active' : ''}${s.done ? ' done' : ''}`}
                  onClick={() => setTab(s.id)}
                >
                  <span className="bjtd-step-n">{s.done ? '✓' : s.n}</span>
                  {s.label}
                </button>
              ))}
            </div>

            <section className="bjtd-panel">
              <div className="bjtd-deck-head">
                <span className="bjtd-deck-title">
                  Step {currentStep.n} &middot; {currentStep.label}
                </span>
                <span className="bjtd-deck-sub">
                  {changeCount
                    ? `${changeCount} thing${changeCount === 1 ? '' : 's'} customised`
                    : 'stock table'}
                </span>
                <div className="bjtd-deck-actions" data-history-version={historyVersion}>
                  <button
                    type="button"
                    className="bjtd-sm-btn tiny"
                    onClick={undo}
                    disabled={past.current.length === 0}
                    title="Undo (Ctrl+Z)"
                  >
                    &#8617; Undo
                  </button>
                  <button
                    type="button"
                    className="bjtd-sm-btn tiny"
                    onClick={redo}
                    disabled={future.current.length === 0}
                    title="Redo (Ctrl+Shift+Z)"
                  >
                    &#8618;
                  </button>
                  <button
                    type="button"
                    className="bjtd-sm-btn tiny"
                    title="Back to the stock table"
                    onClick={() => {
                      beginGesture();
                      setLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Keyed on the step so the panel replays its entry animation
                  every time you move between steps — on a phone the whole
                  panel is the screen, and an instant swap gives you no sense
                  of having gone anywhere. */}
              <div className="bjtd-step-body" key={tab}>

              {/* ── FINE-TUNE: where everything sits ── */}
              {tab === 'tune' && (
                <div>
                  <p className="bjtd-hint" style={{ marginTop: 0 }}>
                    <b>Just drag things on the felt</b> — seats and the dealer&apos;s hand move where you drop
                    them, the &#10227; handle tilts a seat, arrow keys nudge (&#8679; = &times;10). The sliders
                    here are only for exact numbers.
                  </p>
                  <div className="bjtd-ctl" style={{ marginTop: 12 }}>
                    <div className="bjtd-seg">
                      {[0, 1, 2].map((i) => (
                        <button
                          key={i}
                          type="button"
                          className={selection?.kind === 'seat' && selection.index === i ? 'on' : ''}
                          onClick={() => setSelection({ kind: 'seat', index: i })}
                        >
                          Seat {i + 1}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={selection?.kind === 'dealer' ? 'on' : ''}
                        onClick={() => setSelection({ kind: 'dealer' })}
                      >
                        Dealer
                      </button>
                    </div>
                  </div>
                  {selection?.kind === 'dealer' ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <Knob
                        label="Across"
                        value={layout.seats[selectedSeatIndex].cx}
                        min={0}
                        max={CANVAS_W}
                        onGestureStart={beginGesture}
                        onChange={(v) => setSeat(selectedSeatIndex, 'cx', v)}
                      />
                      <Knob
                        label="Down"
                        value={layout.seats[selectedSeatIndex].floorY}
                        min={0}
                        max={CANVAS_H}
                        onGestureStart={beginGesture}
                        onChange={(v) => setSeat(selectedSeatIndex, 'floorY', v)}
                      />
                      <Knob
                        label="Tilt"
                        value={layout.seats[selectedSeatIndex].angle}
                        min={-45}
                        max={45}
                        suffix="&deg;"
                        onGestureStart={beginGesture}
                        onChange={(v) => setSeat(selectedSeatIndex, 'angle', v)}
                      />
                    </>
                  )}
                  {stepNav}
                </div>
              )}

              {/* ── TABLE ART ── */}
              {tab === 'art' && (
                <div>
                  <p className="bjtd-hint" style={{ marginTop: 0 }}>
                    <b>Start with your table.</b> Upload your own art or pick a branded table — it fills the
                    whole board, and everything else (seats, cards, sounds) builds on top of it. The board is
                    always 16:9, so your image always fits.
                  </p>

                  <button
                    type="button"
                    className="bjtd-art-drop"
                    onClick={() => artFileRef.current?.click()}
                  >
                    <span className="bjtd-art-drop-big">Upload your table art</span>
                    <span className="bjtd-art-drop-sub">PNG / JPG / WEBP &middot; landscape works best</span>
                  </button>
                  <input
                    ref={artFileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      pickTableArt(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />

                  <div className="bjtd-ctl" style={{ margin: '14px 0 6px' }}>
                    <div className="bjtd-ctl-lbl">
                      <span>Or pick a branded table</span>
                      {artIsUpload && <span className="bjtd-val">using your upload</span>}
                    </div>
                  </div>
                  <div className="bjtd-art-grid">
                    <button
                      type="button"
                      className={`bjtd-art-card${layout.table.image === '' ? ' on' : ''}`}
                      title="Whatever background this table is configured with"
                      onClick={() => setTableArt('')}
                    >
                      <img src={DEFAULT_TABLE_ART} alt="" />
                      <span className="bjtd-art-nm">Table default</span>
                    </button>
                    {BLACKJACK_IMAGE_BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        className={`bjtd-art-card${layout.table.image === bg.src ? ' on' : ''}`}
                        title={bg.label}
                        onClick={() => setTableArt(bg.src)}
                      >
                        <img src={bg.src} alt="" loading="lazy" />
                        <span className="bjtd-art-nm">{bg.label}</span>
                      </button>
                    ))}
                  </div>

                  {stepNav}
                </div>
              )}

              {/* ── CARDS: make them sit right on YOUR art ── */}
              {tab === 'cards' && (
                <div>
                  <p className="bjtd-hint" style={{ marginTop: 0 }}>
                    <b>Make the cards sit on your table.</b> Most table art is drawn at an angle, not straight
                    down — pick the lean that matches yours and the hands tilt into the scene. Then dress the
                    cards with an effect and your own card back.
                  </p>

                  <div className="bjtd-ctl" style={{ margin: '12px 0 6px' }}>
                    <div className="bjtd-ctl-lbl">
                      <span>Card angle</span>
                    </div>
                  </div>
                  <div className="bjtd-mech-grid">
                    {CARD_ANGLE_PRESETS.map((p) => {
                      const active = activeCardAnglePresetId(layout.cards.pitch) === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          title={p.hint}
                          className={`bjtd-mech-card${active ? ' on' : ''}`}
                          style={{ '--m-pitch': `${p.pitch.player}deg` } as React.CSSProperties}
                          onClick={() => {
                            beginGesture();
                            patch((prev) => ({
                              ...prev,
                              cards: { ...prev.cards, pitch: { ...p.pitch } },
                            }));
                          }}
                        >
                          <span className="bjtd-mini">
                            <span className="bjtd-mini-card tilt" />
                          </span>
                          <span className="bjtd-mech-nm">{p.label}</span>
                          <span className="bjtd-mech-dsc">{p.hint}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="bjtd-ctl" style={{ margin: '16px 0 6px' }}>
                    <div className="bjtd-ctl-lbl">
                      <span>Card effect</span>
                    </div>
                  </div>
                  <div className="bjtd-mech-grid">
                    {CARD_FX_PRESETS.map((p) => {
                      const active = activeCardFxPresetId(layout.cards.restShadow) === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          title={p.hint}
                          className={`bjtd-mech-card${active ? ' on' : ''}`}
                          onClick={() => {
                            beginGesture();
                            patch((prev) => ({
                              ...prev,
                              cards: { ...prev.cards, restShadow: p.restShadow, hoverShadow: p.hoverShadow },
                            }));
                          }}
                        >
                          <span className="bjtd-mini">
                            <span className="bjtd-mini-card" style={{ boxShadow: p.restShadow }} />
                          </span>
                          <span className="bjtd-mech-nm">{p.label}</span>
                          <span className="bjtd-mech-dsc">{p.hint}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="bjtd-ctl" style={{ margin: '18px 0 0' }}>
                    <div className="bjtd-ctl-lbl">
                      <span>Card back</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Preview the back as it actually deals — patterned field,
                          inset rule, mark centred inside it — not the raw image. */}
                      <CardBackSwatch layout={layout} w={44} h={62} />
                      <div className="bjtd-btn-row" style={{ marginTop: 0 }}>
                        <button type="button" className="bjtd-sm-btn" onClick={() => backFileRef.current?.click()}>
                          Upload image
                        </button>
                        <button
                          type="button"
                          className="bjtd-sm-btn"
                          onClick={() => {
                            beginGesture();
                            patch((p) => ({
                              ...p,
                              cards: { ...p.cards, backImage: DEFAULT_BLACKJACK_TABLE_LAYOUT.cards.backImage },
                            }));
                          }}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className={`bjtd-sm-btn${showTokenPicker ? ' go' : ''}`}
                          onClick={() => setShowTokenPicker((v) => !v)}
                        >
                          Token logo
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
                    {showTokenPicker && (
                      <div style={{ marginTop: 10 }}>
                        {/* Any PRC-20 on PulseChain can badge the back. The
                            picker already resolves a logo (scan first, then
                            DexScreener), so all this has to do is take the URL
                            it hands back. */}
                        <Prc20TokenPicker
                          value={backToken}
                          onChange={(t) => {
                            setBackToken(t);
                            if (!t?.logoUrl) return;
                            beginGesture();
                            patch((p) => ({ ...p, cards: { ...p.cards, backImage: t.logoUrl! } }));
                          }}
                          placeholder="Search a token, or paste 0x…"
                        />
                        {backToken && !backToken.logoUrl && (
                          <div className="bjtd-hint" style={{ marginTop: 6 }}>
                            {backToken.symbol} has no logo published on PulseChain or DexScreener — upload
                            an image instead.
                          </div>
                        )}
                      </div>
                    )}
                    <div className="bjtd-ctl-lbl" style={{ marginTop: 14 }}>
                      <span>Back pattern</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {TABLE_CARD_BACKS.map((b) => {
                        const on = (layout.cards.backDesign ?? DEFAULT_CARD_BACK.id) === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            title={b.label}
                            aria-pressed={on}
                            onClick={() => {
                              beginGesture();
                              patch((p) => ({ ...p, cards: { ...p.cards, backDesign: b.id } }));
                            }}
                            style={{
                              padding: 3,
                              borderRadius: 8,
                              background: 'transparent',
                              border: `1px solid ${on ? 'rgba(34,211,238,.75)' : 'rgba(148,163,184,.22)'}`,
                              cursor: 'pointer',
                              lineHeight: 0,
                            }}
                          >
                            <CardBackSwatch
                              layout={{ ...layout, cards: { ...layout.cards, backDesign: b.id } }}
                              w={34}
                              h={48}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <p className="bjtd-hint">Shown on every face-down card.</p>
                  </div>

                  <details style={{ marginTop: 16 }}>
                    <summary
                      className="bjtd-ctl-lbl"
                      style={{ cursor: 'pointer', display: 'flex', gap: 8, listStyle: 'none' }}
                    >
                      <span>Fine-tune the lean &#9662;</span>
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      <Knob
                        label="Dealer hand lean"
                        value={layout.cards.pitch.dealer}
                        min={0}
                        max={75}
                        suffix="&deg;"
                        onGestureStart={beginGesture}
                        onChange={(v) =>
                          patch((p) => ({
                            ...p,
                            cards: { ...p.cards, pitch: { ...p.cards.pitch, dealer: v } },
                          }))
                        }
                      />
                      <Knob
                        label="Player hands lean"
                        value={layout.cards.pitch.player}
                        min={0}
                        max={75}
                        suffix="&deg;"
                        onGestureStart={beginGesture}
                        onChange={(v) =>
                          patch((p) => ({
                            ...p,
                            cards: { ...p.cards, pitch: { ...p.cards.pitch, player: v } },
                          }))
                        }
                      />
                      <p className="bjtd-hint">
                        The dealer sits deeper in the scene, so a smaller dealer lean usually looks right.
                      </p>
                    </div>
                  </details>
                  {stepNav}
                </div>
              )}

              {/* ── ANIMATIONS ── */}
              {tab === 'anim' && (
                <div>
                  <p className="bjtd-hint" style={{ marginTop: 0 }}>
                    <b>Pick a dealing style.</b> Each card shows a live example — click one and the real table
                    re-deals with it. Fine-tune knobs are underneath if a style is almost right.
                  </p>
                  <div className="bjtd-ctl" style={{ margin: '12px 0 6px' }}>
                    <div className="bjtd-ctl-lbl">
                      <span>Cards dealt in</span>
                    </div>
                  </div>
                  <div className="bjtd-mech-grid">
                    {DEAL_IN_PRESETS.map((p) => {
                      const active = activeDealInPresetId(layout.motion.dealIn) === p.id;
                      const m = p.motion;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          title={p.hint}
                          className={`bjtd-mech-card${active ? ' on' : ''}`}
                          style={
                            {
                              '--m-x': `${clamp(m.fromX * 0.22, -70, 70)}px`,
                              '--m-y': `${clamp(m.fromY * 0.22, -60, 60)}px`,
                              '--m-rot': `${m.fromRot}deg`,
                              '--m-scale': String(m.fromScale),
                              '--m-ease': m.easing,
                              '--m-loop': `${Math.max(2000, m.durationMs * 2 + 1400)}ms`,
                              '--m-lag': `${Math.min(m.staggerMs, 400)}ms`,
                            } as React.CSSProperties
                          }
                          onClick={() => {
                            beginGesture();
                            patch((prev) => ({ ...prev, motion: { ...prev.motion, dealIn: { ...m } } }));
                            runDealPreview();
                          }}
                        >
                          <span className="bjtd-mini">
                            <span className="bjtd-mini-card in two" />
                            <span className="bjtd-mini-card in" />
                          </span>
                          <span className="bjtd-mech-nm">{p.label}</span>
                          <span className="bjtd-mech-dsc">{p.hint}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="bjtd-ctl" style={{ margin: '16px 0 6px' }}>
                    <div className="bjtd-ctl-lbl">
                      <span>Cards collected</span>
                    </div>
                  </div>
                  <div className="bjtd-mech-grid">
                    {CLEAR_OUT_PRESETS.map((p) => {
                      const active = activeClearOutPresetId(layout.motion.clearOut) === p.id;
                      const m = p.motion;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          title={p.hint}
                          className={`bjtd-mech-card${active ? ' on' : ''}`}
                          style={
                            {
                              '--m-x': `${clamp(m.toX * 0.22, -70, 70)}px`,
                              '--m-y': `${clamp(m.toY * 0.22, -60, 60)}px`,
                              '--m-scale': String(m.scale),
                              '--m-ease': m.easing,
                              '--m-loop': `${Math.max(2000, m.durationMs * 2 + 1400)}ms`,
                              '--m-lag': `${Math.min(Math.max(m.dealerStaggerMs, m.playerStaggerMs), 400)}ms`,
                            } as React.CSSProperties
                          }
                          onClick={() => {
                            beginGesture();
                            patch((prev) => ({ ...prev, motion: { ...prev.motion, clearOut: { ...m } } }));
                            runDealPreview();
                          }}
                        >
                          <span className="bjtd-mini">
                            <span className="bjtd-mini-card out two" />
                            <span className="bjtd-mini-card out" />
                          </span>
                          <span className="bjtd-mech-nm">{p.label}</span>
                          <span className="bjtd-mech-dsc">{p.hint}</span>
                        </button>
                      );
                    })}
                  </div>

                  <details style={{ marginTop: 16 }}>
                    <summary
                      className="bjtd-ctl-lbl"
                      style={{ cursor: 'pointer', display: 'flex', gap: 8, listStyle: 'none' }}
                    >
                      <span>Fine-tune the current styles &#9662;</span>
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      <div className="bjtd-grid2">
                        <Knob
                          label="Deal — from across"
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
                          label="Deal — from above"
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
                          label="Deal — spin"
                          value={layout.motion.dealIn.fromRot}
                          min={-180}
                          max={180}
                          suffix="&deg;"
                          onGestureStart={beginGesture}
                          onChange={(v) =>
                            patch((p) => ({
                              ...p,
                              motion: { ...p.motion, dealIn: { ...p.motion.dealIn, fromRot: v } },
                            }))
                          }
                        />
                        <Knob
                          label="Deal — start size"
                          value={layout.motion.dealIn.fromScale}
                          min={0.3}
                          max={1.6}
                          step={0.05}
                          suffix="&times;"
                          onGestureStart={beginGesture}
                          onChange={(v) =>
                            patch((p) => ({
                              ...p,
                              motion: { ...p.motion, dealIn: { ...p.motion.dealIn, fromScale: v } },
                            }))
                          }
                        />
                        <Knob
                          label="Deal — speed"
                          value={layout.motion.dealIn.durationMs}
                          min={100}
                          max={2000}
                          step={25}
                          suffix="ms"
                          onGestureStart={beginGesture}
                          onChange={(v) =>
                            patch((p) => ({
                              ...p,
                              motion: { ...p.motion, dealIn: { ...p.motion.dealIn, durationMs: v } },
                            }))
                          }
                        />
                        <Knob
                          label="Deal — gap between cards"
                          value={layout.motion.dealIn.staggerMs}
                          min={0}
                          max={800}
                          step={10}
                          suffix="ms"
                          onGestureStart={beginGesture}
                          onChange={(v) =>
                            patch((p) => ({
                              ...p,
                              motion: { ...p.motion, dealIn: { ...p.motion.dealIn, staggerMs: v } },
                            }))
                          }
                        />
                        <Knob
                          label="Collect — across"
                          value={layout.motion.clearOut.toX}
                          min={-400}
                          max={400}
                          suffix="px"
                          onGestureStart={beginGesture}
                          onChange={(v) =>
                            patch((p) => ({
                              ...p,
                              motion: { ...p.motion, clearOut: { ...p.motion.clearOut, toX: v } },
                            }))
                          }
                        />
                        <Knob
                          label="Collect — up/down"
                          value={layout.motion.clearOut.toY}
                          min={-400}
                          max={400}
                          suffix="px"
                          onGestureStart={beginGesture}
                          onChange={(v) =>
                            patch((p) => ({
                              ...p,
                              motion: { ...p.motion, clearOut: { ...p.motion.clearOut, toY: v } },
                            }))
                          }
                        />
                        <Knob
                          label="Collect — end size"
                          value={layout.motion.clearOut.scale}
                          min={0}
                          max={2}
                          step={0.05}
                          suffix="&times;"
                          onGestureStart={beginGesture}
                          onChange={(v) =>
                            patch((p) => ({
                              ...p,
                              motion: { ...p.motion, clearOut: { ...p.motion.clearOut, scale: v } },
                            }))
                          }
                        />
                        <Knob
                          label="Collect — speed"
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
                      </div>
                    </div>
                  </details>
                  {stepNav}
                </div>
              )}

              {/* ── SOUND ── */}
              {tab === 'sound' && (
                <div className="bjsnd">
                  <p className="bjtd-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                    <b>Pick a sound style</b> — it re-voices every table event at once and plays a taste.
                    Click a tile to restyle, replace, record or mute one sound. Audio is pure presentation —
                    it never touches the cards.
                  </p>
                  <div className="bjsnd-preset-row" style={{ marginBottom: 12 }}>
                    <span className="bjsnd-preset-cap">Whole table</span>
                    {SOUND_FX_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        title={`${preset.hint} — applies to every event`}
                        className={`bjsnd-btn${activeWholeTableStyleId === preset.id ? ' on' : ''}`}
                        onClick={() => {
                          setSoundFx((prev) => {
                            const next: SoundFxMap = {};
                            for (const info of BLACKJACK_SOUND_EVENT_INFO) {
                              const sample = fxFor(prev, info.key).sample;
                              next[info.key] = fxFromPreset(preset, sample);
                            }
                            return next;
                          });
                          auditionSoon('cardDeal');
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
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
                          onFxChange={(patchFx) => patchSoundFx(info.key, patchFx)}
                          onGestureStart={beginGesture}
                        />
                      );
                    })}
                  </div>
                  <p className="bjtd-hint">
                    Uploads and styles are local previews until you save in step 5 — that&apos;s when they get
                    stored and heard by everyone at the table.
                  </p>
                  {stepNav}
                </div>
              )}

              {/* ── SAVE & SHARE ── */}
              {tab === 'share' && (
                <div>
                  <p className="bjtd-hint" style={{ marginTop: 0 }}>
                    <b>Save your table.</b> Everything — seats, cards, animations, sounds — is kept together,
                    so you can come back and carry on, or open it again from any device.
                  </p>

                  {/* My tables — open to any signed-in wallet. */}
                  <div className="bjtd-save-panel">
                    <div className="bjtd-ctl-lbl">
                      <span>My tables</span>
                      {mine.isConnected && (
                        <span className="bjtd-val">
                          {mine.designs.length} saved
                        </span>
                      )}
                    </div>
                    {!mine.isConnected ? (
                      <p className="bjtd-msg dim">Connect your wallet to save this table to your account.</p>
                    ) : (
                      <>
                        <input
                          className="bjtd-text"
                          value={designName}
                          maxLength={48}
                          placeholder="Name this table"
                          onChange={(e) => setDesignName(e.target.value)}
                        />
                        <div className="bjtd-btn-row">
                          <button
                            type="button"
                            className="bjtd-sm-btn go"
                            onClick={() => void handleSaveMine()}
                            disabled={mine.status.kind === 'busy'}
                          >
                            {mine.activeSlug ? 'Save changes' : 'Save table'}
                          </button>
                          {mine.activeSlug && (
                            <button
                              type="button"
                              className="bjtd-sm-btn"
                              onClick={() => void handleSaveMineAsNew()}
                              disabled={mine.status.kind === 'busy'}
                            >
                              Save as new
                            </button>
                          )}
                        </div>
                        {mine.designs.length > 0 && (
                          <ul className="bjtd-design-list">
                            {mine.designs.map((d) => (
                              <li
                                key={d.slug}
                                className={`bjtd-design-row${d.slug === mine.activeSlug ? ' on' : ''}`}
                              >
                                <span className="nm">{d.name}</span>
                                <button
                                  type="button"
                                  className="bjtd-sm-btn tiny"
                                  onClick={() => handleLoadMine(d.slug)}
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  className="bjtd-sm-btn tiny"
                                  onClick={() => void mine.remove(d.slug)}
                                  disabled={mine.status.kind === 'busy'}
                                  aria-label={`Delete ${d.name}`}
                                >
                                  &times;
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {mine.status.kind !== 'idle' && (
                          <div
                            className={`bjtd-msg ${
                              mine.status.kind === 'error' ? 'err' : mine.status.kind === 'ok' ? 'ok' : 'dim'
                            }`}
                          >
                            {mine.status.note}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Admin-only: push a design onto a live multiplayer table. */}
                  {!publish.address ? (
                    <p className="bjtd-msg dim" style={{ marginTop: 14 }}>
                      Connect an admin wallet to also push a design onto a live multiplayer table.
                    </p>
                  ) : (
                    <div style={{ marginTop: 14 }}>
                      <div className="bjtd-ctl">
                        <div className="bjtd-ctl-lbl">
                          <span>Table</span>
                          <span className="bjtd-val">
                            {publish.tables.length} table{publish.tables.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <select
                          className="bjtd-sel"
                          style={{ width: '100%' }}
                          value={publishTableId}
                          onChange={(e) => setPublishTableId(e.target.value)}
                        >
                          <option value="">Choose a table&hellip;</option>
                          {publish.tables.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.id.slice(0, 8)} &middot; {t.status}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="bjtd-btn-row">
                        <button
                          type="button"
                          className="bjtd-sm-btn go"
                          onClick={() => void handleSave()}
                          disabled={!publishTableId || publish.status.kind === 'busy'}
                        >
                          Save to table
                        </button>
                        <button
                          type="button"
                          className="bjtd-sm-btn"
                          onClick={() => void handleLoad()}
                          disabled={!publishTableId || publish.status.kind === 'busy'}
                        >
                          Load saved theme
                        </button>
                      </div>
                      <div
                        className={`bjtd-msg ${
                          publish.status.kind === 'error' ? 'err' : publish.status.kind === 'ok' ? 'ok' : 'dim'
                        }`}
                      >
                        {publish.status.kind !== 'idle'
                          ? publish.status.note
                          : (publish.tablesError ?? '')}
                      </div>
                    </div>
                  )}
                  <details style={{ marginTop: 16 }}>
                    <summary
                      className="bjtd-ctl-lbl"
                      style={{ cursor: 'pointer', display: 'flex', gap: 8, listStyle: 'none' }}
                    >
                      <span>For nerds: the theme as JSON &#9662;</span>
                    </summary>
                    <textarea
                      className="bjtd-json-ta"
                      readOnly
                      spellCheck={false}
                      value={changeCount ? JSON.stringify(diff, null, 2) : '// unchanged from the stock table'}
                      style={{ marginTop: 10 }}
                    />
                    <div className="bjtd-btn-row">
                      <button type="button" className="bjtd-sm-btn" onClick={copyJson}>
                        {copied ? 'Copied' : 'Copy JSON'}
                      </button>
                    </div>
                  </details>
                  {stepNav}
                </div>
              )}
              </div>
            </section>
          </div>

          {/* ── Live table — pinned preview ───────────────────────────────── */}
          <div className="bjtd-col-preview">
            <div className="bjtd-sticky">
              <section className="bjtd-panel bjtd-board-panel">
                <div className="bjtd-board-hud">
                  {DESIGN_SCENARIOS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      title={s.description}
                      className={`bjtd-scn-chip${s.id === scenarioId ? ' on' : ''}`}
                      onClick={() => setScenarioId(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                  <label className="bjtd-chk">
                    <input
                      type="checkbox"
                      checked={showGuides}
                      onChange={(e) => setShowGuides(e.target.checked)}
                    />
                    Guides
                  </label>
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
                          background: '#06120b',
                          border: '1px solid rgba(34,211,238,0.16)',
                          borderRadius: 12,
                          overflow: 'hidden',
                        }}
                      >
                        {/* The table art itself + the same dark overlay the live
                            table draws, so the designer shows the real thing. */}
                        <img
                          src={stageArt}
                          alt=""
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center',
                            pointerEvents: 'none',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(145deg, rgba(0,0,0,0.22), rgba(0,0,0,0.12))',
                            pointerEvents: 'none',
                          }}
                        />
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
                                fill="#f0b429"
                                fontSize={11}
                                fontFamily="ui-monospace, monospace"
                              >
                                {Math.round(selectedSeat.cx)}, {Math.round(selectedSeat.floorY)} &middot;{' '}
                                {Math.round(selectedSeat.angle)}&deg;
                              </text>
                            )}
                            {selection?.kind === 'dealer' && (
                              <text
                                x={layout.dealer.cx}
                                y={clamp(layout.dealer.top - 8, 14, CANVAS_H - 4)}
                                textAnchor="middle"
                                fill="#f0b429"
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
                              selection?.kind === 'dealer'
                                ? '2px solid #f0b429'
                                : '1px dashed rgba(255,255,255,0.12)',
                            outlineOffset: 6,
                            borderRadius: 6,
                            cursor: dragging ? 'grabbing' : 'grab',
                            touchAction: 'none',
                          }}
                          onPointerDown={(e) => {
                            setSelection({ kind: 'dealer' });
                            setTab('tune');
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
                          <BlackjackMultiDealerArea
                            tableViewState={state}
                            visibleDealerCards={state.dealerCards.length}
                            cardsExiting={dealPreview === 'exit'}
                            newDealerCardIndices={previewNewDealerCards}
                          />
                        </div>

                        <BlackjackMultiSeatGrid
                          seats={seats}
                          cardsExiting={dealPreview === 'exit'}
                          newPlayerCardByHandKey={previewNewPlayerCards}
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
                              selectSeat(i);
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
                              border:
                                selection?.kind === 'seat' && selection.index === i
                                  ? '2px solid #f0b429'
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
                                color:
                                  selection?.kind === 'seat' && selection.index === i
                                    ? '#f0b429'
                                    : 'rgba(255,255,255,0.45)',
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
                        {selectedSeat && selection?.kind === 'seat' && (
                          <div
                            title="Drag sideways to tilt the seat"
                            onPointerDown={(e) => {
                              const idx = selection.index;
                              const origAngle = layoutRef.current.seats[idx].angle;
                              beginDrag(e, (dx) =>
                                setSeat(idx, 'angle', clamp(Math.round(origAngle + dx * 0.4), -45, 45)),
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
                              background: '#f0b429',
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
                            &#10227;
                          </div>
                        )}
                      </div>
                    </BlackjackTableLayoutProvider>
                  </div>
                </div>
              </section>

              <div className="bjtd-actions">
                <button
                  type="button"
                  className="bjtd-btn-glow"
                  onClick={runDealPreview}
                  disabled={dealPreview !== null}
                >
                  {dealPreview ? 'Dealing…' : 'Deal preview'}
                  <span className="bjtd-btn-sub">collects &amp; re-deals with your animation styles</span>
                </button>
              </div>
              <p className="bjtd-edit-hint">
                Drag a <b>seat</b> or the <b>dealer</b> right on the felt &mdash; clicking one opens its
                settings.{' '}
                {/* Keyboard nudging and Ctrl+Z are real, but only on a keyboard.
                    Reading them on a phone is noise, so the pointer query hides
                    this half rather than promising something you can't do. */}
                <span className="bjtd-kbd-only">Arrow keys nudge (&#8679; = &times;10) &middot; Ctrl+Z undoes.</span>
              </p>
            </div>
          </div>
        </div>
      </div>

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
