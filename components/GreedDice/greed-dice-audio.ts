/**
 * greed-dice-audio.ts — tiny WebAudio blips for /greed-dice, faithful to the
 * lab's tone set (roll / score / bank / hot / bust). Lazily creates the
 * AudioContext on the first user gesture so autoplay policies are respected, and
 * no-ops on the server.
 */

class GreedDiceAudio {
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

  /** Dice clatter as a roll lands. */
  playRoll(): void {
    this.tone(260, 0.12, 'square', 0.04);
  }

  /** A blip when a roll scores — pitch climbs a touch with the points. */
  playScore(points: number): void {
    this.tone(440 + Math.min(points, 800) / 4, 0.12, 'triangle', 0.05);
  }

  /** Two-note chime on bank / cash-out. */
  playBank(): void {
    this.tone(660, 0.12, 'sine', 0.06);
    window.setTimeout(() => this.tone(990, 0.16, 'sine', 0.06), 100);
  }

  /** A rising four-note arpeggio on hot dice. */
  playHot(): void {
    [660, 880, 1175, 1320].forEach((f, i) =>
      window.setTimeout(() => this.tone(f, 0.1, 'sine', 0.05), i * 70),
    );
  }

  /** A low growl on a farkle. */
  playBust(): void {
    this.tone(150, 0.32, 'sawtooth', 0.07);
  }
}

export const greedDiceAudio = new GreedDiceAudio();
