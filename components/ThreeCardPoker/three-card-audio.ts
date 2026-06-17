/**
 * three-card-audio.ts — procedural sounds for /three-card-poker (Web Audio, no
 * files). A soft tick as each card deals, a flip on the dealer reveal, a rising
 * major triad on a win, a felt thud on a loss, and a neutral tone on a push.
 * Same synth conventions as dicex2-audio.ts.
 */

class ThreeCardAudio {
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

  /** Card deal tick. */
  playDeal() {
    this.tone(330, 'triangle', 0.06, 0.16);
  }

  /** Dealer card flip. */
  playFlip() {
    this.tone(420, 'sine', 0.07, 0.18);
  }

  /** Win chime — ascending major triad. */
  playWin() {
    this.tone(1046.5, 'sine', 0.12, 0.32);
    setTimeout(() => this.tone(1318.51, 'sine', 0.12, 0.32), 110);
    setTimeout(() => this.tone(1567.98, 'sine', 0.35, 0.38), 220);
  }

  /** Loss thud — low felt boom. */
  playLose() {
    this.tone(150, 'sine', 0.32, 0.4, 60);
    this.tone(420, 'sawtooth', 0.06, 0.1, 180);
  }

  /** Push tone — neutral. */
  playPush() {
    this.tone(360, 'sine', 0.14, 0.22);
  }
}

export const threeCardAudio = new ThreeCardAudio();
