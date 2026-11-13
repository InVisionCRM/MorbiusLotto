/**
 * Morbius poker → X live stream worker.
 *
 * Polls the game server's GET /api/poker/bot-schedule. When a scheduled bot game's
 * tournament goes `active` and has a table, it opens this worker's own broadcast view
 * (/view, view.html — renders the current game's public table snapshot from
 * GET /api/poker/bot-schedule/table/<id>/state, no hole cards until showdown) in a
 * kiosk Chromium on a virtual X display and pushes that display with ffmpeg to X over
 * RTMP (X_RTMP_URL + X_STREAM_KEY). The site's own /poker/<tableId> page needs a
 * connected wallet, so it can't be used for a logged-out capture. The push stops when
 * the tournament completes / is cancelled, or after STREAM_MAX_MINUTES.
 *
 * Env:
 *   API_BASE=https://api.morbius.io        game server
 *   SITE_URL=https://morbius.io            public site (shown in logs only)
 *   X_RTMP_URL=rtmps://…/x                 X Media Studio ingest URL (secret)
 *   X_STREAM_KEY=…                         X stream key (secret)
 *   STREAM_ENABLED=0|1                     master switch (default 0 = dry: logs only)
 *   STREAM_TEST_OUTPUT=/tmp/test.flv       when set (and STREAM_ENABLED=0), record to a file instead
 *   STREAM_MAX_MINUTES=180
 *   STREAM_PREROLL_SECONDS=120             start pushing this long before the slot time so an X
 *                                          scheduled broadcast (auto-publish) finds video already
 *                                          flowing; the view shows a "starting soon" card until the
 *                                          table exists
 *   STREAM_WIDTH=1280 STREAM_HEIGHT=720 STREAM_FPS=30 STREAM_VIDEO_KBPS=3500
 *   PORT=8080                              /health and /status
 *   MUSIC_ENABLED=1                        background music on the stream (default on)
 *   MUSIC_DIR=/app/music                   folder of .mp3/.m4a/.wav tracks, shuffled + looped
 *                                          (ships with Kyle's own Suno tracks, see music/SOURCE.md)
 *   MUSIC_URL=https://…/track.mp3          optional single track/stream URL, looped (overrides MUSIC_DIR)
 *   MUSIC_VOLUME=0.18                      0–1 gain applied to the music (low background level)
 *   STREAM_OUTRO_SECONDS=90                after the game ends keep the broadcast up this long with the
 *                                          intermission screen (promo loop + countdown to the next game)
 *
 *   STREAM_MODE=tournament|cash            cash = always stream STREAM_TABLE_ID (the 24/7 cash table): starts at
 *                                          boot, never stops, no STREAM_MAX_MINUTES cap, restarts the push if
 *                                          ffmpeg/the page dies. Default tournament (scheduled 1/5/9 PM games).
 *   STREAM_TABLE_ID=<uuid>                 table for cash mode
 *   STREAM_NAME="Morbius Poker Cash Game"  top-bar title in cash mode
 *   STREAM_CAPTURE=x11|cdp                 x11 = Xvfb + kiosk Chromium + x11grab (Linux/Railway, default);
 *                                          cdp = headless Chromium via playwright-core, CDP screencast frames
 *                                          piped to ffmpeg at a fixed rate (macOS / no X server)
 *   STREAM_VCODEC=libx264|h264_videotoolbox  video encoder (videotoolbox = Apple hardware encoder)
 *   CHROMIUM_BIN=…                          browser binary (cdp: optional, else playwright's chromium)
 *   POST /push/restart?gap=20 (127.0.0.1)   stop the push for `gap` seconds and start again (broadcast rollover)
 *
 * Promos: /promos/* serves promos/ (promos.json + .webm/.mp4 clips) to view.html.
 *
 * GET /stream-config → view.html settings from env (edit the env + POST /view/reload, no code change):
 *   STREAM_AVATARS=0                        hide player avatars (default on)
 *   STREAM_AVATAR_BASE=https://morbius.io/api/poker/avatar   avatar art (<base>/<0x address> → SVG)
 *   Cash-game permanent promo (bottom of the left sidebar, cash mode only):
 *   STREAM_CASH_PROMO=0                     hide it (default on)
 *   Styled like the morbius.io homepage game tiles (components/home2/game-tile.tsx): the poker tile art
 *   (promos/poker-tile-art.webp, cropped from public/home2/tiles/poker.webp above its painted title),
 *   the tile ribbon badge with the M mark, a 3D gold title, the tile banner ribbon and the gold CTA
 *   button, in Poppins (bundled in promos/poppins-*.woff2 so the Mac renders the same font).
 *   STREAM_CASH_PROMO_KICKER="FREE · DAILY"   corner ribbon badge
 *   STREAM_CASH_PROMO_TITLE="Beat the Bots"   last word is set big ("BEAT THE" / "BOTS")
 *   STREAM_CASH_PROMO_LINES="1, 5 & 9 PM ET|3,500 prize pool"   ("|" separates; a time-like line goes in
 *                                          the top-right badge, the next line in the banner ribbon)
 *   STREAM_CASH_PROMO_CTA="Play free at" STREAM_CASH_PROMO_URL="morbius.io/poker"   gold button
 *   STREAM_CASH_PROMO_TAG="$Morbius on #PulseChain"   footer, with the PulseChain logo
 *   STREAM_CASH_PROMO_QR=1                  add the bundled QR to https://morbius.io/poker (off by default;
 *                                          or a .svg/.png file name in promos/)
 *   (a live countdown to the next Beat the Bots game / REG OPEN sits above the button)
 * POST /view/reload (127.0.0.1, cdp capture) reloads the broadcast page in place — picks up view.html /
 *   promo / config changes without stopping the push. view.html is re-read on every /view request.
 *
 * Never logs the RTMP URL or key.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const VIEW_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'view.html');
let VIEW_HTML = fs.readFileSync(VIEW_PATH);
/** view.html, re-read on each request (cheap) so an updated file only needs a page reload, not a worker restart. */
function viewHtml() {
  try { VIEW_HTML = fs.readFileSync(VIEW_PATH); } catch { /* keep the last good copy */ }
  return VIEW_HTML;
}

