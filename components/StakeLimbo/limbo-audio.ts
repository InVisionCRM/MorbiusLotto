/**
 * limbo-audio.ts — procedural sounds for /limbo2 (Web Audio, no files).
 * A rising whoosh as the round launches (the climb), an ascending major
 * triad on a win, and a low thud when the multiplier busts short.
 * Same synth conventions as towers-audio.ts / roulette2-audio.ts.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class LimboAudio {
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

  /** Launch whoosh — a tone sliding upward, evoking the climb. */
  playLaunch() {
    this.tone(220, 'sawtooth', 0.28, 0.16, 1320);
    this.tone(440, 'sine', 0.24, 0.1, 1760);
  }

  /** Win chime — ascending major triad. */
  playWin() {
    // Recorded sting first; the tones below are the fallback for when it
    // has not loaded yet. See lib/win-audio.ts.
    if (playWinSting('small', { muted: this.muted })) return;
    this.tone(1046.5, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.35), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.4), 220);
  }

  /** Bust thud — a low boom when the multiplier falls short. */
  playLose() {
    this.tone(150, 'sine', 0.4, 0.45, 48);
    this.tone(300, 'sawtooth', 0.08, 0.12, 90);
  }
}

export const limboAudio = new LimboAudio();
