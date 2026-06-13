/**
 * roulette2-audio.ts — procedural sounds for /roulette2 (Web Audio, no files).
 * Ball ticks while the wheel spins (cadence slows with the ball), a soft
 * chip-place click, a landing thud, and a win chime.
 */

class RouletteAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

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

  playChip() {
    this.tone(2200, 'triangle', 0.06, 0.25);
    this.tone(1500, 'sine', 0.08, 0.15);
  }

  playSpinStart() {
    this.tone(220, 'sawtooth', 0.5, 0.12, 880);
  }

  /** Ball ticks for `durationMs`, slowing from fast to sparse. */
  startTicks(durationMs: number) {
    this.stopTicks();
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / durationMs;
      if (t >= 1) return;
      this.tone(3200 - t * 1200, 'square', 0.025, 0.07);
      const interval = 40 + t * t * 420; // accelerating gaps as the ball slows
      this.tickTimer = setTimeout(tick, interval);
    };
    tick();
  }

  stopTicks() {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  playLand() {
    this.stopTicks();
    this.tone(180, 'sine', 0.25, 0.4, 70);
    this.tone(900, 'square', 0.05, 0.12);
  }

  playWin() {
    this.tone(1046.5, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.35), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.4), 220);
  }
}

export const roulette2Audio = new RouletteAudio();
