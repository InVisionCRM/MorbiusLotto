'use client';

import React from 'react';
import { Volume2, VolumeX, Settings2, Music, Play, Pause, SkipForward, Mic, MicOff } from 'lucide-react';

type BlackjackMultiSoundPanelProps = {
  open: boolean;
  onToggleOpen: () => void;
  soundEnabled: boolean;
  dealerVoiceEnabled: boolean;
  sfxEnabled: boolean;
  isMusicPlaying: boolean;
  musicVolume: number;
  currentTrackName: string;
  onToggleSoundEnabled: () => void;
  onToggleDealerVoiceEnabled: () => void;
  onToggleSfxEnabled: () => void;
  onToggleMusic: () => void;
  onNextTrack: () => void;
  onMusicVolumeChange: (value: number) => void;
  /** Solo table voice commands tutorial (opens in new tab) — not the same as dealer voice lines */
  voiceTutorialVideoUrl?: string;
};

export function BlackjackMultiSoundPanel({
  open,
  onToggleOpen,
  soundEnabled,
  dealerVoiceEnabled,
  sfxEnabled,
  isMusicPlaying,
  musicVolume,
  currentTrackName,
  onToggleSoundEnabled,
  onToggleDealerVoiceEnabled,
  onToggleSfxEnabled,
  onToggleMusic,
  onNextTrack,
  onMusicVolumeChange,
  voiceTutorialVideoUrl,
}: BlackjackMultiSoundPanelProps) {
  return (
    <div className="absolute left-2 top-10 z-20">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-black/60 border border-white/15 text-white/70 hover:text-white hover:bg-black/75 transition-colors text-xs backdrop-blur-sm"
        title="Sound settings"
      >
        {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-red-400" />}
        <Settings2 className="w-3 h-3" />
      </button>
      {open && (
        <div
          className="mt-1 bg-black/90 border border-white/15 rounded-lg p-3 backdrop-blur-md w-[220px] space-y-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-[11px] text-white/70 font-medium uppercase tracking-wide">Master</span>
            <button
              type="button"
              onClick={onToggleSoundEnabled}
              className={`w-8 h-4.5 rounded-full relative transition-colors ${soundEnabled ? 'bg-cyan-600' : 'bg-white/15'}`}
            >
              <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
            </button>
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[11px] text-white/60 flex items-center gap-1.5">
              {dealerVoiceEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3 text-red-400" />}
              Dealer Voice
            </span>
            <button
              type="button"
              onClick={onToggleDealerVoiceEnabled}
              className={`w-8 h-4.5 rounded-full relative transition-colors ${dealerVoiceEnabled && soundEnabled ? 'bg-cyan-600' : 'bg-white/15'}`}
              disabled={!soundEnabled}
            >
              <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${dealerVoiceEnabled && soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
            </button>
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[11px] text-white/60 flex items-center gap-1.5">
              <Volume2 className="w-3 h-3" />
              Sound Effects
            </span>
            <button
              type="button"
              onClick={onToggleSfxEnabled}
              className={`w-8 h-4.5 rounded-full relative transition-colors ${sfxEnabled && soundEnabled ? 'bg-cyan-600' : 'bg-white/15'}`}
              disabled={!soundEnabled}
            >
              <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${sfxEnabled && soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
            </button>
          </label>

          <div className="border-t border-white/10" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/70 font-medium uppercase tracking-wide flex items-center gap-1.5">
                <Music className="w-3 h-3" />
                Music
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleMusic}
                  className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title={isMusicPlaying ? 'Pause' : 'Play'}
                >
                  {isMusicPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={onNextTrack}
                  className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Next track"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="text-[10px] text-white/40 truncate">
              {currentTrackName}
            </div>
            <div className="flex items-center gap-2">
              <VolumeX className="w-3 h-3 text-white/30 shrink-0" />
              <input
                type="range"
                min={0}
                max={100}
                value={musicVolume}
                onChange={(e) => onMusicVolumeChange(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none bg-white/15 accent-cyan-500 cursor-pointer"
                style={{ accentColor: '#06b6d4' }}
              />
              <Volume2 className="w-3 h-3 text-white/30 shrink-0" />
            </div>
          </div>

          {voiceTutorialVideoUrl ? (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <p className="text-[9px] text-white/40 leading-snug">
                Solo Blackjack: speak commands (hit, stand, bet…)
              </p>
              <a
                href={voiceTutorialVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[10px] font-medium text-cyan-400/90 underline underline-offset-2 hover:text-cyan-300"
              >
                How it works
              </a>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

