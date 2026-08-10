/**
 * video-poker-audio.ts — procedural sounds for /video-poker (Web Audio, no
 * files). Staggered deal riffle, per-card draw-flip whoosh, hold click, win
 * chime, and bust thud. Same synth conventions as the other arcade audio modules.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class VideoPokerAudio {
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

  /** Five staggered card-deal swooshes that build in pitch as the hand fans out. */
  playDeal() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.tone(700 + i * 100, 'sine', 0.11, 0.14, 1500 + i * 90);
        setTimeout(() => this.tone(2100 + i * 55, 'triangle', 0.03, 0.07), 55);
      }, i * 75);
    }
  }

  /** Soft click when a card is toggled to HOLD. */
  playHold() {
    this.tone(2400, 'triangle', 0.04, 0.18);
    this.tone(1600, 'sine', 0.06, 0.1);
  }

  /** Draw snap — fires once before the per-card flip sounds kick in. */
  playDraw() {
    this.tone(2800, 'square', 0.025, 0.07);
    setTimeout(() => this.tone(950, 'sine', 0.08, 0.1, 540), 50);
  }

  /**
   * Per-card flip whoosh for the draw phase — call once per replaced card,
   * passing the stagger delay so callers control timing.
   */
  playCardFlip(delayMs = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    setTimeout(() => {
      if (!this.ctx || !this.master || this.muted) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      // Upward frequency sweep (the "whoosh")
      const sweep = this.ctx.createOscillator();
      const sweepGain = this.ctx.createGain();
      sweep.type = 'sine';
      sweep.frequency.setValueAtTime(420, this.ctx.currentTime);
      sweep.frequency.exponentialRampToValueAtTime(1900, this.ctx.currentTime + 0.14);
      sweepGain.gain.setValueAtTime(0.16, this.ctx.currentTime);
      sweepGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.22);
      sweep.connect(sweepGain);
      sweepGain.connect(this.master);
      sweep.start();
      sweep.stop(this.ctx.currentTime + 0.22);

      // Sharp felt-impact thwack at card-land
      const click = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(820, this.ctx.currentTime + 0.11);
      clickGain.gain.setValueAtTime(0, this.ctx.currentTime);
      clickGain.gain.setValueAtTime(0.13, this.ctx.currentTime + 0.11);
      clickGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
      click.connect(clickGain);
      clickGain.connect(this.master);
      click.start();
      click.stop(this.ctx.currentTime + 0.22);
    }, delayMs);
  }

  /** Paying hand — ascending major triad with a richer shimmer. */
  playWin() {
    // Recorded sting first; the tones below are the fallback for when it
    // has not loaded yet. See lib/win-audio.ts.
    if (playWinSting('small', { muted: this.muted })) return;
    this.tone(1046.5, 'sine', 0.14, 0.38);
    setTimeout(() => this.tone(1318.51, 'sine', 0.14, 0.38), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.38, 0.44), 220);
    setTimeout(() => this.tone(2093, 'triangle', 0.18, 0.2), 360);
  }

  /** No win — low felt thud. */
  playLose() {
    this.tone(190, 'sine', 0.22, 0.32, 80);
    this.tone(120, 'triangle', 0.3, 0.16, 60);
  }
}

export const videoPokerAudio = new VideoPokerAudio();
