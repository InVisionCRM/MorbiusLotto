/**
 * hilo-audio.ts — procedural sounds for /hilo (Web Audio, no files).
 * A paper-snap card flip, a rising blip per correct pick, a triumphant
 * cash-out chime, and a low bust thud. Modeled on roulette2-audio.ts.
 */

class HiLoAudio {
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

  /** Card leaving the deck — short paper snap. */
  playFlip() {
    this.tone(2600, 'triangle', 0.05, 0.18);
    this.tone(900, 'square', 0.04, 0.08, 600);
  }

  /** Correct pick — a bright blip that confirms the multiplier bump. */
  playSafe() {
    this.tone(880, 'sine', 0.09, 0.3);
    setTimeout(() => this.tone(1318.51, 'sine', 0.14, 0.28), 70);
  }

  /** Cash out — ascending three-note chime. */
  playCashout() {
    this.tone(1046.5, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.35), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.4), 220);
  }

  /** Wrong pick — a low thud as the round busts. */
  playBust() {
    this.tone(170, 'sine', 0.3, 0.45, 60);
    this.tone(110, 'square', 0.16, 0.14);
  }
}

export const hiloAudio = new HiLoAudio();
