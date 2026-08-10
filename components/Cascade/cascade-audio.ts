/**
 * cascade-audio.ts — procedural sounds for /cascade (Web Audio, no files).
 * A soft drop when the grid ignites, a rising pop per chain link (pitch climbs
 * with the combo), a major-triad chime on a win, and a low felt thud on a
 * fizzle. Same synth conventions as dicex2-audio.ts. Mirrors the prototype's
 * sDrop / sPop / sWin / sNo tones.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class CascadeAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;

  init() {
    if (this.ctx || typeof window === 'undefined') return;
    preloadWinSounds();
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    } catch {
      /* unsupported */
    }
  }

  setMute(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.3, this.ctx.currentTime, 0.05);
    }
  }

  private tone(freq: number, type: OscillatorType, duration: number, vol = 0.3, slide?: number) {
    if (!this.ctx || !this.master || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  /** Grid ignites — a low soft drop. */
  playDrop() {
    this.tone(220, 'sine', 0.14, 0.18);
  }

  /** Cluster pop — pitch rises with the chain index (clamped). */
  playPop(chainIndex: number) {
    this.tone(420 + Math.min(chainIndex, 7) * 90, 'triangle', 0.1, 0.16);
  }

  /** Win chime — ascending fifth. */
  playWin() {
    // Recorded sting first; the tones below are the fallback for when it
    // has not loaded yet. See lib/win-audio.ts.
    if (playWinSting('small', { muted: this.muted })) return;
    this.tone(660, 'sine', 0.12, 0.32);
    setTimeout(() => this.tone(990, 'sine', 0.16, 0.34), 100);
  }

  /** Fizzle — low felt boom (no cluster ignited). */
  playNoWin() {
    this.tone(180, 'sawtooth', 0.22, 0.3);
  }
}

export const cascadeAudio = new CascadeAudio();
