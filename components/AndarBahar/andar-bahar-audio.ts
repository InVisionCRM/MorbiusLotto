/**
 * andar-bahar-audio.ts — procedural sounds for /andar-bahar (Web Audio, no files).
 * A soft tick as each card is dealt, a bright ping on the joker cut + match, a
 * rising major triad on a win, and a low felt thud on a loss. Same synth
 * conventions as dicex2-audio.ts; tones mirror the prototype's sDeal/sWin/sLose/sMatch.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class AndarBaharAudio {
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

  /** Card-deal tick — a short soft triangle. */
  playDeal() {
    this.tone(360, 'triangle', 0.05, 0.18);
  }

  /** Joker cut / match ping — a bright sine. */
  playMatch() {
    this.tone(880, 'sine', 0.14, 0.3);
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
    this.tone(160, 'sawtooth', 0.3, 0.4, 60);
  }
}

export const andarBaharAudio = new AndarBaharAudio();
