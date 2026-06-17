/**
 * cipher-audio.ts — tiny WebAudio blips for /cipher, mirroring chicken-audio's
 * shape (init / setMute / play*). Lazily creates the AudioContext on the first
 * user gesture so autoplay policies are respected, and no-ops on the server.
 *
 * Sounds map to the prototype's cues: place a peg, deal a code, exact-peg blip
 * (pitch climbs with the count), a banked-cash chime, a triumphant crack arp,
 * and a low bust thud.
 */

class CipherAudio {
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

  /** A soft tick when a peg is placed in the build row. */
  playPlace(): void {
    this.tone(440, 0.06, 'triangle', 0.04);
  }

  /** A short pluck on dealing a fresh code. */
  playDeal(): void {
    this.tone(330, 0.1, 'sine', 0.05);
  }

  /** A blip on a submitted guess — pitch climbs with the exact-peg count. */
  playExact(n: number): void {
    this.tone(520 + n * 120, 0.12, 'sine', 0.05);
  }

  /** A two-note chime on banking the secured value. */
  playCash(): void {
    this.tone(660, 0.12, 'sine', 0.06);
    window.setTimeout(() => this.tone(880, 0.16, 'sine', 0.06), 90);
  }

  /** A rising three-note arpeggio on a full crack. */
  playCrack(): void {
    [660, 880, 1175].forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.14, 'sine', 0.06), i * 90);
    });
  }

  /** A low thud when the round busts. */
  playBust(): void {
    this.tone(150, 0.3, 'sawtooth', 0.07);
  }
}

export const cipherAudio = new CipherAudio();
