'use client';

/**
 * One sound event: an icon tile that expands into the four-module FX panel.
 *
 * Ported from the slot builder's sound tab. Each icon's animation mimics the
 * character of its sound — cards drop, chips flip, knocks jitter — and runs
 * both on hover and when the sound actually fires, so hovering previews what
 * the tile looks like in play.
 */

import { useCallback, useRef, useState } from 'react';
import {
  BLACKJACK_SOUND_EVENT_INFO,
  DEFAULT_BLACKJACK_SOUND_MAP,
  type BlackjackSoundEventKey,
} from '@/lib/blackjack-sounds';
import { envReadText, type SoundFx } from '@/lib/blackjack-sound-fx';
import { SoundKnob } from './SoundKnob';
import { EchoTunnel, EnvelopeCanvas, SpatialPad, Stereograph } from './SoundWidgets';

type IconType = 'card' | 'chip' | 'knock' | 'voice' | 'burst' | 'gem' | 'spark' | 'shuffle' | 'door' | 'tap';

/** Maps an event to the icon whose animation best matches how it sounds. */
export function iconTypeFor(key: BlackjackSoundEventKey): IconType {
  if (key === 'cardDeal') return 'card';
  if (key === 'hitKnock') return 'knock';
  if (key === 'click') return 'tap';
  if (key === 'opponentJoined' || key === 'opponentLeft') return 'door';
  if (key === 'voicePlayerBlackjack') return 'gem';
  if (key === 'voicePlayerWins') return 'burst';
  if (key === 'voiceDealerBlackjack' || key === 'voiceDealerWins') return 'spark';
  if (key === 'voiceDealerPhrase' || key === 'voiceBettingOpen' || key === 'voiceBettingClosed')
    return 'voice';
  if (key === 'voiceTipThanks') return 'chip';
  if (key === 'voicePush') return 'shuffle';
  return 'tap';
}

const ICONS: Record<IconType, React.ReactNode> = {
  card: (
    <>
      <rect x="3" y="6" width="7" height="13" rx="1.5" />
      <rect x="11" y="4" width="7" height="13" rx="1.5" transform="rotate(8 14.5 10.5)" />
    </>
  ),
  chip: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <ellipse cx="12" cy="12" rx="3.4" ry="8.2" />
    </>
  ),
  knock: (
    <path
      d="M13.2 2.5L5.5 13.2h4.6l-1.8 8.3 8.2-11h-4.6l1.3-8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  voice: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  burst: (
    <>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      <path d="M12 2.5v4.2M12 17.3v4.2M2.5 12h4.2M17.3 12h4.2M5.3 5.3l3 3M15.7 15.7l3 3M18.7 5.3l-3 3M8.3 15.7l-3 3" />
    </>
  ),
  gem: (
    <>
      <path d="M7.2 4.5h9.6L20.5 9 12 19.8 3.5 9l3.7-4.5z" />
      <path d="M3.5 9h17M9.7 9L12 19l2.3-10M7.2 4.5L9.7 9l2.3-4.5L14.3 9l2.5-4.5" />
    </>
  ),
  spark: (
    <>
      <path d="M11 4.5l1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1z" fill="currentColor" stroke="none" />
      <path
        d="M17.6 13.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M6.4 14.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" fill="currentColor" stroke="none" />
    </>
  ),
  shuffle: (
    <>
      <path d="M19.3 12a7.3 7.3 0 1 1-2.1-5.1" />
      <path d="M19.6 3.6v3.6H16" />
    </>
  ),
  door: (
    <>
      <path d="M14.5 3.5H5.5v17h9" />
      <path d="M18.5 12h-7M15.5 8.8L18.8 12l-3.3 3.2" />
    </>
  ),
  tap: (
    <>
      <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="7.6" />
    </>
  ),
};

