/**
 * baccarat-audio.ts — procedural sounds for /baccarat (Web Audio, no files).
 * Modeled on roulette2-audio.ts: a card-slide tick as each card leaves the
 * shoe, a flip snap on reveal, a win chime, a tie shimmer, a soft chip click
 * for bet controls, and a low thud on a losing hand.
 */

class BaccaratAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;

  init() {
    if (this.ctx || typeof window === 'undefined') return;
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

  /** Soft click for bet-zone / amount controls. */
  playChip() {
    this.tone(2200, 'triangle', 0.06, 0.22);
    this.tone(1500, 'sine', 0.08, 0.12);
  }

  /** Card leaving the shoe — airy descending tick. */
  playSlide() {
    this.tone(2600, 'square', 0.03, 0.07);
    this.tone(900, 'sine', 0.09, 0.1, 420);
  }

  /** Card flip reveal — short snap. */
  playFlip() {
    this.tone(3100, 'square', 0.025, 0.09);
    this.tone(420, 'triangle', 0.07, 0.18, 180);
  }

  /** One dealt card: slide now, snap when the flip lands (~230ms later). */
  playDealCard() {
    this.playSlide();
    setTimeout(() => this.playFlip(), 230);
  }

  /** Net-win chime — rising major triad. */
  playWin() {
    this.tone(1046.5, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.35), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.4), 220);
  }

  /** Tie shimmer — two soft glides crossing. */
  playTie() {
    this.tone(880, 'sine', 0.4, 0.2, 1320);
    setTimeout(() => this.tone(1320, 'sine', 0.45, 0.16, 990), 140);
  }

  /** Losing hand — low felt thud. */
  playLose() {
    this.tone(190, 'sine', 0.22, 0.32, 80);
    this.tone(120, 'triangle', 0.3, 0.18, 60);
  }
}

export const baccaratAudio = new BaccaratAudio();
