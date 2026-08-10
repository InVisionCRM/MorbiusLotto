/**
 * pachinko-audio.ts — procedural sounds for /pachinko (Web Audio, no files).
 * A soft pin tick each time the ball clears a row, a rising major triad on a
 * win, a celebratory arpeggio on the jackpot gate, and a low felt thud on a
 * loss. Same synth conventions as dicex2-audio.ts.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class PachinkoAudio {
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

  /** Pin tick — a short bright blip as the ball clears a peg row. */
  playPin() {
    this.tone(560 + Math.random() * 200, 'triangle', 0.04, 0.08);
  }

  /** Win chime — ascending major triad. */
  playWin() {
    // Recorded sting first; the tones below are the fallback for when it
    // has not loaded yet. See lib/win-audio.ts.
    if (playWinSting('small', { muted: this.muted })) return;
    this.tone(1046.5, 'sine', 0.12, 0.32);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.32), 100);
    setTimeout(() => this.tone(1567.98, 'sine', 0.3, 0.36), 200);
  }

  /** Jackpot fanfare — a quick five-note arpeggio. */
  playJackpot() {
    // Recorded sting first; the tones below are the fallback for when it
    // has not loaded yet. See lib/win-audio.ts.
    if (playWinSting('huge', { muted: this.muted })) return;
    [659.25, 880, 1174.66, 1318.51, 1567.98].forEach((f, i) => {
      setTimeout(() => this.tone(f, 'sine', 0.16, 0.34), i * 80);
    });
  }

  /** Loss thud — low felt boom. */
  playLose() {
    this.tone(150, 'sine', 0.3, 0.36, 60);
    this.tone(420, 'sawtooth', 0.06, 0.1, 180);
  }
}

export const pachinkoAudio = new PachinkoAudio();
