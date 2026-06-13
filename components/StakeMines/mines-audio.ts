/**
 * mines-audio.ts — procedural sounds for /mines2 (Web Audio, no files).
 * A soft tick when a pick is sent, a bright pop on a safe gem (pitch rises
 * with the number of gems found), a low thud when a mine goes off, and a
 * rising chime on cash-out. Same synth conventions as towers-audio.ts.
 */

class MinesAudio {
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

  /** Soft UI tick — a pick is on its way to the server. */
  playTick() {
    this.tone(2400, 'square', 0.03, 0.08);
  }

  /** Safe gem pop — pitch climbs with the gem count so the run is audible. */
  playSafe(picks = 1) {
    const base = 740 + Math.min(12, Math.max(1, picks)) * 55;
    this.tone(base, 'triangle', 0.1, 0.3);
    this.tone(base * 1.5, 'sine', 0.14, 0.18);
  }

  /** Mine thud — low boom plus a short crack. */
  playBust() {
    this.tone(160, 'sine', 0.4, 0.45, 50);
    this.tone(820, 'sawtooth', 0.08, 0.14, 240);
  }

  /** Cash-out chime — ascending major triad. */
  playWin() {
    this.tone(1046.5, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.35), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.4), 220);
  }

  /** Alias for playWin — banked the round. */
  playCashout() {
    this.playWin();
  }
}

export const minesAudio = new MinesAudio();