const env = (k, d) => (process.env[k] && process.env[k].trim() !== '' ? process.env[k].trim() : d);
const API_BASE = env('API_BASE', 'https://api.morbius.io').replace(/\/$/, '');
const SITE_URL = env('SITE_URL', 'https://morbius.io').replace(/\/$/, '');
const ENABLED = ['1', 'true', 'yes'].includes(env('STREAM_ENABLED', '0').toLowerCase());
const TEST_OUTPUT = env('STREAM_TEST_OUTPUT', '');
const MAX_MIN = Number(env('STREAM_MAX_MINUTES', '180'));
const W = Number(env('STREAM_WIDTH', '1280'));
const H = Number(env('STREAM_HEIGHT', '720'));
const FPS = Number(env('STREAM_FPS', '30'));
const KBPS = Number(env('STREAM_VIDEO_KBPS', '3500'));
const DISPLAY = env('STREAM_DISPLAY', ':99');
const POLL_MS = 20_000;
const PORT = Number(env('PORT', '8080'));
const PREROLL_MS = Number(env('STREAM_PREROLL_SECONDS', '120')) * 1000;
const MUSIC_ENABLED = !['0', 'false', 'no', 'off'].includes(env('MUSIC_ENABLED', '1').toLowerCase());
const MUSIC_DIR = env('MUSIC_DIR', path.join(path.dirname(fileURLToPath(import.meta.url)), 'music'));
const MUSIC_URL = env('MUSIC_URL', '');
const MUSIC_VOLUME = Math.min(1, Math.max(0, Number(env('MUSIC_VOLUME', '0.18')) || 0.18));
const OUTRO_MS = Math.max(0, Number(env('STREAM_OUTRO_SECONDS', '90')) || 0) * 1000;
const MODE = env('STREAM_MODE', 'tournament').toLowerCase() === 'cash' ? 'cash' : 'tournament';
const CASH_TABLE_ID = env('STREAM_TABLE_ID', '');
const STREAM_NAME = env('STREAM_NAME', 'Morbius Poker Cash Game');
const CAPTURE = env('STREAM_CAPTURE', 'x11').toLowerCase() === 'cdp' ? 'cdp' : 'x11';
const VCODEC = env('STREAM_VCODEC', 'libx264');
const PROMO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'promos');
const PROMO_TYPES = { '.json': 'application/json', '.webm': 'video/webm', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };

