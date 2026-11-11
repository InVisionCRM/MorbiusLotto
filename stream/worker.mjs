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
 *
 * Never logs the RTMP URL or key.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const VIEW_HTML = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'view.html'));

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
export function musicInputArgs({ enabled = MUSIC_ENABLED, dir = MUSIC_DIR, url = MUSIC_URL, maxMin = MAX_MIN, rng = Math.random } = {}) {
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

function startStream(game) {
  const target = rtmpTarget();
  const name = String(game.slotKey || '').split(' ')[1] || '';
  const url = `http://127.0.0.1:${PORT}/view?name=${encodeURIComponent(`Beat the Bots ${name} ET`)}`;
  if (!target) {
    log('dry run: would stream game (STREAM_ENABLED=0 or X_RTMP_URL/X_STREAM_KEY missing)', { tournamentId: game.tournamentId, url });
    state.current = { ...game, dry: true, startedAt: Date.now(), procs: [] };
    return;
  }
  ensureXvfb();
  const browser = spawn(
    env('CHROMIUM_BIN', 'chromium'),
    [
      '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--noerrdialogs',
      '--disable-infobars', '--autoplay-policy=no-user-gesture-required', '--kiosk',
      `--window-size=${W},${H}`, '--window-position=0,0', url,
    ],
    { env: { ...process.env, DISPLAY }, stdio: 'ignore' },
  );
  const isFile = !ENABLED;
  const audio = musicInputArgs();
  log('audio', { music: audio.music, tracks: audio.tracks, volume: audio.music ? MUSIC_VOLUME : 0 });
  const ffArgs = [
    '-hide_banner', '-loglevel', 'warning',
    '-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', `${DISPLAY}.0`,
    ...audio.args,
    '-map', '0:v:0', '-map', '1:a:0',
    ...(audio.music ? ['-af', `volume=${MUSIC_VOLUME},aresample=44100:async=1`] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
    '-b:v', `${KBPS}k`, '-maxrate', `${KBPS}k`, '-bufsize', `${KBPS * 2}k`, '-g', String(FPS * 2),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', ...(isFile ? ['-y'] : []), target,
  ];
  // Give the page a few seconds to render before pushing.
  const ff = { proc: null };
  const timer = setTimeout(() => {
    ff.proc = spawn('ffmpeg', ffArgs, { env: { ...process.env, DISPLAY }, stdio: ['ignore', 'ignore', 'pipe'] });
    ff.proc.stderr.on('data', (d) => {
      const s = String(d).replace(/rtmps?:\/\/\S+/g, '<rtmp>');
      log('ffmpeg', { line: s.trim().slice(0, 300) });
    });
    const spawnedAt = Date.now();
    ff.proc.on('exit', (code) => {
      log('ffmpeg exited', { code });
      // Safety net: if ffmpeg dies right away while music is on, retry once with silence
      // so a bad track / demuxer problem can never take the broadcast down.
      if (audio.music && !ff.retried && Date.now() - spawnedAt < 30_000 &&
          state.current && state.current.tournamentId === game.tournamentId && !state.current.stopping) {
        ff.retried = true;
        log('ffmpeg failed early with music; retrying with silence');
        const silent = musicInputArgs({ enabled: false });
        const args = [...ffArgs];
        args.splice(ffArgs.indexOf(audio.args[0]), audio.args.length, ...silent.args);
        const ai = args.indexOf('-af'); if (ai >= 0) args.splice(ai, 2);
        ff.proc = spawn('ffmpeg', args, { env: { ...process.env, DISPLAY }, stdio: ['ignore', 'ignore', 'pipe'] });
        ff.proc.stderr.on('data', (d) => log('ffmpeg', { line: String(d).replace(/rtmps?:\/\/\S+/g, '<rtmp>').trim().slice(0, 300) }));
        ff.proc.on('exit', (c2) => {
          log('ffmpeg exited', { code: c2 });
          if (state.current && state.current.tournamentId === game.tournamentId && !state.current.stopping) {
            state.lastError = `ffmpeg exited ${c2}`;
            stopStream('ffmpeg exited');
          }
        });
        return;
      }
      if (state.current && state.current.tournamentId === game.tournamentId && !state.current.stopping) {
        state.lastError = `ffmpeg exited ${code}`;
        stopStream('ffmpeg exited');
      }
    });
  }, 8000);
  state.current = { ...game, dry: false, startedAt: Date.now(), browser, ff, timer, url, toFile: isFile };
  log('stream started', { tournamentId: game.tournamentId, tableId: game.tableId, url, toFile: isFile });
}

function stopStream(reason) {
  const cur = state.current;
  if (!cur) return;
  cur.stopping = true;
  clearTimeout(cur.timer);
  try { cur.ff?.proc?.kill('SIGINT'); } catch {}
  try { cur.browser?.kill('SIGTERM'); } catch {}
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
    state.lastError = null;
    const games = Array.isArray(body.games) ? body.games : [];
    const cur = state.current;
    if (cur) {
      const g = games.find((x) => x.tournamentId === cur.tournamentId);
      const done = !g || ['completed', 'cancelled', 'finished'].includes(String(g.tournamentStatus));
      if (done) stopStream('tournament finished');
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
    if (viewM) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(VIEW_HTML); }
    if (req.url === '/api/current') {
      const c = state.current;
      if (!c || !c.tableId) {
        // "starting soon": overlay still shows open cash seats + the game time
        fetch(`${API_BASE}/api/poker/bot-cash`, { signal: AbortSignal.timeout(5000) })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .then((cash) => {
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify({
              pending: true,
              scheduledAt: c?.scheduledAt ?? null,
              meta: {
                kind: 'pending',
                cashTables: Array.isArray(cash?.tables) ? cash.tables : [],
                nextGame: c?.scheduledAt ? { at: c.scheduledAt, buyIn: state.buyIn } : null,
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
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
    if (req.url === '/status') {
      const c = state.current;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        enabled: ENABLED,
        hasStreamKey: Boolean(env('X_RTMP_URL', '') && env('X_STREAM_KEY', '')),
        apiBase: API_BASE,
        lastPoll: state.lastPoll,
        lastError: state.lastError,
        current: c ? { tournamentId: c.tournamentId, tableId: c.tableId, slotKey: c.slotKey, startedAt: new Date(c.startedAt).toISOString(), dry: c.dry } : null,
        history: state.history,
      }));
    }
    res.writeHead(404); res.end();
  })
  .listen(PORT, () => log('stream worker up', { enabled: ENABLED, apiBase: API_BASE, siteUrl: SITE_URL }));

if (isMain) {
  process.on('SIGTERM', () => { stopStream('shutdown'); try { xvfb?.kill(); } catch {} process.exit(0); });
  setInterval(poll, POLL_MS);
  poll();
}
