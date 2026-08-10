/**
 * dicex2-audio.ts — procedural sounds for /dicex2 (Web Audio, no files).
 * A quick tumbling whoosh when the roll fires, a rising major triad on a win,
 * and a low felt thud on a loss. Same synth conventions as dice-audio.ts.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class DiceX2Audio {
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

  /** Roll whoosh — a couple of short descending tones tumbling down. */
  playRoll() {
    this.tone(900, 'square', 0.06, 0.12, 380);
    setTimeout(() => this.tone(640, 'triangle', 0.07, 0.1, 240), 55);
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

  /** Loss thud — low felt boom. */
  playLose() {
    this.tone(150, 'sine', 0.32, 0.4, 60);
    this.tone(420, 'sawtooth', 0.06, 0.1, 180);
  }
}

export const dicex2Audio = new DiceX2Audio();