/** Resolve /promos/<file> to a file inside PROMO_DIR (no traversal), or null. */
export function promoFile(urlPath, dir = PROMO_DIR) {
  const m = /^\/promos\/([A-Za-z0-9._-]+)$/.exec(String(urlPath || '').split('?')[0]);
  if (!m || m[1].includes('..')) return null;
  const ext = path.extname(m[1]).toLowerCase();
  if (!PROMO_TYPES[ext]) return null;
  const f = path.join(dir, m[1]);
  try { return fs.statSync(f).isFile() ? { file: f, type: PROMO_TYPES[ext] } : null; } catch { return null; }
}

export const DEFAULT_CASH_PROMO = Object.freeze({
  kicker: 'FREE · DAILY',
  title: 'Beat the Bots',
  lines: ['1, 5 & 9 PM ET', '3,500 prize pool'],
  cta: 'Play free at',
  url: 'morbius.io/poker',
  tag: '$Morbius on #PulseChain',
  qr: '',
});

/** STREAM_CASH_PROMO_QR: off by default; 1/on = the bundled QR, or a .svg/.png file name in promos/. */
function qrSetting(v) {
  const t = String(v || '').trim();
  if (['1', 'true', 'yes', 'on'].includes(t.toLowerCase())) return 'qr-morbius-poker.svg';
  return /^[A-Za-z0-9._-]+\.(svg|png)$/.test(t) && !t.includes('..') ? t : '';
}

/** Settings for view.html from env (see header). Pure: pass an env object in tests. */
export function streamConfig(e = process.env) {
  const get = (k, d) => (e[k] != null && String(e[k]).trim() !== '' ? String(e[k]).trim() : d);
  const off = (k) => ['0', 'false', 'no', 'off'].includes(String(e[k] ?? '').trim().toLowerCase());
  const site = get('SITE_URL', 'https://morbius.io').replace(/\/$/, '');
  const lines = get('STREAM_CASH_PROMO_LINES', null);
  return {
    avatars: !off('STREAM_AVATARS'),
    avatarBase: get('STREAM_AVATAR_BASE', `${site}/api/poker/avatar`).replace(/\/$/, ''),
    cashPromo: {
      enabled: !off('STREAM_CASH_PROMO'),
      kicker: get('STREAM_CASH_PROMO_KICKER', DEFAULT_CASH_PROMO.kicker),
      title: get('STREAM_CASH_PROMO_TITLE', DEFAULT_CASH_PROMO.title),
      lines: lines ? lines.split('|').map((l) => l.trim()).filter(Boolean).slice(0, 4) : [...DEFAULT_CASH_PROMO.lines],
      cta: get('STREAM_CASH_PROMO_CTA', DEFAULT_CASH_PROMO.cta),
      url: get('STREAM_CASH_PROMO_URL', DEFAULT_CASH_PROMO.url),
      tag: get('STREAM_CASH_PROMO_TAG', DEFAULT_CASH_PROMO.tag),
      qr: qrSetting(get('STREAM_CASH_PROMO_QR', '')),
    },
  };
}

