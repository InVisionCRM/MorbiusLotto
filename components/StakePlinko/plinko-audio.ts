/**
 * plinko-audio.ts — procedural sounds for /plinko2 (Web Audio, no files).
 * A short release blip when a ball drops, a soft tick for each peg bounce,
 * and a bright pop when the ball settles into a bucket (rising triad on a
 * win, duller thud when it loses). Same synth conventions as towers-audio.ts
 * and roulette2-audio.ts.
 */

class PlinkoAudio {
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

  /** Release blip — a ball leaves the chute, pitch dips as it falls. */
  playDrop() {
    this.tone(880, 'triangle', 0.08, 0.22, 440);
  }

  /** Soft peg tick — kept low so rapid bounces don't get harsh. */
  playPeg() {
    this.tone(2600, 'square', 0.02, 0.05);
  }

  /** Landing pop — rising triad-ish when the ball profits, duller when not. */
  playLand(win: boolean) {
    if (win) {
      this.tone(1046.5, 'triangle', 0.1, 0.3);
      this.tone(1567.98, 'sine', 0.16, 0.2);
    } else {
      this.tone(300, 'sine', 0.16, 0.28, 150);
      this.tone(600, 'square', 0.04, 0.1);
    }
  }
}

export const plinkoAudio = new PlinkoAudio();
