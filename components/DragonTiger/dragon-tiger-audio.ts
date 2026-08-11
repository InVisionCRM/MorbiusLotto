/**
 * dragon-tiger-audio.ts — procedural sounds for /dragon-tiger (Web Audio, no
 * files). A soft card snap as each card flips, a rising chime on a win, a low
 * thud on a loss, and a neutral tap on a push (tie give-back). Same synth
 * conventions as dicex2-audio.ts; mirrors the lab's tone() helper.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class DragonTigerAudio {
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

  /** Card snap — a short, dry triangle blip as a card flips face-up. */
  playDeal() {
    this.tone(330, 'triangle', 0.07, 0.18);
  }

  /** Win chime — ascending two-note. */
  playWin() {
    // Recorded sting first; the tones below are the fallback for when it
    // has not loaded yet. See lib/win-audio.ts.
    if (playWinSting('small', { muted: this.muted })) return;
    this.tone(660, 'sine', 0.12, 0.3);
    setTimeout(() => this.tone(990, 'sine', 0.18, 0.34), 100);
  }

  /** Loss thud — low felt boom. */
  playLose() {
    this.tone(160, 'sawtooth', 0.3, 0.32, 70);
  }

  /** Push tap — a neutral mid tone (tie give-back / ±0). */
  playPush() {
    this.tone(360, 'sine', 0.16, 0.22);
  }
}

export const dragonTigerAudio = new DragonTigerAudio();