/** "2026-11-12 13:00 America/New_York" -> "1 PM" (falls back to the raw hh:mm). */
export function slotLabel(slotKey) {
  const hm = String(slotKey || '').split(' ')[1] || '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return hm;
  const h = Number(m[1]); const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m[2] === '00' ? '' : ':' + m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Next scheduled slot (ISO) after `now`, from the bot-schedule poll body. */
export function nextSlotFrom(body, now = Date.now()) {
  if (body?.nextSlotAt && Date.parse(body.nextSlotAt) > now) return body.nextSlotAt;
  const games = Array.isArray(body?.games) ? body.games : [];
  const up = games.map((g) => g.scheduledAt).filter((a) => a && Date.parse(a) > now).sort();
  return up[0] ?? null;
}

const state = { current: null, lastPoll: null, lastError: null, history: [] };
const log = (msg, extra = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

function rtmpTarget() {
  if (ENABLED) {
    const url = env('X_RTMP_URL', '');
    const key = env('X_STREAM_KEY', '');
    if (!url || !key) return null;
    return `${url.replace(/\/$/, '')}/${key}`;
  }
  return TEST_OUTPUT || null;
}

let xvfb = null;
function ensureXvfb() {
  if (xvfb && xvfb.exitCode == null) return;
  xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', `${W}x${H}x24`, '-nolisten', 'tcp'], { stdio: 'ignore' });
  xvfb.on('exit', (c) => log('xvfb exited', { code: c }));
}

/**
 * ffmpeg audio input args. Music: a shuffled playlist (concat demuxer) repeated enough
 * times to outlast STREAM_MAX_MINUTES, read in real time (-re). Falls back to silence.
 */
export function musicInputArgs({ enabled = MUSIC_ENABLED, dir = MUSIC_DIR, url = MUSIC_URL, maxMin = MAX_MIN, rng = Math.random, loop = MODE === 'cash' } = {}) {
  const silence = { args: ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'], music: false, tracks: 0 };
  if (!enabled) return silence;
  if (url) return { args: ['-re', '-stream_loop', '-1', '-i', url], music: true, tracks: 1 };
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f)).map((f) => path.join(dir, f));
  } catch {
    return silence;
  }
  if (files.length === 0) return silence;
  if (loop) {
    // 24/7: one shuffled round, looped by the concat demuxer forever
    const order = [...files];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const list = path.join(process.env.TMPDIR || '/tmp', `morbius-music-${process.pid}.txt`);
    fs.writeFileSync(list, order.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    return { args: ['-re', '-stream_loop', '-1', '-f', 'concat', '-safe', '0', '-i', list], music: true, tracks: files.length };
  }
  // ~3 min per track; repeat the shuffled set until it covers the max stream length + margin
  const rounds = Math.max(2, Math.ceil(((maxMin + 30) * 60) / (files.length * 150)));
  const lines = [];
  for (let r = 0; r < rounds; r++) {
    const order = [...files];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const f of order) lines.push(`file '${f.replace(/'/g, "'\\''")}'`);
  }
  const list = path.join(process.env.TMPDIR || '/tmp', `morbius-music-${process.pid}.txt`);
  fs.writeFileSync(list, lines.join('\n') + '\n');
  return { args: ['-re', '-f', 'concat', '-safe', '0', '-i', list], music: true, tracks: files.length };
}

