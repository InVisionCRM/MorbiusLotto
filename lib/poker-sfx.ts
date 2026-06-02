/**
 * Procedural Web Audio SFX for poker projectile throws/hits — no asset files.
 * Ported from the avatar lab. The AudioContext is created + resumed lazily on first
 * use; browsers only allow it to actually sound after a user gesture (a player tap),
 * so it's silent until the page has been interacted with — and a no-op during SSR.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
      const n = (ctx.sampleRate * 0.5) | 0;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
  return ctx;
}

function envGain(g: AudioParam, t0: number, peak: number, attack: number, decay: number) {
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const g = ctx.createGain();
  envGain(g.gain, t0, peak, 0.004, dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.06);
}

function noiseBurst(t0: number, dur: number, peak: number, filterType: BiquadFilterType, f0: number, q: number, fTo?: number) {
  if (!ctx || !master || !noiseBuf) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = filterType;
  bp.frequency.setValueAtTime(f0, t0);
  if (fTo) bp.frequency.exponentialRampToValueAtTime(fTo, t0 + dur);
  if (q) bp.Q.value = q;
  const g = ctx.createGain();
  envGain(g.gain, t0, peak, 0.003, dur);
  s.connect(bp).connect(g).connect(master);
  s.start(t0);
  s.stop(t0 + dur + 0.06);
}

export const pokerSfx = {
  /** throw */
  whoosh() { if (!ensure() || !ctx) return; const t = ctx.currentTime; noiseBurst(t, 0.16, 0.16, 'bandpass', 900, 1.4, 1900); },
  /** tomato / egg splat */
  splat()  { if (!ensure() || !ctx) return; const t = ctx.currentTime; noiseBurst(t, 0.12, 0.5, 'lowpass', 1100, 0, 260); tone(170, t, 0.1, 'sine', 0.26, 60); },
  /** snowball */
  whap()   { if (!ensure() || !ctx) return; const t = ctx.currentTime; noiseBurst(t, 0.09, 0.42, 'lowpass', 1700, 0, 600); tone(230, t, 0.07, 'sine', 0.2, 120); },
  /** arrow */
  thunk()  { if (!ensure() || !ctx) return; const t = ctx.currentTime; noiseBurst(t, 0.04, 0.4, 'highpass', 2600, 0); tone(135, t, 0.13, 'triangle', 0.38, 55); },
  /** sub-bass body hit (the knock) */
  thump()  { if (!ensure() || !ctx) return; const t = ctx.currentTime; tone(90, t, 0.16, 'sine', 0.7, 38); },
};

/** Pick the contact sound for a projectile kind. */
export function pokerHitSound(kind: string) {
  if (kind === 'arrow') pokerSfx.thunk();
  else if (kind === 'snowball') pokerSfx.whap();
  else pokerSfx.splat(); // tomato (and any future lobbed projectile)
}
