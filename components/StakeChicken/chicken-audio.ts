/**
 * chicken-audio.ts — tiny WebAudio blips for /chicken, mirroring towers-audio's
 * shape (init / setMute / playTick / playSafe / playBust / playWin). Lazily
 * creates the AudioContext on the first user gesture so autoplay policies are
 * respected, and no-ops on the server.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class ChickenAudio {
  private ctx: AudioContext | null = null;
  private muted = false;

  init(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    preloadWinSounds();
  }

  setMute(m: boolean): void {
    this.muted = m;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number): void {
    if (this.muted || !this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.ctx.destination);
      const t = this.ctx.currentTime;
      o.start(t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.stop(t + dur);
    } catch {
      /* audio is best-effort */
    }
  }

  /** A soft hop tick when a step is taken. */
  playTick(): void {
    this.tone(520, 0.09, 'triangle', 0.05);
  }

  /** A rising blip on a safe lane — pitch climbs a little with each lane. */
  playSafe(lane: number): void {
    this.tone(440 + Math.min(lane, 16) * 28, 0.1, 'sine', 0.05);
  }

  /** A low thud on a bumper. */
  playBust(): void {
    this.tone(150, 0.3, 'sawtooth', 0.07);
  }

  /** A two-note chime on cash-out / full crossing. */
  playWin(): void {
    // Recorded sting first; the tones below are the fallback for when it
    // has not loaded yet. See lib/win-audio.ts.
    if (playWinSting('small', { muted: this.muted })) return;
    this.tone(660, 0.12, 'sine', 0.06);
    window.setTimeout(() => this.tone(880, 0.16, 'sine', 0.06), 90);
  }
}

export const chickenAudio = new ChickenAudio();
