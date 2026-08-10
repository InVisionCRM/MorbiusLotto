/**
 * table-audio.ts — procedural sound for the house-banked table games.
 *
 * Web Audio, same synth conventions as three-card-audio.ts and dicex2-audio.ts.
 * One engine shared by Ultimate Hold'em, Caribbean Stud, the five blackjack
 * variants and the craps tables, so a felt sounds like the rest of the floor
 * instead of like whoever wrote it.
 *
 * Three things worth knowing:
 *
 *   * Mute is remembered across games and reloads. A player who silenced a
 *     blackjack table does not want the next felt to start talking again, so
 *     the preference lives in localStorage under one key rather than per game.
 *   * Browsers refuse to start audio before a gesture. init() is safe to call
 *     as often as you like and does nothing until a real click has happened,
 *     so games call it from their first user action rather than on mount.
 *   * The WIN sounds are no longer synthesised. They come from real recordings
 *     via win-audio.ts, and the oscillator versions below now exist as the
 *     fallback for when a sample has not arrived yet. Everything else here is
 *     still generated — a card slide or a chip has no download to wait on.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

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
    // Fetch the win samples now rather than at the moment of winning. This runs
    // off the first user gesture, which is the earliest point a context can
    // exist and still comfortably ahead of any settlement.
    preloadWinSounds();
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

  /**
   * An ordinary win.
   *
   * Reaches for the recorded sting first and only synthesises if it is not
   * ready — which in practice means the very first win of a session on a cold
   * cache. See win-audio.ts for why that answer is a boolean.
   */
  playWin(): void {
    if (playWinSting('small', { muted: this.mutedValue })) return;
    this.synthWin();
  }

  /** A big win. */
  playBigWin(): void {
    if (playWinSting('big', { muted: this.mutedValue })) return;
    this.synthBigWin();
  }

  /**
   * The top tier — a hand paying several times the stake.
   *
   * Its own sting rather than a louder playBigWin, because the whole point of
   * grading the response is that the rare result does not sound like the
   * common one. Falls back to the big-win synth, which is the closest thing
   * the oscillators can do.
   */
  playHugeWin(): void {
    if (playWinSting('huge', { muted: this.mutedValue })) return;
    this.synthBigWin();
  }

  /** Fallback: ascending major triad. */
  private synthWin(): void {
    this.tone(1046.5, 'sine', 0.12, 0.3);
    this.tone(1318.51, 'sine', 0.12, 0.3, undefined, 110);
    this.tone(1567.98, 'sine', 0.34, 0.34, undefined, 220);
  }

  /** Fallback: the triad plus an octave above. */
  private synthBigWin(): void {
    this.synthWin();
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

  /**
   * Dice tumbling down the felt — a scatter of knocks, then the settle.
   *
   * Kept for callers with no physics to drive them. When a real simulation is
   * running, use playDiceImpact per collision instead: a fixed scatter on a
   * timer will drift out of step with what the eye is seeing, and dice sound
   * wrong the moment the knock does not land with the bounce.
   */
  playDiceRoll(): void {
    const knocks = 5;
    for (let i = 0; i < knocks; i++) {
      this.noise(0.04, 0.2 - i * 0.02, 900 + Math.random() * 900, 3, i * 55);
    }
    this.noise(0.09, 0.2, 620, 1.5, knocks * 55);
  }

  /**
   * One collision, sounded at the energy it actually carried.
   *
   * `strength` is 0..1 — the physics layer derives it from impact speed, so a
   * die skimming the wall ticks and a hard first bounce cracks. Without that
   * scaling every knock lands at the same volume and the throw sounds like a
   * loop rather than a fall.
   *
   * The three surfaces are genuinely different objects: acrylic on wood is
   * lower and duller than acrylic on acrylic, and the felt swallows most of
   * the ring. Same reason a real table sounds different at the wall than in
   * the middle.
   */
  playDiceImpact(kind: 'wall' | 'die' | 'felt', strength = 1): void {
    const s = Math.max(0, Math.min(1, strength));
    // Below this the collision is visually imperceptible and only adds mud.
    if (s < 0.06) return;

    switch (kind) {
      case 'die':
        // Acrylic on acrylic: bright, short, a real click.
        this.noise(0.03, 0.05 + s * 0.22, 1500 + s * 1400 + Math.random() * 300, 4);
        break;
      case 'wall':
        // Against the rail: lower, with a bit of body behind it.
        this.noise(0.05, 0.05 + s * 0.24, 700 + s * 500 + Math.random() * 200, 2.2);
        this.tone(90 + s * 50, 'sine', 0.05, 0.03 + s * 0.06);
        break;
      case 'felt':
        // Landing on cloth: mostly absorbed, no ring at all.
        this.noise(0.07, 0.03 + s * 0.13, 380 + s * 220, 1.2);
        break;
    }
  }

  /** Both dice have come to rest — the last soft knock as they settle. */
  playDiceSettle(): void {
    this.noise(0.09, 0.14, 560, 1.5);
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
