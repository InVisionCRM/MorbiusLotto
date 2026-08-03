/**
 * Per-event sound FX chain for the blackjack table designer.
 *
 * Ported from the slot builder's Sound Lab (public/slot-builder-lab.html) so
 * both studios shape audio the same way and a config edited in one reads the
 * same in the other. The graph is:
 *
 *   source → envelope → volume ─┬─────────────────────────→ mix bus → panner → out
 *                               ├─ delay (+ feedback) ────→ mix bus
 *                               └─ convolver reverb ──────→ mix bus
 *
 * Everything downstream of the mix bus is shared, so the panner moves the whole
 * processed sound — dry signal and tails together — which is the only mental
 * model of "position" that doesn't surprise people.
 *
 * The one divergence from the slot builder: it synthesises an event's default
 * from a sound pack, whereas a blackjack event's default is a pool of real
 * audio files (dealer voice lines, card snaps). The FX chain itself is
 * identical, because the slot builder already ran uploaded samples through it.
 *
 * Every step is guarded. Audio is presentation — a decode failure or a missing
 * node must degrade to a plainer sound or silence, never throw into the game.
 */

export interface SoundFx {
  /** Data/object URL of an uploaded sample; null means use the event's file pool. */
  sample: string | null;
  volume: number;
  pitch: number;
  /** Envelope handles, as 0..1 fractions of the sample. Monotonic: attack ≤ decay ≤ end. */
  envAttack: number;
  envDecay: number;
  envSustain: number;
  envEnd: number;
  pan: number;
  reverbMix: number;
  reverbDecay: number;
  delayMix: number;
  delayTime: number;
  delayFeedback: number;
}

export const FX_DEFAULT: SoundFx = {
  sample: null,
  volume: 1,
  pitch: 1,
  envAttack: 0,
  envDecay: 0,
  envSustain: 1,
  envEnd: 1,
  pan: 0,
  reverbMix: 0,
  reverbDecay: 1.6,
  delayMix: 0,
  delayTime: 0.22,
  delayFeedback: 0.3,
};

/** Sparse per-event overrides — only customised events get an entry. */
export type SoundFxMap = Record<string, Partial<SoundFx>>;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Resolves an event's effective FX, filling any missing field from the defaults. */
export function fxFor(map: SoundFxMap | undefined, id: string): SoundFx {
  const raw = map?.[id];
  const out = { ...FX_DEFAULT };
  if (raw) {
    (Object.keys(FX_DEFAULT) as Array<keyof SoundFx>).forEach((k) => {
      const v = raw[k];
      if (v != null) (out as Record<string, unknown>)[k] = v;
    });
  }
  return out;
}

/** True when this event has been customised away from the defaults. */
export function isFxCustomised(map: SoundFxMap | undefined, id: string): boolean {
  const raw = map?.[id];
  if (!raw) return false;
  return (Object.keys(FX_DEFAULT) as Array<keyof SoundFx>).some(
    (k) => raw[k] != null && raw[k] !== FX_DEFAULT[k],
  );
}

// ── Readouts. Plain text, no markup: the same strings are rendered on mount and
//    written on every drag frame. ────────────────────────────────────────────
export const envReadText = (fx: SoundFx) =>
  `ATK ${Math.round(clamp(fx.envAttack, 0, 1) * 100)}% · SUS ${Math.round(
    clamp(fx.envSustain, 0, 1) * 100,
  )}% · END ${Math.round(clamp(fx.envEnd, 0, 1) * 100)}%`;

export const padReadText = (fx: SoundFx) => {
  const p = Math.round(clamp(fx.pan, -1, 1) * 100);
  return `PAN ${p > 0 ? '+' : ''}${p} · REVERB ${Math.round(clamp(fx.reverbMix, 0, 1) * 100)}%`;
};

export const echoReadText = (fx: SoundFx) =>
  `${Math.round(clamp(fx.delayTime, 0.02, 1) * 1000)}ms · FB ${Math.round(
    clamp(fx.delayFeedback, 0, 0.85) * 100,
  )}%`;

// ── Audio context ──────────────────────────────────────────────────────────
let _ac: AudioContext | null = null;

/** Shared context, resumed on demand. Returns null where WebAudio is absent. */
export function audioCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!_ac) _ac = new Ctor();
    if (_ac.state === 'suspended' && _ac.resume) void _ac.resume();
    return _ac;
  } catch {
    return null;
  }
}

