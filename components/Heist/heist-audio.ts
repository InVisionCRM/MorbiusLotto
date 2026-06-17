/**
 * heist-audio.ts — procedural sounds for /heist (Web Audio, no files).
 *
 * Mirrors the approved lab (public/heist-lab.html): a short "crack" when a door
 * is opened, a brighter two-note "loot" when it's safe, a strobing alarm on a
 * bust, and a rising chime on escape / full clear. Same synth conventions as
 * towers-audio.ts.
 */

class HeistAudio {
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

  /** Safe door — a dial "crack" then a bright two-note "loot" climbing the room. */
  playSafe(room: number) {
    this.tone(520, 'square', 0.09, 0.18);
    const base = 700 + Math.min(8, Math.max(1, room)) * 40;
    setTimeout(() => this.tone(base, 'sine', 0.1, 0.28), 90);
    setTimeout(() => this.tone(base * 1.35, 'sine', 0.14, 0.18), 170);
  }

  /** Alarm — strobing two-tone klaxon plus a low boom. */
  playBust() {
    this.tone(880, 'square', 0.12, 0.3);
    setTimeout(() => this.tone(660, 'sawtooth', 0.3, 0.34, 200), 120);
    setTimeout(() => this.tone(150, 'sine', 0.35, 0.4, 60), 130);
  }

  /** Escape / full-clear chime — ascending major triad. */
  playWin() {
    this.tone(1046.5, 'sine', 0.12, 0.35);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.35), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.4), 220);
  }
}

export const heistAudio = new HeistAudio();