/** Encoder args for the chosen video codec. */
export function videoEncodeArgs({ codec = VCODEC, kbps = KBPS, fps = FPS } = {}) {
  const rate = ['-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`, '-g', String(fps * 2)];
  if (codec === 'h264_videotoolbox') {
    return ['-c:v', 'h264_videotoolbox', '-realtime', '1', '-allow_sw', '1', '-profile:v', 'high', '-pix_fmt', 'yuv420p', ...rate];
  }
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', ...rate];
}

/**
 * CDP capture (no X server): headless Chromium renders the view; Page.startScreencast JPEG frames
 * are re-sent to ffmpeg's stdin at a fixed FPS (repeating the latest frame, paced by wall clock so
 * video stays in sync with the real-time music input).
 */
async function startCdpCapture(cur, url) {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import('playwright')); }
  const browser = await chromium.launch({
    headless: true,
    ...(env('CHROMIUM_BIN', '') ? { executablePath: env('CHROMIUM_BIN', '') } : {}),
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--mute-audio', '--hide-scrollbars'],
  });
  cur.cdpBrowser = browser;
  browser.on('disconnected', () => { if (state.current === cur && !cur.stopping) { state.lastError = 'browser disconnected'; restartOrStop(cur, 'browser disconnected'); } });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('crash', () => { if (state.current === cur && !cur.stopping) restartOrStop(cur, 'page crashed'); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const cdp = await page.context().newCDPSession(page);
  cur.lastFrame = null;
  cur.lastFrameAt = 0;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    cur.lastFrame = Buffer.from(data, 'base64');
    cur.lastFrameAt = Date.now();
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: Number(env('STREAM_JPEG_QUALITY', '85')), maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  cur.cdpPage = page;
  // Force a repaint now and then so a static screen still yields fresh frames.
  cur.repaint = setInterval(() => { page.evaluate(() => document.body && (document.body.style.outline = document.body.style.outline ? '' : '0 solid transparent')).catch(() => {}); }, 1000);
}

function pumpFrames(cur, proc) {
  const t0 = Date.now();
  let sent = 0;
  let blocked = false;
  proc.stdin.on('drain', () => { blocked = false; });
  proc.stdin.on('error', () => {});
  cur.pump = setInterval(() => {
    if (!cur.lastFrame || blocked || proc.exitCode != null) return;
    const due = Math.floor(((Date.now() - t0) * FPS) / 1000);
    // never burst more than 1 s of catch-up frames
    if (due - sent > FPS) sent = due - FPS;
    while (sent < due) {
      sent++;
      if (!proc.stdin.write(cur.lastFrame)) { blocked = true; break; }
    }
  }, Math.max(5, Math.floor(1000 / FPS / 2)));
}

function spawnFfmpeg(cur, game, ffArgs, audio) {
  const opts = { env: { ...process.env, DISPLAY }, stdio: [CAPTURE === 'cdp' ? 'pipe' : 'ignore', 'ignore', 'pipe'] };
  const proc = spawn(env('FFMPEG_BIN', 'ffmpeg'), ffArgs, opts);
  cur.ff.proc = proc;
  if (CAPTURE === 'cdp') { clearInterval(cur.pump); pumpFrames(cur, proc); }
  proc.stderr.on('data', (d) => log('ffmpeg', { line: String(d).replace(/rtmps?:\/\/\S+/g, '<rtmp>').trim().slice(0, 300) }));
  const spawnedAt = Date.now();
  proc.on('exit', (code) => {
    log('ffmpeg exited', { code });
    if (state.current !== cur || cur.stopping || cur.ff.proc !== proc) return;
    // Safety net: if ffmpeg dies right away while music is on, retry once with silence
    // so a bad track / demuxer problem can never take the broadcast down.
    if (audio.music && !cur.ff.retried && Date.now() - spawnedAt < 30_000) {
      cur.ff.retried = true;
      log('ffmpeg failed early with music; retrying with silence');
      const silent = musicInputArgs({ enabled: false });
      const args = [...ffArgs];
      args.splice(ffArgs.indexOf(audio.args[0]), audio.args.length, ...silent.args);
      const ai = args.indexOf('-af'); if (ai >= 0) args.splice(ai, 2);
      spawnFfmpeg(cur, game, args, silent);
      return;
    }
    state.lastError = `ffmpeg exited ${code}`;
    restartOrStop(cur, 'ffmpeg exited');
  });
}

/** Cash mode keeps the stream up forever: tear down and start again after a short pause. */
function restartOrStop(cur, reason, gapMs = 5000) {
  if (state.current !== cur) return;
  stopStream(reason);
  if (MODE === 'cash') {
    state.restartAt = Date.now() + gapMs;
    setTimeout(() => { state.restartAt = null; if (!state.current) startCash(); }, gapMs);
  }
}

function startCash() {
  if (!CASH_TABLE_ID) { log('cash mode needs STREAM_TABLE_ID'); return; }
  startStream({ tournamentId: null, tableId: CASH_TABLE_ID, slotKey: null, cash: true });
}

function startStream(game) {
  const target = rtmpTarget();
  const title = game.cash ? STREAM_NAME : `Beat the Bots ${slotLabel(game.slotKey)} ET`;
  const url = `http://127.0.0.1:${PORT}/view?name=${encodeURIComponent(title)}${game.cash ? '&mode=cash' : ''}`;
  if (!target) {
    log('dry run: would stream game (STREAM_ENABLED=0 or X_RTMP_URL/X_STREAM_KEY missing)', { tournamentId: game.tournamentId, tableId: game.tableId, url });
    state.current = { ...game, dry: true, startedAt: Date.now(), procs: [] };
    return;
  }
  const isFile = !ENABLED;
  const audio = musicInputArgs();
  log('audio', { music: audio.music, tracks: audio.tracks, volume: audio.music ? MUSIC_VOLUME : 0 });
  const videoIn = CAPTURE === 'cdp'
    ? ['-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-thread_queue_size', '64', '-i', 'pipe:0']
    : ['-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', `${DISPLAY}.0`];
  const ffArgs = [
    '-hide_banner', '-loglevel', 'warning', '-nostdin',
    ...videoIn,
    ...audio.args,
    '-map', '0:v:0', '-map', '1:a:0',
    ...(audio.music ? ['-af', `volume=${MUSIC_VOLUME},aresample=44100:async=1`] : []),
    ...(CAPTURE === 'cdp' ? ['-vf', `scale=${W}:${H}`, '-r', String(FPS)] : []),
    ...videoEncodeArgs(),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', ...(isFile ? ['-y'] : []), target,
  ];
  if (CAPTURE === 'cdp') { const i = ffArgs.indexOf('-nostdin'); ffArgs.splice(i, 1); }
  const cur = { ...game, dry: false, startedAt: Date.now(), ff: { proc: null }, url, toFile: isFile };
  state.current = cur;
  if (CAPTURE === 'cdp') {
    startCdpCapture(cur, url)
      .then(() => {
        if (state.current !== cur || cur.stopping) return;
        cur.timer = setTimeout(() => { if (state.current === cur && !cur.stopping) spawnFfmpeg(cur, game, ffArgs, audio); }, 4000);
      })
      .catch((err) => { log('cdp capture failed', { error: String(err?.message ?? err) }); state.lastError = 'cdp capture failed'; restartOrStop(cur, 'cdp capture failed', 15_000); });
  } else {
    ensureXvfb();
    cur.browser = spawn(
      env('CHROMIUM_BIN', 'chromium'),
      [
        '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--noerrdialogs',
        '--disable-infobars', '--autoplay-policy=no-user-gesture-required', '--kiosk',
        `--window-size=${W},${H}`, '--window-position=0,0', url,
      ],
      { env: { ...process.env, DISPLAY }, stdio: 'ignore' },
    );
    // Give the page a few seconds to render before pushing.
    cur.timer = setTimeout(() => { if (state.current === cur && !cur.stopping) spawnFfmpeg(cur, game, ffArgs, audio); }, 8000);
  }
  log('stream started', { tournamentId: game.tournamentId, tableId: game.tableId, url, toFile: isFile, capture: CAPTURE, mode: MODE });
}

function stopStream(reason) {
  const cur = state.current;
  if (!cur) return;
  cur.stopping = true;
  clearTimeout(cur.timer);
  clearInterval(cur.pump);
  clearInterval(cur.repaint);
  try { cur.ff?.proc?.stdin?.end(); } catch {}
  try { cur.ff?.proc?.kill('SIGINT'); } catch {}
  try { cur.browser?.kill('SIGTERM'); } catch {}
  try { cur.cdpBrowser?.close().catch(() => {}); } catch {}
  state.history.unshift({ tournamentId: cur.tournamentId, slotKey: cur.slotKey, startedAt: new Date(cur.startedAt).toISOString(), stoppedAt: new Date().toISOString(), reason, dry: cur.dry });
  state.history = state.history.slice(0, 20);
  state.current = null;
  log('stream stopped', { tournamentId: cur.tournamentId, reason });
}

async function poll() {
  try {
    const r = await fetch(`${API_BASE}/api/poker/bot-schedule`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    state.lastPoll = new Date().toISOString();
    state.buyIn = body.buyIn ?? state.buyIn ?? null;
    state.freeEntry = body.freeEntry === true;
    state.nextSlotAt = nextSlotFrom(body);
    state.lastError = null;
    const games = Array.isArray(body.games) ? body.games : [];
    if (MODE === 'cash') return; // cash mode: schedule info only (next game / free entry), never start/stop
    const cur = state.current;
    if (cur) {
      const g = games.find((x) => x.tournamentId === cur.tournamentId);
      const done = !g || ['completed', 'cancelled', 'finished'].includes(String(g.tournamentStatus));
      if (cur.outroUntil) {
        if (Date.now() >= cur.outroUntil) stopStream('tournament finished');
        return;
      }
      if (done && OUTRO_MS > 0 && g && String(g.tournamentStatus) === 'completed') {
        // Intermission outro: the view switches to the promo loop + next-game countdown.
        cur.outroUntil = Date.now() + OUTRO_MS;
        cur.tableId = null;
        log('outro started', { tournamentId: cur.tournamentId, seconds: OUTRO_MS / 1000 });
        setTimeout(() => { if (state.current === cur) stopStream('tournament finished'); }, OUTRO_MS + 1000);
      } else if (done) stopStream('tournament finished');
      else if (Date.now() - cur.startedAt > MAX_MIN * 60_000) stopStream('max duration');
      else if (cur.tournamentStatus !== 'active' && g.tournamentStatus !== 'active' && Date.now() - Date.parse(g.scheduledAt) > 20 * 60_000) stopStream('never started');
      else {
        // the view follows the table via /api/current (table appears at start; may change on consolidation)
        cur.tableId = g.tableId;
        cur.tournamentStatus = g.tournamentStatus;
      }
      return;
    }
    const now = Date.now();
    const fresh = (g) => g.tournamentId && !state.history.some((h) => h.tournamentId === g.tournamentId);
    const live =
      games.find((g) => fresh(g) && g.tournamentStatus === 'active' && g.tableId) ||
      games.find((g) => {
        if (!fresh(g) || g.tournamentStatus !== 'registration') return false;
        const until = Date.parse(g.scheduledAt) - now;
        return until <= PREROLL_MS && until > -10 * 60_000;
      });
    if (live) startStream(live);
  } catch (err) {
    state.lastError = String(err?.message ?? err);
    log('poll failed', { error: state.lastError });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) http
  .createServer((req, res) => {
    const viewM = /^\/view(\?.*)?$/i.exec(req.url || '');
    if (viewM) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(viewHtml()); }
    if (req.url === '/stream-config') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(streamConfig())); }
    if (req.method === 'POST' && req.url === '/view/reload') {
      const ra = String(req.socket.remoteAddress || '');
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ra)) { res.writeHead(403); return res.end(); }
      const page = state.current?.cdpPage;
      if (!page) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end('{"error":"no cdp page (x11 capture or not streaming)"}'); }
      page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 })
        .then(() => { log('view reloaded'); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); })
        .catch((e) => { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e?.message ?? e) })); });
      return;
    }
    if (req.url === '/api/current') {
      const c = state.current;
      if (!c || !c.tableId) {
        // "starting soon": overlay still shows open cash seats + the game time
        fetch(`${API_BASE}/api/poker/bot-cash`, { signal: AbortSignal.timeout(5000) })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .then((cash) => {
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            const outro = Boolean(c?.outroUntil);
            const nextAt = outro ? state.nextSlotAt : (c?.scheduledAt ?? state.nextSlotAt ?? null);
            res.end(JSON.stringify({
              pending: true,
              phase: outro ? 'outro' : 'preroll',
              scheduledAt: outro ? null : (c?.scheduledAt ?? null),
              meta: {
                kind: 'pending',
                cashTables: Array.isArray(cash?.tables) ? cash.tables : [],
                nextGame: nextAt ? { at: nextAt, buyIn: state.buyIn, freeEntry: state.freeEntry === true } : null,
                freeEntry: state.freeEntry === true,
              },
            }));
          });
        return;
      }
      fetch(`${API_BASE}/api/poker/bot-schedule/table/${c.tableId}/state`, { signal: AbortSignal.timeout(8000) })
        .then(async (r) => { res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(await r.text()); })
        .catch((e) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e?.message ?? e) })); });
      return;
    }
    if ((req.url || '').startsWith('/promos/')) {
      const pf = promoFile(req.url);
      if (!pf) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': pf.type, 'cache-control': 'public, max-age=3600' });
      return fs.createReadStream(pf.file).pipe(res);
    }
    if (req.method === 'POST' && /^\/push\/restart(\?.*)?$/.test(req.url || '')) {
      const ra = String(req.socket.remoteAddress || '');
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ra)) { res.writeHead(403); return res.end(); }
      if (MODE !== 'cash') { res.writeHead(409, { 'content-type': 'application/json' }); return res.end('{"error":"cash mode only"}'); }
      const gap = Math.min(600, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('gap')) || 20));
      if (state.current) restartOrStop(state.current, 'manual restart', gap * 1000);
      else if (!state.restartAt) setTimeout(() => { if (!state.current) startCash(); }, gap * 1000);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, gapSeconds: gap }));
    }
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
    if (req.url === '/status') {
      const c = state.current;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        enabled: ENABLED,
        mode: MODE,
        capture: CAPTURE,
        pushing: Boolean(c?.ff?.proc && c.ff.proc.exitCode == null),
        lastFrameAgeMs: c?.lastFrameAt ? Date.now() - c.lastFrameAt : null,
        restartAt: state.restartAt ? new Date(state.restartAt).toISOString() : null,
        hasStreamKey: Boolean(env('X_RTMP_URL', '') && env('X_STREAM_KEY', '')),
        apiBase: API_BASE,
        lastPoll: state.lastPoll,
        lastError: state.lastError,
        current: c ? { tournamentId: c.tournamentId, tableId: c.tableId, slotKey: c.slotKey, startedAt: new Date(c.startedAt).toISOString(), dry: c.dry, outro: Boolean(c.outroUntil) } : null,
        history: state.history,
      }));
    }
    res.writeHead(404); res.end();
  })
  .listen(PORT, () => log('stream worker up', { enabled: ENABLED, apiBase: API_BASE, siteUrl: SITE_URL }));

if (isMain) {
  const shutdown = () => { stopStream('shutdown'); try { xvfb?.kill(); } catch {} setTimeout(() => process.exit(0), 1500); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  setInterval(poll, POLL_MS);
  poll();
  if (MODE === 'cash') startCash();
}