// ── Buffer caches ──────────────────────────────────────────────────────────
const _bufCache: Record<string, AudioBuffer | Promise<AudioBuffer | null>> = {};

/** Fetches + decodes a URL into an AudioBuffer, memoised. Null on any failure. */
export function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const hit = _bufCache[url];
  if (hit) return Promise.resolve(hit as AudioBuffer | null).catch(() => null);
  const c = audioCtx();
  if (!c) return Promise.resolve(null);
  const p = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      _bufCache[url] = buf;
      return buf;
    })
    .catch(() => {
      delete _bufCache[url];
      return null;
    });
  _bufCache[url] = p;
  return p;
}

export function clearBufferCache(url: string) {
  delete _bufCache[url];
}

const _irCache: Record<number, AudioBuffer> = {};

/** Procedural reverb impulse: exponentially-decaying noise, cached by decay. */
function buildReverbIR(ctx: AudioContext, decaySeconds: number): AudioBuffer | null {
  try {
    const sr = ctx.sampleRate || 44100;
    const capped = clamp(decaySeconds || 1.6, 0.05, 4);
    const key = Math.round(capped * 20);
    if (_irCache[key]) return _irCache[key];
    const n = Math.max(1, Math.floor(capped * sr));
    const buf = ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2);
    }
    _irCache[key] = buf;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Live analyser pair per event, replaced on every play so the Stereograph draws
 * the sound currently in the air. `endAt` tells the draw loop when to fall back
 * to its idle animation.
 */
export interface LiveTap {
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  endAt: number;
}
export const soundLiveTaps: Record<string, LiveTap> = {};

/** Notifies mounted Echo Tunnels that their event just fired, so they can pulse. */
type PulseFn = () => void;
const _echoPulses: Record<string, Set<PulseFn>> = {};
export function registerEchoPulse(id: string, fn: PulseFn) {
  (_echoPulses[id] ||= new Set()).add(fn);
  return () => _echoPulses[id]?.delete(fn);
}
function firePulse(id: string) {
  _echoPulses[id]?.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a viz nicety must never break playback */
    }
  });
}

/**
 * Builds and starts the one-shot graph for a single play.
 *
 * The envelope handles are fractions of the *sample*, but playbackRate
 * compresses real time, so every schedule divides by pitch to land in
 * wall-clock seconds.
 */
