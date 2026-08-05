/**
 * table-audio.ts — procedural sound for the house-banked table games.
 *
 * Web Audio, no asset files, same synth conventions as three-card-audio.ts and
 * dicex2-audio.ts. One engine shared by Ultimate Hold'em, Caribbean Stud, the
 * five blackjack variants and the craps tables, so a felt sounds like the rest
 * of the floor instead of like whoever wrote it.
 *
 * Two things worth knowing:
 *
 *   * Mute is remembered across games and reloads. A player who silenced a
 *     blackjack table does not want the next felt to start talking again, so
 *     the preference lives in localStorage under one key rather than per game.
 *   * Browsers refuse to start audio before a gesture. init() is safe to call
 *     as often as you like and does nothing until a real click has happened,
 *     so games call it from their first user action rather than on mount.
 */

const MUTE_KEY = 'morb_table_audio_muted';

class TableAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private mutedValue = false;
  private loaded = false;

  /** Master level. Deliberately low — a felt should sit under the room. */
  private static readonly LEVEL = 0.28;

  private loadPreference(): void {
    if (this.loaded || typeof window === 'undefined') return;
    this.loaded = true;
    try {
      this.mutedValue = window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* private mode — default to audible */
    }
  }

  get muted(): boolean {
    this.loadPreference();
    return this.mutedValue;
  }

  init(): void {
    this.loadPreference();
    if (this.ctx || typeof window === 'undefined') return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.mutedValue ? 0 : TableAudio.LEVEL;
      this.master.connect(this.ctx.destination);
    } catch {
      /* unsupported — every play() below becomes a no-op */
    }
  }

  setMute(muted: boolean): void {
    this.loadPreference();
    this.mutedValue = muted;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* preference just won't survive the reload */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : TableAudio.LEVEL, this.ctx.currentTime, 0.05);
    }
  }

  /** Flip and return the new state, so a toggle button can use it directly. */
  toggleMute(): boolean {
    const next = !this.muted;
    this.setMute(next);
    return next;
  }

  private tone(
    freq: number,
    type: OscillatorType,
    duration: number,
    vol = 0.3,
    slide?: number,
    delayMs = 0,
  ): void {
    if (!this.ctx || !this.master || this.mutedValue) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const start = this.ctx.currentTime + delayMs / 1000;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, start + duration);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration);
  }

  /** Short filtered noise burst — used for anything physical (chips, dice). */
  private noise(duration: number, vol: number, freq: number, q = 1, delayMs = 0): void {
    if (!this.ctx || !this.master || this.mutedValue) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const start = this.ctx.currentTime + delayMs / 1000;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + duration);

    src.connect(band);
    band.connect(gain);
    gain.connect(this.master);
    src.start(start);
    src.stop(start + duration);
  }

  // ── Cards ────────────────────────────────────────────────────────────────

  /** A card sliding onto the felt. */
  playDeal(): void {
    this.noise(0.055, 0.16, 2100, 0.8);
    this.tone(330, 'triangle', 0.05, 0.1);
  }

  /** A hidden card turning over. Brighter than a deal so a reveal reads. */
  playFlip(): void {
    this.noise(0.07, 0.2, 1500, 0.7);
    this.tone(520, 'sine', 0.08, 0.16, 700);
  }

  /** Chips going down. */
  playChip(): void {
    this.noise(0.045, 0.22, 3600, 2.5);
    this.noise(0.06, 0.12, 2400, 2, 25);
  }

  /** A button that commits money — raise, call, double. */
  playCommit(): void {
    this.tone(300, 'triangle', 0.08, 0.2, 460);
    this.noise(0.05, 0.16, 3000, 2, 30);
  }

  // ── Settlement ───────────────────────────────────────────────────────────

  /** Ascending major triad. */
  playWin(): void {
    this.tone(1046.5, 'sine', 0.12, 0.3);
    this.tone(1318.51, 'sine', 0.12, 0.3, undefined, 110);
    this.tone(1567.98, 'sine', 0.34, 0.34, undefined, 220);
  }

  /** A bigger win — the triad plus an octave above. */
  playBigWin(): void {
    this.playWin();
    this.tone(2093, 'sine', 0.45, 0.26, undefined, 330);
    this.tone(1567.98, 'triangle', 0.5, 0.14, undefined, 330);
  }

  /** A side bet or bonus landing — distinct from the main win. */
  playBonus(): void {
    this.tone(880, 'triangle', 0.09, 0.24);
    this.tone(1174.66, 'triangle', 0.09, 0.24, undefined, 80);
    this.tone(1760, 'sine', 0.22, 0.24, undefined, 160);
  }

  /** Low felt thud. */
  playLose(): void {
    this.tone(150, 'sine', 0.3, 0.36, 60);
    this.tone(420, 'sawtooth', 0.05, 0.08, 180);
  }

  /** Neutral — stake returned, nothing gained. */
  playPush(): void {
    this.tone(360, 'sine', 0.14, 0.2);
  }

  /** Going bust. Falls rather than thuds. */
  playBust(): void {
    this.tone(300, 'sawtooth', 0.28, 0.24, 90);
    this.noise(0.12, 0.14, 700, 1);
  }

  // ── Dice ─────────────────────────────────────────────────────────────────

  /** Dice tumbling down the felt — a scatter of knocks, then the settle. */
  playDiceRoll(): void {
    const knocks = 5;
    for (let i = 0; i < knocks; i++) {
      this.noise(0.04, 0.2 - i * 0.02, 900 + Math.random() * 900, 3, i * 55);
    }
    this.noise(0.09, 0.2, 620, 1.5, knocks * 55);
  }

  /** The point is made — the rail's good news. */
  playPointMade(): void {
    this.tone(659.25, 'sine', 0.12, 0.3);
    this.tone(880, 'sine', 0.28, 0.32, undefined, 110);
  }

  /** Seven out. The dice pass and most of the table just lost. */
  playSevenOut(): void {
    this.tone(220, 'sawtooth', 0.4, 0.3, 82);
    this.tone(146.83, 'sine', 0.5, 0.26, undefined, 60);
  }

  /** The dice reaching a new shooter. */
  playDicePass(): void {
    this.tone(392, 'triangle', 0.1, 0.18, 523.25);
  }
}

export const tableAudio = new TableAudio();
