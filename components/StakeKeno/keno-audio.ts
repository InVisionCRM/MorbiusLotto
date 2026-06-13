/**
 * keno-audio.ts — procedural sounds for /keno (Web Audio, no files).
 * A soft tick when a spot is picked, a bright blip as each number is drawn,
 * a rising triad on a win, and a low soft thud on a loss.
 * Same synth conventions as towers-audio.ts / roulette2-audio.ts.
 */

class KenoAudio {
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

  /** Soft UI tick — a spot was selected. */
  playPick() {
    this.tone(2400, 'square', 0.03, 0.08);
  }

  /** Bright blip — fired per drawn number as the board reveals. */
  playDraw() {
    this.tone(1320, 'triangle', 0.06, 0.22);
    this.tone(1980, 'sine', 0.05, 0.12);
  }

  /** Win chime — ascending major triad. */
  playWin() {
    this.tone(1046.5, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.35), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.4), 220);
  }

  /** Loss thud — low, soft boom. */
  playLose() {
    this.tone(180, 'sine', 0.32, 0.32, 70);
  }
}

export const kenoAudio = new KenoAudio();