export function playBufferThroughFx(
  c: AudioContext,
  id: string,
  buf: AudioBuffer,
  fx: SoundFx,
  masterVol: number,
  mul?: number,
) {
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    const pitch = clamp(fx.pitch > 0 ? fx.pitch : 1, 0.5, 2);
    // playbackRate moves pitch and duration together — the accepted tradeoff for
    // a lightweight engine with no time-stretching.
    src.playbackRate.value = pitch;

    const envAttack = clamp(fx.envAttack ?? 0, 0, 1);
    const envDecay = clamp(fx.envDecay ?? 0, envAttack, 1);
    const envSustain = clamp(fx.envSustain ?? 1, 0, 1);
    const envEnd = clamp(fx.envEnd ?? 1, envDecay, 1);
    // envEnd at 1 (untouched) lets the buffer ring out naturally.
    const trimmed = envEnd < 0.999;
    const wallDur = buf.duration / pitch;
    const dur = Math.max(0.02, wallDur * envEnd);
    const now = c.currentTime;

    const gateGain = c.createGain();
    const tA = wallDur * envAttack;
    const tD = wallDur * envDecay;
    gateGain.gain.setValueAtTime(tA > 0.001 ? 0 : 1, now);
    if (tA > 0.001) gateGain.gain.linearRampToValueAtTime(1, now + tA);
    if (tD > tA + 0.001) gateGain.gain.linearRampToValueAtTime(envSustain, now + tD);
    else if (envSustain < 0.999) gateGain.gain.setValueAtTime(envSustain, now + tA + 0.001);
    if (trimmed) {
      const fadeStart = Math.max(now + tD, now + dur - 0.015);
      gateGain.gain.setValueAtTime(envSustain, fadeStart);
      // ~15ms fade instead of a hard cut, which would click.
      gateGain.gain.linearRampToValueAtTime(0.0001, now + dur);
    }

    const volGain = c.createGain();
    volGain.gain.value = clamp(fx.volume ?? 1, 0, 2) * masterVol * (mul ?? 1);
    src.connect(gateGain);
    gateGain.connect(volGain);

    const mixBus = c.createGain();
    mixBus.gain.value = 1;
    volGain.connect(mixBus); // dry send

    const delayMix = clamp(fx.delayMix || 0, 0, 1);
    let dTime = 0;
    let decay = 0;
    if (delayMix > 0) {
      try {
        dTime = clamp(fx.delayTime ?? 0.22, 0.02, 1);
        const fb = clamp(fx.delayFeedback ?? 0.3, 0, 0.85);
        const delayNode = c.createDelay(2.0);
        delayNode.delayTime.value = dTime;
        const fbGain = c.createGain();
        fbGain.gain.value = fb;
        const dWet = c.createGain();
        dWet.gain.value = delayMix;
        volGain.connect(delayNode);
        delayNode.connect(fbGain);
        fbGain.connect(delayNode); // feedback loop
        delayNode.connect(dWet);
        dWet.connect(mixBus);
      } catch {
        /* drop the delay send, keep the dry signal */
      }
    }

    const reverbMix = clamp(fx.reverbMix || 0, 0, 1);
    if (reverbMix > 0) {
      try {
        decay = clamp(fx.reverbDecay ?? 1.6, 0.2, 4);
        const ir = buildReverbIR(c, decay);
        if (ir) {
          const conv = c.createConvolver();
          conv.buffer = ir;
          conv.normalize = true;
          const rWet = c.createGain();
          rWet.gain.value = reverbMix;
          volGain.connect(conv);
          conv.connect(rWet);
          rWet.connect(mixBus);
        }
      } catch {
        /* drop the reverb send, keep the dry signal */
      }
    }

    const pan = clamp(fx.pan ?? 0, -1, 1);
    const panner = c.createStereoPanner ? c.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      mixBus.connect(panner);
      panner.connect(c.destination);
    } else {
      mixBus.connect(c.destination); // no panning available
    }

    // Post-pan monitoring branch for the Stereograph. It never feeds onward.
    try {
      if (panner && c.createChannelSplitter) {
        const splitter = c.createChannelSplitter(2);
        panner.connect(splitter);
        const analyserL = c.createAnalyser();
        analyserL.fftSize = 512;
        const analyserR = c.createAnalyser();
        analyserR.fftSize = 512;
        splitter.connect(analyserL, 0);
        splitter.connect(analyserR, 1);
        let tailMs = 250;
        if (delayMix > 0) tailMs = Math.max(tailMs, dTime * 1000 * 6); // a handful of repeats
        if (reverbMix > 0) tailMs = Math.max(tailMs, decay * 1000);
        soundLiveTaps[id] = { analyserL, analyserR, endAt: Date.now() + dur * 1000 + tailMs };
      }
    } catch {
      /* the goniometer is a monitoring nicety — never let it break audio */
    }

    src.start();
    if (trimmed) src.stop(now + dur + 0.02);
  } catch {
    /* audio is presentation-only */
  }
}

/**
 * Plays one event through its FX chain. `defaultUrl` is the file the event's
 * pool resolved to; an uploaded `sample` takes precedence, and a decode failure
 * on the sample falls back to the pool file rather than going silent.
 */
export function playEventWithFx(
  id: string,
  defaultUrl: string | null,
  fx: SoundFx,
  masterVol = 0.8,
  mul?: number,
) {
  try {
    const c = audioCtx();
    if (!c) return;
    firePulse(id);
    const url = fx.sample || defaultUrl;
    if (!url) return;
    void loadBuffer(url).then((buf) => {
      if (buf) {
        playBufferThroughFx(c, id, buf, fx, masterVol, mul);
        return;
      }
      if (fx.sample && defaultUrl) {
        void loadBuffer(defaultUrl).then((fallback) => {
          if (fallback) playBufferThroughFx(c, id, fallback, fx, masterVol, mul);
        });
      }
    });
  } catch {
    /* audio is presentation-only */
  }
}

/** Peak-per-column waveform for the envelope canvas, in 0..1. */
export function waveformPeaks(buf: AudioBuffer, columns: number): number[] {
  const out = new Array(columns).fill(0);
  try {
    const data = buf.getChannelData(0);
    const per = Math.max(1, Math.floor(data.length / columns));
    for (let i = 0; i < columns; i++) {
      let peak = 0;
      const start = i * per;
      const end = Math.min(data.length, start + per);
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
      out[i] = Math.min(1, peak);
    }
  } catch {
    /* an undrawable buffer just yields a flat line */
  }
  return out;
}
