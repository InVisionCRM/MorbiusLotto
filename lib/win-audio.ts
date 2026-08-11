/**
 * win-audio.ts — the shared win sting, played from real recordings.
 *
 * Every game already had a win sound, and every one of them was three sine
 * waves in a rising triad. They were fine and they all sounded like a phone
 * notification. This plays actual recorded samples instead — layered, level
 * matched, and staggered — so a win sounds like something happened.
 *
 * HOW IT PLUGS IN. It does not add a sound; it replaces one. Each game's
 * existing playWin/playCashout asks this module first and only falls back to
 * its own synth if the answer is no:
 *
 *     playWin() {
 *       if (playWinSting('small', { muted: this.muted })) return;
 *       ...the old oscillators...
 *     }
 *
 * That shape matters. Adding a second sound on top would recreate, in audio,
 * exactly the doubled-celebration problem that was just removed from the
 * visuals. There is one win sound, and this is it.
 *
 * WHY CALLERS PASS `muted`. The per-game audio modules each own an
 * AudioContext and a local mute flag, and tableAudio persists a shared one to
 * localStorage. Reaching in to reconcile all of that would mean touching
 * twenty files' mute logic for no benefit, so mute authority stays exactly
 * where it already lives and each caller reports its own state.
 *
 * WHY IT RETURNS A BOOLEAN. Samples arrive over the network and can lose:
 * offline, a cold cache on the very first win, a browser that will not decode
 * mp3. `false` means "not played, do your own thing", which keeps the synth as
 * a real fallback rather than decoration. The first win of a session is the
 * usual loser, so games should call preloadWinSounds() once on mount.
 */

import {
  WIN_RECIPES,
  WIN_SAMPLES_BY_FILE,
  WIN_SOUND_DIR,
  recipeFiles,
  type WinStingTier,
} from '@/lib/win-sounds';

/**
 * Overall level for the sting.
 *
 * Sits under tableAudio's own 0.28 master because that one is attenuating raw
 * oscillators, while these samples are already trimmed to a reference level by
 * their `norm`. The two numbers are not measuring the same thing.
 */
const MASTER = 0.55;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Decoded and ready. */
const buffers = new Map<string, AudioBuffer>();
/** In flight, so N games mounting at once cause one fetch each, not N. */
const inflight = new Map<string, Promise<AudioBuffer | null>>();
/** Tried and failed — never retried, so a 404 cannot become a request storm. */
const failed = new Set<string>();

function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
  } catch {
    // No Web Audio: every play below reports false and the synth takes over.
    return null;
  }
  return ctx;
}

function load(file: string): Promise<AudioBuffer | null> {
  const have = buffers.get(file);
  if (have) return Promise.resolve(have);
  if (failed.has(file)) return Promise.resolve(null);

  const running = inflight.get(file);
  if (running) return running;

  const c = audioCtx();
  if (!c) return Promise.resolve(null);

  const job = fetch(WIN_SOUND_DIR + file)
    .then((res) => {
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    // decodeAudioData is callback-style on older Safari; the promise form is
    // wrapped so a rejection there lands in the same catch as everything else.
    .then((buf) => c.decodeAudioData(buf))
    .then((decoded) => {
      buffers.set(file, decoded);
      return decoded;
    })
    .catch(() => {
      failed.add(file);
      return null;
    })
    .finally(() => {
      inflight.delete(file);
    });

  inflight.set(file, job);
  return job;
}

/**
 * Warm the cache for every file the recipes reach for.
 *
 * Safe to call repeatedly and from anywhere — it is deduped and it never
 * rejects. Worth calling on mount rather than on the first win, because a
 * sting that arrives after the animation has finished is worse than the synth
 * that would have played on time.
 */
export function preloadWinSounds(): void {
  if (typeof window === 'undefined') return;
  for (const file of recipeFiles()) void load(file);
}

export interface WinStingOptions {
  /** The caller's own mute state — see the note at the top of this file. */
  muted?: boolean;
  /** Scales the whole sting, for a game that wants to sit quieter. */
  volume?: number;
}

/**
 * Play the sting for a tier.
 *
 * Returns whether it took the job. `true` means the caller should play nothing
 * else; `false` means fall back to its own synth.
 *
 * Note what "true" is promising: that every layer is decoded and scheduled, not
 * that sound has left the speakers. A suspended context still counts, because
 * the browser resumes it on the user's next gesture and playing the synth as
 * well would just double the sound up once it does.
 */
export function playWinSting(tier: WinStingTier, opts: WinStingOptions = {}): boolean {
  if (opts.muted) return true; // Muted is handled, not failed.

  const recipe = WIN_RECIPES[tier];
  if (!recipe) return false;

  const c = audioCtx();
  if (!c || !master) return false;

  const layers = Object.values(recipe).filter(Boolean);
  if (!layers.length) return false;

  // Only claim the win if every layer is already decoded. A half-played sting —
  // trumpets with no impact under them — is worse than the synth it replaced,
  // and worse than either is the synth *and* three of the four layers.
  const ready = layers.every((l) => buffers.has(l.file));
  if (!ready) {
    for (const l of layers) void load(l.file);
    return false;
  }

  if (c.state === 'suspended') void c.resume();

  const now = c.currentTime;
  const vol = opts.volume ?? 1;

  for (const layer of layers) {
    const buffer = buffers.get(layer.file);
    if (!buffer) continue;
    const norm = WIN_SAMPLES_BY_FILE[layer.file]?.norm ?? 1;

    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buffer;
    gain.gain.value = layer.gain * norm * vol;
    src.connect(gain);
    gain.connect(master);
    src.start(now + layer.delay / 1000);
  }

  return true;
}

/** Test seam — lets a suite assert the fallback path without a network. */
export function __resetWinAudioForTests(): void {
  buffers.clear();
  inflight.clear();
  failed.clear();
  ctx = null;
  master = null;
}
