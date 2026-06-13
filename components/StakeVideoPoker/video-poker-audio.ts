/**
 * video-poker-audio.ts — procedural sounds for /video-poker (Web Audio, no
 * files). A quick riffle on the deal, a soft click when a card is held, a snap
 * on the draw, a rising chime on a paying hand and a low thud on a bust. Same
 * synth conventions as roulette2-audio.ts / towers-audio.ts.
 */

class VideoPokerAudio {
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

  /** Card riffle — five quick ticks climbing in pitch as the hand fans out. */
  playDeal() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.tone(1500 + i * 180, 'square', 0.03, 0.08), i * 70);
    }
  }

  /** Soft click when a card is toggled to HOLD. */
  playHold() {
    this.tone(2200, 'triangle', 0.05, 0.2);
    this.tone(1500, 'sine', 0.07, 0.12);
  }

  /** Draw snap — the discards flip to their replacements. */
  playDraw() {
    this.tone(2600, 'square', 0.03, 0.09);
    setTimeout(() => this.tone(900, 'sine', 0.09, 0.12, 520), 60);
  }

  /** Paying hand — ascending major triad. */
  playWin() {
    this.tone(1046.5, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.35), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.4), 220);
  }

  /** No win — low felt thud. */
  playLose() {
    this.tone(190, 'sine', 0.22, 0.32, 80);
    this.tone(120, 'triangle', 0.3, 0.16, 60);
  }
}

export const videoPokerAudio = new VideoPokerAudio();
