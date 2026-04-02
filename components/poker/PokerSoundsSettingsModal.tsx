'use client';

import React from 'react';
import { usePokerSounds, type PokerSoundKey } from '@/hooks/use-poker-sounds';

type PokerSoundsSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const SOUND_LABELS: Record<PokerSoundKey, string> = {
  player_turn: 'Player Turn',
  raise: 'Raise',
  call: 'Call',
  win: 'Win',
  cards_dealing: 'Cards Dealing',
  opponent_fold: 'Opponent Fold',
  opponent_allin: 'Opponent All-In',
  opponent_call_raise: 'Opponent Call/Raise',
  opponent_checks: 'Opponent Checks',
  player_allin: 'Player All-In',
  opponent_joined: 'Opponent Joined',
  opponent_left: 'Opponent Left',
};

const UI_KEYS: PokerSoundKey[] = ['player_turn', 'raise', 'call', 'win'];

function SoundRow({
  k,
}: {
  k: PokerSoundKey;
}) {
  const {
    isKeyMuted,
    setKeyMuted,
    setKeyVolume,
    getKeyVolume,
  } = usePokerSounds();

  const muted = isKeyMuted(k);
  const vol = getKeyVolume(k);

  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-xl border border-white/5 bg-black/20">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-white/90 truncate">{SOUND_LABELS[k]}</div>
          <div className="text-[11px] text-white/40">Adjust volume or mute this sound</div>
        </div>
        <button
          type="button"
          onClick={() => setKeyMuted(k, !muted)}
          className="shrink-0 px-3 py-1 rounded-lg text-[12px] font-bold transition-all border"
          style={{
            background: muted ? 'rgba(255,255,255,0.04)' : 'rgba(34,211,238,0.10)',
            borderColor: muted ? 'rgba(255,255,255,0.10)' : 'rgba(34,211,238,0.30)',
            color: muted ? 'rgba(255,255,255,0.65)' : 'rgba(34,211,238,0.95)',
          }}
          aria-pressed={muted}
        >
          {muted ? 'Muted' : 'On'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-[64px] text-[11px] text-white/50 tabular-nums">{Math.round(vol * 100)}%</div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(vol * 100)}
          onChange={(e) => setKeyVolume(k, Number(e.target.value) / 100)}
          className="w-full poker-slider"
          aria-label={`${SOUND_LABELS[k]} volume`}
        />
      </div>
    </div>
  );
}

export function PokerSoundsSettingsModal({ isOpen, onClose }: PokerSoundsSettingsModalProps) {
  const sounds = usePokerSounds();

  if (!isOpen) return null;

  return (
    <div
      className="surface-modal-shell"
      role="dialog"
      aria-modal="true"
      aria-label="Poker sounds settings"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="surface-modal-card"
        style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-white/5"
          style={{ background: 'rgba(0,0,0,0.25)' }}
        >
          <div>
            <div className="text-[13px] font-extrabold tracking-wide uppercase" style={{ color: 'rgba(34,211,238,0.95)' }}>
              Sounds
            </div>
            <div className="text-[11px] text-white/50">Mute and volume controls for poker</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl transition-all hover:bg-white/10 flex items-center justify-center"
            style={{ color: 'rgba(255,255,255,0.7)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/5 bg-black/20">
            <div>
              <div className="text-[12px] font-bold text-white/90">Mute all sounds</div>
              <div className="text-[11px] text-white/40">Disables every poker sound effect</div>
            </div>
            <button
              type="button"
              onClick={() => sounds.setGlobalMuted(!sounds.globalMuted)}
              className="shrink-0 px-3 py-1 rounded-lg text-[12px] font-bold transition-all border"
              style={{
                background: sounds.globalMuted ? 'rgba(255,255,255,0.04)' : 'rgba(34,211,238,0.10)',
                borderColor: sounds.globalMuted ? 'rgba(255,255,255,0.10)' : 'rgba(34,211,238,0.30)',
                color: sounds.globalMuted ? 'rgba(255,255,255,0.65)' : 'rgba(34,211,238,0.95)',
              }}
              aria-pressed={sounds.globalMuted}
            >
              {sounds.globalMuted ? 'Muted' : 'On'}
            </button>
          </div>

          {UI_KEYS.map((k) => (
            <SoundRow key={k} k={k} />
          ))}
        </div>

        <div className="px-4 py-3 border-t border-white/5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-[12px] font-bold transition-all hover:brightness-125"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.75)' }}
          >
            Done
          </button>
        </div>
      </div>

      <style jsx>{`
        .poker-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          background: linear-gradient(
            to right,
            rgba(34, 211, 238, 0.9) 0%,
            rgba(255,255,255,0.18) 100%
          );
        }
        .poker-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid rgba(34, 211, 238, 0.75);
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  );
}