function SoundIcon({ type }: { type: IconType }) {
  return (
    <div className={`bjsnd-ico ico-${type}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[type]}
      </svg>
    </div>
  );
}

export function SoundEventTile({
  info,
  fx,
  hasCustomFile,
  fxTweaked,
  isMuted,
  customLabel,
  autoPlay,
  expanded,
  playing,
  onToggleExpand,
  onPlay,
  onUpload,
  onOpenLibrary,
  onToggleRecord,
  recording,
  onToggleMute,
  onReset,
  onToggleAutoPlay,
  onFxChange,
  onGestureStart,
  sourceUrl,
}: {
  info: (typeof BLACKJACK_SOUND_EVENT_INFO)[number];
  fx: SoundFx;
  /** An uploaded file has replaced this event's pool. */
  hasCustomFile: boolean;
  /** The FX chain has been moved off its defaults (distinct from a new file). */
  fxTweaked: boolean;
  isMuted: boolean;
  customLabel?: string;
  autoPlay: boolean;
  expanded: boolean;
  playing: boolean;
  onToggleExpand: () => void;
  onPlay: () => void;
  onUpload: (file: File) => void;
  onOpenLibrary: () => void;
  /** Starts or stops recording for this event; only one runs at a time. */
  onToggleRecord: () => void;
  recording: boolean;
  onToggleMute: () => void;
  onReset: () => void;
  onToggleAutoPlay: () => void;
  onFxChange: (patch: Partial<SoundFx>) => void;
  onGestureStart?: () => void;
  sourceUrl: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [iconKey, setIconKey] = useState(0);
  const type = iconTypeFor(info.key);
  const pool = DEFAULT_BLACKJACK_SOUND_MAP[info.key];

  // An uploaded file and a tweaked FX chain are different things, and saying
  // "uploaded sample" for a envelope nudge would be a lie about what changed.
  const base = hasCustomFile
    ? `Custom: ${customLabel || 'uploaded sample'}`
    : `Default${pool.length > 1 ? ` · ${pool.length} variations` : ''}`;
  const status = isMuted ? 'Muted' : fxTweaked ? `${base} · tweaked` : base;

  const play = useCallback(() => {
    setIconKey((k) => k + 1); // restart the icon animation on every play
    onPlay();
  }, [onPlay]);

  return (
    <div className={`bjsnd-wrap${expanded ? ' expanded' : ''}`}>
      <div
        className={`bjsnd-tile${expanded ? ' on' : ''}${playing ? ' playing' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        title={`${info.label} — click to customize`}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        <button
          type="button"
          className="bjsnd-tile-play"
          title="Play"
          aria-label={`Play ${info.label}`}
          onClick={(e) => {
            e.stopPropagation();
            play();
          }}
        >
          ▶
        </button>
        <span key={iconKey}>
          <SoundIcon type={type} />
        </span>
        <div className="bjsnd-meta">
          <div className="bjsnd-lbl">{info.label}</div>
          <div className="bjsnd-tag">{info.key}</div>
        </div>
      </div>

      {expanded && (
        <div className="bjsnd-panel">
          <div className="bjsnd-samp-row">
            <div className="bjsnd-samp-status">{status}</div>
            <div className="bjsnd-samp-btns">
              <button type="button" className="bjsnd-btn" onClick={play}>
                ▶ Play
              </button>
              <button
                type="button"
                className={`bjsnd-btn${autoPlay ? ' on' : ''}`}
                title="Replay this sound automatically after every tweak"
                onClick={onToggleAutoPlay}
              >
                ↻ Auto-play: {autoPlay ? 'ON' : 'OFF'}
              </button>
              <button type="button" className="bjsnd-btn" onClick={() => fileRef.current?.click()}>
                ↑ Upload
              </button>
              <button
                type="button"
                className={`bjsnd-btn${recording ? ' recording' : ''}`}
                onClick={onToggleRecord}
              >
                {recording ? '● Recording… (tap to stop)' : '● Record'}
              </button>
              <button type="button" className="bjsnd-btn" onClick={onOpenLibrary}>
                ♪ Library
              </button>
              <button type="button" className="bjsnd-btn" onClick={onToggleMute}>
                {isMuted ? '🔇 Unmute' : '🔊 Mute'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="bjsnd-reset-lnk"
                onClick={onReset}
                style={{ visibility: hasCustomFile || fxTweaked || isMuted ? 'visible' : 'hidden' }}
              >
                ↺ Reset to default
              </button>
            </div>
            <p style={{ fontSize: 10, color: '#64748b', margin: '5px 0 0', lineHeight: 1.5 }}>
              Recordings and uploads stay in this browser and this config&rsquo;s JSON — nothing is
              sent anywhere yet.
            </p>
          </div>

          <div className="bjsnd-mod-grid">
            <div className="bjsnd-mod">
              <div className="bjsnd-cap">Envelope</div>
              <EnvelopeCanvas
                fx={fx}
                sourceUrl={sourceUrl}
                onChange={onFxChange}
                onGestureStart={onGestureStart}
              />
              <div className="bjsnd-fill" />
              <div className="bjsnd-knob-row">
                <SoundKnob
                  label="Volume"
                  min={0}
                  max={200}
                  step={1}
                  suffix="%"
                  value={Math.round(fx.volume * 100)}
                  onGestureStart={onGestureStart}
                  onChange={(v) => onFxChange({ volume: v / 100 })}
                />
                <SoundKnob
                  label="Pitch"
                  min={50}
                  max={200}
                  step={1}
                  suffix="%"
                  value={Math.round(fx.pitch * 100)}
                  onGestureStart={onGestureStart}
                  onChange={(v) => onFxChange({ pitch: v / 100 })}
                />
              </div>
            </div>

            <div className="bjsnd-mod">
              <div className="bjsnd-cap">Spatial</div>
              <SpatialPad fx={fx} onChange={onFxChange} onGestureStart={onGestureStart} />
              <div className="bjsnd-fill" />
              <div className="bjsnd-knob-row">
                <SoundKnob
                  label="Reverb decay"
                  min={0.2}
                  max={4}
                  step={0.1}
                  suffix="s"
                  value={fx.reverbDecay}
                  onGestureStart={onGestureStart}
                  onChange={(v) => onFxChange({ reverbDecay: v })}
                />
              </div>
            </div>

            <div className="bjsnd-mod">
              <div className="bjsnd-cap">Echo tunnel</div>
              <EchoTunnel id={info.key} fx={fx} onChange={onFxChange} onGestureStart={onGestureStart} />
              <div className="bjsnd-fill" />
              <div className="bjsnd-knob-row">
                <SoundKnob
                  label="Delay mix"
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  value={Math.round(fx.delayMix * 100)}
                  onGestureStart={onGestureStart}
                  onChange={(v) => onFxChange({ delayMix: v / 100 })}
                />
              </div>
            </div>

            <div className="bjsnd-mod">
              <div className="bjsnd-cap">Stereograph</div>
              <Stereograph id={info.key} />
              <div className="bjsnd-read">L/R scope — hit Play</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { envReadText };
