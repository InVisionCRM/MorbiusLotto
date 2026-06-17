/**
 * firewalk-audio.ts — tiny WebAudio blips for /firewalk, mirroring chicken-audio's
 * shape (init / setMute / playHop / playSafe / playBurn / playWin). Lazily
 * creates the AudioContext on the first user gesture so autoplay policies are
 * respected, and no-ops on the server. Tones match the lab (sHop / sCash / sBurn).
 */

class FirewalkAudio {
  private ctx: AudioContext | null = null;
  private muted = false;

  init(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMute(m: boolean): void {
    this.muted = m;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number): void {
    if (this.muted || !this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.ctx.destination);
      const t = this.ctx.currentTime;
      o.start(t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.stop(t + dur);
    } catch {
      /* audio is best-effort */
    }
  }

  /** A soft hop tick onto a stone. */
  playHop(): void {
    this.tone(520, 0.08, 'triangle', 0.05);
  }

  /** A rising blip on a safe stone — pitch climbs a little with each stone. */
  playSafe(stone: number): void {
    this.tone(440 + Math.min(stone, 16) * 28, 0.1, 'sine', 0.05);
  }

  /** A low burn thud when a stone crumbles. */
  playBurn(): void {
    this.tone(140, 0.34, 'sawtooth', 0.08);
  }

  /** A two-note chime on cash-out / full crossing. */
  playWin(): void {
    this.tone(660, 0.12, 'sine', 0.06);
    window.setTimeout(() => this.tone(900, 0.16, 'sine', 0.06), 90);
  }
}

export const firewalkAudio = new FirewalkAudio();
