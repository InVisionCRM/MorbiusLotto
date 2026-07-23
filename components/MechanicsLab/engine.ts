/**
 * SlotEngine — a framework-agnostic slot mechanics engine + canvas renderer.
 *
 * This is NOT a gambling game: no bets, no wallet, no payouts of value. It is a
 * visual mechanics prototype: grids, spins, win evaluation (lines / ways /
 * cluster / scatter-pays), cascades, wild behaviors, respins, bonus overlays
 * and meta systems — each driven by a MechanicConfig from mechanics.ts.
 *
 * Phases: idle → spinning → stopping → evaluating → (cascading…) → settled.
 * Bonus overlays (free spins / pick / wheel / gamble / adventure / battle)
 * run as a state machine drawn over the stage and fed clicks from the canvas.
 */

/* ═══════════════ types ═══════════════ */

export interface SymbolDef {
  id: string;
  name: string;
  color: string;
  rarity: number;   // weight in the RNG bag
  payout: number;   // per-symbol base pay (3+ of a kind, arbitrary demo units)
  behavior: string; // human description for the inspector
}

export interface MechanicConfig {
  cols: number;
  rows: number;                 // base rows (per-reel heights may vary)
  megaways?: boolean;           // randomize per-reel heights 2..rows each spin
  winMode: 'lines' | 'ways' | 'cluster' | 'scatterpays';
  linesCount?: number;
  cascades?: boolean;
  cascadeLadder?: number[];     // multiplier per chain step, last repeats
  endlessLadder?: boolean;      // ladder keeps climbing +1 past the end
  feature?: string;             // per-mechanic behavior key (see applyFeature)
  splitReels?: boolean;         // random cells hold 2 half-symbols (double ways)
  layered?: boolean;            // faint second layer behind the main grid
  expandingGrid?: boolean;      // +1 row per winning cascade, up to maxRows
  maxRows?: number;
  infinityReels?: boolean;      // +1 reel per consecutive win, up to maxCols
  maxCols?: number;
  hitBoost?: number;            // 0..1 — force-match chance so demos demo
  overlay?: OverlayKind;        // bonus overlay launched by the Feature button
  autoOverlay?: boolean;        // launch overlay on 3+ scatters
  meta?: 'progressive' | 'tiered' | 'mystery' | 'collection' | 'achievements' | 'level' | 'upgrade';
}

export type OverlayKind =
  | 'freespins' | 'retrigger' | 'expandingfs' | 'pick' | 'wheel'
  | 'gamble' | 'choice' | 'adventure' | 'battle' | 'holdwin';

export interface Cell {
  sym: string;
  offY: number;         // px offset for drop physics
  velY: number;
  scale: number;
  alpha: number;
  win: boolean;
  popT: number;         // 0..1 pop-out animation when removed
  mult: number;         // symbol multiplier badge (x2, x3…)
  sticky: number;       // spins remaining stuck
  badge: string;        // small state label (STICKY, WALK…)
  split?: [string, string] | null;
  born: number;
}

interface WinInfo {
  total: number;
  breakdown: string[];
  cells: Set<string>;     // "c,r" keys
  lines: number[][][];    // polylines of [c,r] to draw
  waysCount: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; }

export interface Snapshot {
  phase: string;
  cols: number;
  rowsPerCol: number[];
  winMode: string;
  ways: number;
  multiplier: number;
  chain: number;
  modifiers: string[];
  lastWin: { total: number; breakdown: string[] };
  feature: string;
  overlay: string | null;
  spins: number;
  freeSpins: number;
  meta: Record<string, number | string>;
  log: string[];
}

/* ═══════════════ symbol set (drawn as vector art — no image assets) ═══════════════ */

export const SYMBOLS: SymbolDef[] = [
  { id: 'gem',     name: 'Gem',     color: '#22d3ee', rarity: 22, payout: 5,  behavior: 'Standard symbol' },
  { id: 'star',    name: 'Star',    color: '#f5c343', rarity: 20, payout: 8,  behavior: 'Standard symbol' },
  { id: 'moon',    name: 'Moon',    color: '#b28dff', rarity: 18, payout: 10, behavior: 'Standard symbol' },
  { id: 'bolt',    name: 'Bolt',    color: '#2ee98f', rarity: 16, payout: 12, behavior: 'Standard symbol' },
  { id: 'ring',    name: 'Ring',    color: '#ff8e4d', rarity: 12, payout: 18, behavior: 'Standard symbol' },
  { id: 'crown',   name: 'Crown',   color: '#ff3df0', rarity: 8,  payout: 30, behavior: 'Premium symbol' },
  { id: 'wild',    name: 'Wild',    color: '#ffffff', rarity: 0,  payout: 0,  behavior: 'Substitutes for any pay symbol' },
  { id: 'scatter', name: 'Scatter', color: '#ffd76a', rarity: 0,  payout: 0,  behavior: 'Pays/triggers anywhere' },
  { id: 'mystery', name: 'Mystery', color: '#8aa3b8', rarity: 0,  payout: 0,  behavior: 'Reveals as one shared symbol' },
  { id: 'coin',    name: 'Coin',    color: '#ffd76a', rarity: 0,  payout: 0,  behavior: 'Collectible value symbol' },
];
const SYM: Record<string, SymbolDef> = Object.fromEntries(SYMBOLS.map(s => [s.id, s]));
const BASE_PAYOUTS: Record<string, number> = Object.fromEntries(SYMBOLS.map(s => [s.id, s.payout]));
const PAYING = SYMBOLS.filter(s => s.rarity > 0).map(s => s.id);

/* mulberry32 — seedable so demos can be replayed */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (c: number, r: number) => `${c},${r}`;
const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const LOCK_COLOR = '#f5b23c';   // amber, matches the slots-lab SHIELD LOCK frame

/* ═══════════════ the engine ═══════════════ */

export class SlotEngine {
  cfg: MechanicConfig;
  mechanicId = '';
  private rand = rng(Date.now() & 0xffff);

  cols = 5;
  rowsPerCol: number[] = [];
  grid: Cell[][] = [];          // [col][row]
  phase = 'idle';
  chain = 0;
  multiplier = 1;
  lastWin: WinInfo = { total: 0, breakdown: [], cells: new Set(), lines: [], waysCount: 0 };
  spins = 0;
  freeSpins = 0;
  inFreeSpins = false;
  modifiers: string[] = [];
  log: string[] = [];
  meta: Record<string, number | string> = {};
  private consecutiveWins = 0;
  private walkers: { c: number; r: number }[] = [];
  private stickies = new Set<string>();

  /* render state */
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private lastT = 0;
  private spinStart: number[] = [];   // wall-clock ms each reel began its ride
  private spinDur: number[] = [];     // ms until this reel decelerates to rest
  private colSettle: number[] = [];   // 0..1 landing-bounce progress after the ride
  private strip: string[][] = [];     // scroll strips per col: [result rows…, cruise fillers…]
  private particles: Particle[] = [];
  private shake = 0;
  private floatTexts: { x: number; y: number; text: string; t: number; color: string }[] = [];
  overlay: { kind: OverlayKind; state: any } | null = null;
  private version = 0;
  onChange: (() => void) | null = null;

  constructor(cfg: MechanicConfig, mechanicId: string) {
    this.cfg = cfg;
    this.mechanicId = mechanicId;
    this.reset();
  }

  /* ── lifecycle ── */

  reset() {
    SYMBOLS.forEach(s => { s.payout = BASE_PAYOUTS[s.id]; }); // undo any upgrade-system paytable edits
    const c = this.cfg;
    this.cols = c.cols;
    this.rowsPerCol = Array.from({ length: c.cols }, () => c.rows);
    if (c.megaways) this.rollMegaways();
    this.grid = this.rowsPerCol.map((rows, ci) =>
      Array.from({ length: rows }, (_, ri) => this.freshCell(this.randomSymbol(), ci, ri)));
    this.phase = 'idle'; this.chain = 0; this.multiplier = 1;
    this.lastWin = { total: 0, breakdown: [], cells: new Set(), lines: [], waysCount: 0 };
    this.spins = 0; this.freeSpins = 0; this.inFreeSpins = false;
    this.consecutiveWins = 0; this.walkers = []; this.stickies.clear();
    this.particles = []; this.floatTexts = []; this.overlay = null;
    this.modifiers = this.baseModifiers();
    this.meta = this.initMeta();
    this.log = [`loaded ${this.mechanicId}`];
    this.applyFeature('init');
    this.spinStart = this.grid.map(() => 0);
    this.spinDur = this.grid.map(() => 0);
    this.colSettle = this.grid.map(() => 1);
    this.strip = this.grid.map(() => []);
    this.bump();
  }

  reseed(seed: number) { this.rand = rng(seed); this.pushLog(`reseeded ${seed}`); }

  private baseModifiers(): string[] {
    const m: string[] = [];
    const c = this.cfg;
    if (c.cascades) m.push('cascades');
    if (c.megaways) m.push('megaways');
    if (c.splitReels) m.push('split reels');
    if (c.layered) m.push('multi-layer');
    if (c.expandingGrid) m.push('expanding grid');
    if (c.infinityReels) m.push('infinity reels');
    if (c.feature) m.push(c.feature);
    if (c.meta) m.push(`meta:${c.meta}`);
    return m;
  }

  private initMeta(): Record<string, number | string> {
    switch (this.cfg.meta) {
      case 'progressive': return { meter: 0, target: 100, jackpots: 0 };
      case 'tiered': return { mini: 250, minor: 1250, major: 8000, grand: 42000 };
      case 'mystery': return { pot: 40 + Math.floor(this.rand() * 30), dropBy: 100 };
      case 'collection': return { gems: 0, stars: 0, crowns: 0, reward: 0 };
      case 'achievements': return { unlocked: 0, total: 6 };
      case 'level': return { level: 1, xp: 0, next: 50 };
      case 'upgrade': return { coins: 60, gemLvl: 1, starLvl: 1, crownLvl: 1 };
      default: return {};
    }
  }

  private freshCell(sym: string, _c: number, _r: number): Cell {
    return { sym, offY: 0, velY: 0, scale: 1, alpha: 1, win: false, popT: 0, mult: 1, sticky: 0, badge: '', split: null, born: performance.now() };
  }

  private randomSymbol(exclude: string[] = []): string {
    const bag = SYMBOLS.filter(s => s.rarity > 0 && !exclude.includes(s.id));
    const total = bag.reduce((a, s) => a + s.rarity, 0);
    let roll = this.rand() * total;
    for (const s of bag) { roll -= s.rarity; if (roll <= 0) return s.id; }
    return bag[0].id;
  }

  private rollMegaways() {
    this.rowsPerCol = this.rowsPerCol.map(() => 2 + Math.floor(this.rand() * (this.cfg.rows - 1)));
  }

  /* ── spin ── */

  spin(): boolean {
    if (this.phase !== 'idle' && this.phase !== 'settled') return false;
    if (this.overlay) return false;
    this.spins++;
    this.chain = 0;
    this.multiplier = this.cfg.cascadeLadder ? this.cfg.cascadeLadder[0] : 1;
    this.lastWin = { total: 0, breakdown: [], cells: new Set(), lines: [], waysCount: 0 };
    if (this.cfg.megaways) { this.rollMegaways(); this.pushLog(`megaways: heights ${this.rowsPerCol.join('·')}`); }
    if (this.cfg.expandingGrid) { this.rowsPerCol = this.rowsPerCol.map(() => this.cfg.rows); }
    this.applyFeature('preSpin');

    /* build landing grid (keep stickies in place) */
    const next: Cell[][] = this.rowsPerCol.map((rows, ci) =>
      Array.from({ length: rows }, (_, ri) => {
        const old = this.grid[ci]?.[ri];
        if (old && old.sticky > 0) {
          if (old.sticky < 900) {                                  // 900+ = permanent hold (hold & win)
            old.sticky--;
            if (old.sticky === 0) old.badge = '';
            else if (old.badge.startsWith('STICKY')) old.badge = `STICKY ${old.sticky}`;  // live countdown
          }
          old.win = false; old.offY = 0; old.velY = 0; old.popT = 0;
          return old;
        }
        return this.freshCell(this.randomSymbol(), ci, ri);
      }));
    this.grid = next;
    this.applyFeature('populate');
    if (this.cfg.hitBoost && this.rand() < this.cfg.hitBoost) this.forceWin();
    if (this.cfg.splitReels) this.applySplits();

    /* spin animation state — each reel is a strip that scrolls down and
       decelerates onto its result. Strip = [result rows…, cruise fillers…];
       the ride lands with the result rows exactly in the window (no snap). */
    const now = performance.now();
    this.strip = this.grid.map((col, ci) => {
      const cruise = Array.from({ length: 16 + ci * 3 }, () => this.randomSymbol());
      return [...col.map(c => c.sym), ...cruise];
    });
    this.spinStart = this.grid.map(() => now);
    this.spinDur = this.grid.map((_, ci) => 620 + ci * 190);   // staggered stops, snappy for the lab
    this.colSettle = this.grid.map(() => 0);
    this.phase = 'spinning';
    this.pushLog(`spin #${this.spins}`);
    this.bump();
    return true;
  }

  private forceWin() {
    /* plant a guaranteed match so the demo shows its mechanic */
    const sym = this.randomSymbol();
    const n = this.cfg.winMode === 'cluster' || this.cfg.winMode === 'scatterpays'
      ? 5 + Math.floor(this.rand() * 4)
      : 3 + Math.floor(this.rand() * (this.cols - 2));
    if (this.cfg.winMode === 'cluster' || this.cfg.winMode === 'scatterpays') {
      let c = Math.floor(this.rand() * Math.max(1, this.cols - 2)), r = Math.floor(this.rand() * Math.max(1, this.rowsPerCol[0] - 2));
      const seen = new Set<string>();
      let placed = 0; const frontier = [[c, r]];
      while (frontier.length && placed < n) {
        const [cc, rr] = frontier.shift()!;
        if (cc < 0 || cc >= this.cols || rr < 0 || rr >= this.rowsPerCol[cc]) continue;
        if (seen.has(key(cc, rr))) continue;
        seen.add(key(cc, rr));
        this.grid[cc][rr].sym = sym; placed++;
        frontier.push([cc + 1, rr], [cc, rr + 1], [cc - 1, rr], [cc, rr - 1]);
      }
    } else {
      for (let c = 0; c < n; c++) {
        const r = Math.floor(this.rand() * this.rowsPerCol[c]);
        this.grid[c][r].sym = sym;
      }
      if (this.cfg.winMode === 'lines') for (let c = 0; c < n; c++) this.grid[c][Math.floor(this.rowsPerCol[c] / 2)].sym = sym;
    }
  }

  private applySplits() {
    for (let c = 0; c < this.cols; c++)
      for (let r = 0; r < this.rowsPerCol[c]; r++) {
        const cell = this.grid[c][r];
        cell.split = this.rand() < 0.22 && PAYING.includes(cell.sym)
          ? [cell.sym, this.randomSymbol()] : null;
        if (cell.split) cell.badge = 'SPLIT';
      }
  }

  /* ── evaluation ── */

  private evaluate(): WinInfo {
    const mode = this.cfg.winMode;
    const win: WinInfo = { total: 0, breakdown: [], cells: new Set(), lines: [], waysCount: this.waysCount() };
    const symAt = (c: number, r: number): string[] => {
      const cell = this.grid[c]?.[r];
      if (!cell) return [];
      if (cell.split) return cell.split;
      return [cell.sym];
    };
    const matches = (s: string, target: string) => s === target || s === 'wild';

    if (mode === 'lines') {
      const lines = this.paylines();
      lines.forEach((line, li) => {
        const first = symAt(line[0][0], line[0][1]).find(s => s !== 'wild') ?? symAt(line[0][0], line[0][1])[0];
        let target = first === 'wild' ? '' : first;
        let run = 0;
        for (const [c, r] of line) {
          const syms = symAt(c, r);
          if (!target) { const nonWild = syms.find(s => s !== 'wild' && PAYING.includes(s)); if (nonWild) target = nonWild; }
          if (syms.some(s => matches(s, target || 'wild')) && (target ? PAYING.includes(target) : true)) run++;
          else break;
        }
        if (run >= 3 && target) {
          const cellMult = line.slice(0, run).reduce((m, [c, r]) => m * (this.grid[c]?.[r]?.mult ?? 1), 1);
          const pay = (SYM[target]?.payout ?? 5) * run * cellMult;
          win.total += pay;
          win.breakdown.push(`line ${li + 1}: ${run}× ${SYM[target]?.name}${cellMult > 1 ? ` ×${cellMult}` : ''} = ${pay}`);
          line.slice(0, run).forEach(([c, r]) => win.cells.add(key(c, r)));
          win.lines.push(line.slice(0, run));
        }
      });
    } else if (mode === 'ways') {
      for (const target of PAYING) {
        let ways = 1, run = 0;
        const runCells: [number, number][] = [];
        for (let c = 0; c < this.cols; c++) {
          let count = 0;
          for (let r = 0; r < this.rowsPerCol[c]; r++)
            for (const s of symAt(c, r)) if (matches(s, target)) { count++; runCells.push([c, r]); }
          if (count === 0) break;
          ways *= count; run++;
        }
        if (run >= 3) {
          const pay = SYM[target].payout * run * ways;
          win.total += pay;
          win.breakdown.push(`${SYM[target].name}: ${run} reels × ${ways} ways = ${pay}`);
          runCells.filter(([c]) => c < run).forEach(([c, r]) => win.cells.add(key(c, r)));
        }
      }
    } else if (mode === 'cluster') {
      const seen = new Set<string>();
      for (let c = 0; c < this.cols; c++)
        for (let r = 0; r < this.rowsPerCol[c]; r++) {
          const k0 = key(c, r);
          if (seen.has(k0)) continue;
          const sym = this.grid[c][r].sym;
          if (!PAYING.includes(sym)) continue;
          const cluster: [number, number][] = [];
          const stack: [number, number][] = [[c, r]];
          const local = new Set<string>();
          while (stack.length) {
            const [cc, rr] = stack.pop()!;
            const kk = key(cc, rr);
            if (local.has(kk)) continue;
            const cell = this.grid[cc]?.[rr];
            if (!cell || (cell.sym !== sym && cell.sym !== 'wild')) continue;
            local.add(kk); cluster.push([cc, rr]);
            stack.push([cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]);
          }
          local.forEach(k1 => seen.add(k1));
          if (cluster.length >= 5) {
            const pay = SYM[sym].payout * cluster.length;
            win.total += pay;
            win.breakdown.push(`cluster: ${cluster.length}× ${SYM[sym].name} = ${pay}`);
            cluster.forEach(([cc, rr]) => win.cells.add(key(cc, rr)));
          }
        }
    } else { /* scatterpays: 8+ of a symbol anywhere */
      for (const target of PAYING) {
        const cells: [number, number][] = [];
        for (let c = 0; c < this.cols; c++)
          for (let r = 0; r < this.rowsPerCol[c]; r++)
            if (this.grid[c][r].sym === target || this.grid[c][r].sym === 'wild') cells.push([c, r]);
        if (cells.length >= 8) {
          const pay = SYM[target].payout * cells.length;
          win.total += pay;
          win.breakdown.push(`${cells.length}× ${SYM[target].name} anywhere = ${pay}`);
          cells.forEach(([c, r]) => win.cells.add(key(c, r)));
        }
      }
    }

    /* scatter counting (feature triggers) */
    let scatters = 0;
    for (let c = 0; c < this.cols; c++)
      for (let r = 0; r < this.rowsPerCol[c]; r++) if (this.grid[c][r].sym === 'scatter') scatters++;
    if (scatters >= 3) win.breakdown.push(`${scatters}× scatter — feature trigger`);
    (win as any).scatters = scatters;

    win.total = Math.round(win.total * this.multiplier);
    if (this.multiplier > 1 && win.total > 0) win.breakdown.push(`chain multiplier ×${this.multiplier}`);
    return win;
  }

  waysCount(): number {
    if (this.cfg.winMode !== 'ways' && !this.cfg.megaways) {
      if (this.cfg.winMode === 'lines') return this.cfg.linesCount ?? 5;
      return 0;
    }
    return this.rowsPerCol.reduce((a, r) => a * (r * (this.cfg.splitReels ? 2 : 1)), 1);
  }

  private paylines(): [number, number][][] {
    const n = this.cfg.linesCount ?? 5;
    const rows = Math.min(...this.rowsPerCol);
    const lines: [number, number][][] = [];
    const mid = Math.floor(rows / 2);
    const patterns: number[][] = [];
    for (let r = 0; r < rows; r++) patterns.push(Array(this.cols).fill(r));           // straights
    patterns.push(Array.from({ length: this.cols }, (_, c) => Math.min(rows - 1, Math.abs(c - Math.floor(this.cols / 2)) === 0 ? rows - 1 : mid ? c % rows : 0)));
    patterns.push(Array.from({ length: this.cols }, (_, c) => c % 2 === 0 ? 0 : rows - 1));      // zigzag
    patterns.push(Array.from({ length: this.cols }, (_, c) => c % 2 === 0 ? rows - 1 : 0));      // inverse zigzag
    patterns.push(Array.from({ length: this.cols }, (_, c) => Math.min(c, rows - 1)));           // diagonal
    patterns.push(Array.from({ length: this.cols }, (_, c) => Math.max(0, rows - 1 - c)));       // anti-diagonal
    while (patterns.length < n) {
      patterns.push(Array.from({ length: this.cols }, () => Math.floor(this.rand() * rows)));
    }
    for (let i = 0; i < Math.min(n, patterns.length); i++)
      lines.push(patterns[i].map((r, c) => [c, Math.min(r, this.rowsPerCol[c] - 1)] as [number, number]));
    return lines;
  }

  /* ── cascade resolution ── */

  private resolveWins() {
    const win = this.evaluate();
    this.applyFeature('postEvaluate', win);
    if (win.total > 0 || win.cells.size > 0) {
      this.consecutiveWins++;
      this.lastWin.total += win.total;
      this.lastWin.breakdown = [...this.lastWin.breakdown, ...win.breakdown];
      this.lastWin.cells = win.cells;
      this.lastWin.lines = win.lines;
      this.lastWin.waysCount = win.waysCount;
      win.cells.forEach(k0 => {
        const [c, r] = k0.split(',').map(Number);
        if (this.grid[c]?.[r]) this.grid[c][r].win = true;
      });
      this.spawnWinFX(win);
      this.metaOnWin(win);
      this.pushLog(`win +${win.total}${this.chain ? ` (chain ${this.chain})` : ''}`);
      if (win.total >= 300) this.shake = 1;
      if (this.cfg.cascades) {
        this.phase = 'cascading';
        setTimeout(() => this.popAndDrop(), 620);
      } else {
        this.finishSpin(true);
      }
    } else {
      if (this.chain > 0) this.pushLog(`cascade dry after ${this.chain} chains`);
      const wonThisSpin = this.lastWin.total > 0;
      if (!wonThisSpin) this.consecutiveWins = 0;
      this.finishSpin(wonThisSpin);
    }
    this.bump();
  }

  private popAndDrop() {
    /* pop winning cells */
    this.lastWin.cells.forEach(k0 => {
      const [c, r] = k0.split(',').map(Number);
      const cell = this.grid[c]?.[r];
      if (cell) { cell.popT = 0.0001; this.burst(c, r, SYM[cell.sym]?.color ?? '#fff', 10); }
    });
    setTimeout(() => {
      /* remove winners, drop survivors by exactly the rows they fall, refill from above */
      for (let c = 0; c < this.cols; c++) {
        const survivors: { cell: Cell; oldR: number }[] = [];
        this.grid[c].forEach((cell, r) => { if (!this.lastWin.cells.has(key(c, r))) survivors.push({ cell, oldR: r }); });
        const freshCount = this.rowsPerCol[c] - survivors.length;
        const col: Cell[] = [];
        for (let i = 0; i < freshCount; i++) {
          const cell = this.freshCell(this.randomSymbol(), c, i);
          cell.offY = -((freshCount - i) * 90 + 80);
          col.push(cell);
        }
        survivors.forEach(({ cell, oldR }, i) => {
          const newR = freshCount + i;
          if (newR !== oldR) cell.offY = -(newR - oldR) * 90;
          col.push(cell);
        });
        this.grid[c] = col;
      }
      this.chain++;
      const ladder = this.cfg.cascadeLadder;
      if (ladder) {
        this.multiplier = this.chain < ladder.length ? ladder[this.chain]
          : (this.cfg.endlessLadder ? ladder[ladder.length - 1] + (this.chain - ladder.length + 1) : ladder[ladder.length - 1]);
        this.floatText(`×${this.multiplier}`, 0.5, 0.12, '#ffd76a');
      }
      if (this.cfg.expandingGrid && this.rowsPerCol[0] < (this.cfg.maxRows ?? this.cfg.rows + 3)) {
        this.rowsPerCol = this.rowsPerCol.map(r => r + 1);
        for (let c = 0; c < this.cols; c++) {
          const cell = this.freshCell(this.randomSymbol(), c, 0);
          cell.offY = -140;
          this.grid[c].unshift(cell);
        }
        this.pushLog(`grid expands to ${this.rowsPerCol[0]} rows`);
      }
      this.lastWin.cells = new Set();
      this.grid.flat().forEach(cell => { cell.win = false; });
      this.phase = 'dropping';
      setTimeout(() => this.resolveWins(), 700);
      this.bump();
    }, 420);
  }

  private finishSpin(won: boolean) {
    this.applyFeature('postSpin', won);
    /* infinity reels: growing board on consecutive wins */
    if (this.cfg.infinityReels) {
      const max = this.cfg.maxCols ?? this.cols + 3;
      if (won && this.cols < max) {
        this.cols++;
        this.rowsPerCol.push(this.cfg.rows);
        this.grid.push(Array.from({ length: this.cfg.rows }, () => {
          const cell = this.freshCell(this.randomSymbol(), this.cols - 1, 0);
          cell.offY = -160; return cell;
        }));
        this.spinStart.push(0); this.spinDur.push(0); this.colSettle.push(1); this.strip.push([]);
        this.pushLog(`+1 reel — now ${this.cols} (infinity)`);
      } else if (!won && this.cols > this.cfg.cols) {
        this.cols = this.cfg.cols;
        this.rowsPerCol = this.rowsPerCol.slice(0, this.cols);
        this.grid = this.grid.slice(0, this.cols);
        this.pushLog('reset to base reels');
      }
    }
    /* scatter-triggered overlay */
    const scatters = (this.lastWin as any).scatters ?? 0;
    if (this.cfg.autoOverlay && this.cfg.overlay && scatters >= 3 && !this.overlay) {
      setTimeout(() => this.launchOverlay(this.cfg.overlay!), 500);
    }
    /* free spins auto-continue */
    if (this.inFreeSpins && this.freeSpins > 0) {
      this.phase = 'settled';
      setTimeout(() => { if (this.inFreeSpins && this.freeSpins > 0) { this.freeSpins--; this.spin(); if (this.freeSpins === 0) { this.inFreeSpins = false; this.pushLog('free spins complete'); } } }, 900);
    } else {
      this.phase = 'settled';
    }
    this.bump();
  }

  /* ═══ per-mechanic feature behaviors — the heart of the showcase ═══ */

  private applyFeature(phase: 'init' | 'preSpin' | 'populate' | 'postEvaluate' | 'postSpin', arg?: any) {
    const f = this.cfg.feature;
    if (!f) return;
    const placeRandom = (sym: string, n: number, badge = '') => {
      for (let i = 0; i < n; i++) {
        const c = Math.floor(this.rand() * this.cols);
        const r = Math.floor(this.rand() * this.rowsPerCol[c]);
        this.grid[c][r].sym = sym;
        if (badge) this.grid[c][r].badge = badge;
      }
    };
    switch (f) {
      case 'wild-normal':
        if (phase === 'populate') placeRandom('wild', 1 + Math.floor(this.rand() * 2));
        break;
      case 'wild-stacked':
        if (phase === 'populate') {
          const c = 1 + Math.floor(this.rand() * (this.cols - 2));
          for (let r = 0; r < this.rowsPerCol[c]; r++) { this.grid[c][r].sym = 'wild'; this.grid[c][r].badge = 'STACK'; }
        }
        break;
      case 'wild-expanding':
        if (phase === 'populate') placeRandom('wild', 1, 'EXPAND');
        if (phase === 'postEvaluate') {
          for (let c = 0; c < this.cols; c++)
            if (this.grid[c].some(cell => cell.sym === 'wild' && cell.badge === 'EXPAND'))
              this.grid[c].forEach(cell => { if (cell.sym !== 'wild') { cell.sym = 'wild'; cell.scale = 0.2; cell.badge = ''; } });
          const w = this.evaluate();
          if (w.total > (arg?.total ?? 0)) { arg.total = w.total; arg.breakdown = w.breakdown; arg.cells = w.cells; arg.lines = w.lines; arg.breakdown.push('after wild expansion'); }
        }
        break;
      case 'wild-sticky':
        if (phase === 'populate' && this.rand() < 0.7) {
          const c = Math.floor(this.rand() * this.cols), r = Math.floor(this.rand() * this.rowsPerCol[c]);
          const cell = this.grid[c][r];
          cell.sym = 'wild'; cell.sticky = 3; cell.badge = 'STICKY 3';
        }
        if (phase === 'preSpin') this.grid.flat().forEach(cell => { if (cell.sticky > 0) cell.badge = `STICKY ${cell.sticky}`; });
        break;
      case 'wild-walking':
        if (phase === 'preSpin') {
          this.walkers = this.walkers.map(w => ({ c: w.c - 1, r: w.r })).filter(w => w.c >= 0);
        }
        if (phase === 'populate') {
          if (this.rand() < 0.5 && this.walkers.length < 2) this.walkers.push({ c: this.cols - 1, r: Math.floor(this.rand() * this.rowsPerCol[this.cols - 1]) });
          this.walkers.forEach(w => { const cell = this.grid[w.c]?.[Math.min(w.r, this.rowsPerCol[w.c] - 1)]; if (cell) { cell.sym = 'wild'; cell.badge = '← WALK'; } });
        }
        break;
      case 'wild-shifting':
        if (phase === 'preSpin') this.walkers = this.walkers.map(w => {
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(this.rand() * 4)];
          return { c: Math.max(0, Math.min(this.cols - 1, w.c + dirs[0])), r: Math.max(0, w.r + dirs[1]) };
        });
        if (phase === 'populate') {
          if (this.walkers.length === 0) this.walkers.push({ c: 2, r: 1 });
          this.walkers.forEach(w => { const cell = this.grid[w.c]?.[Math.min(w.r, this.rowsPerCol[w.c] - 1)]; if (cell) { cell.sym = 'wild'; cell.badge = 'SHIFT'; } });
        }
        break;
      case 'wild-random':
        if (phase === 'populate' && this.rand() < 0.8) {
          const n = 2 + Math.floor(this.rand() * 4);
          placeRandom('wild', n, 'RANDOM');
          this.pushLog(`${n} random wilds thrown on`);
        }
        break;
      case 'wild-multiplier':
        if (phase === 'populate') {
          const c = Math.floor(this.rand() * this.cols), r = Math.floor(this.rand() * this.rowsPerCol[c]);
          const cell = this.grid[c][r];
          cell.sym = 'wild'; cell.mult = [2, 3, 5][Math.floor(this.rand() * 3)]; cell.badge = `×${cell.mult}`;
        }
        break;
      case 'scatter-demo':
        if (phase === 'populate') placeRandom('scatter', 2 + Math.floor(this.rand() * 2));
        break;
      case 'mystery':
        if (phase === 'populate') placeRandom('mystery', 3 + Math.floor(this.rand() * 4), '?');
        if (phase === 'postEvaluate') {
          const reveal = this.randomSymbol();
          let n = 0;
          this.grid.flat().forEach(cell => { if (cell.sym === 'mystery') { cell.sym = reveal; cell.badge = ''; cell.scale = 0.3; n++; } });
          if (n) {
            const w = this.evaluate();
            arg.total = w.total; arg.breakdown = [...w.breakdown, `${n} mystery → ${SYM[reveal].name}`]; arg.cells = w.cells; arg.lines = w.lines;
            this.pushLog(`mystery reveals ${SYM[reveal].name}`);
          }
        }
        break;
      case 'transforming':
        if (phase === 'postEvaluate') {
          let n = 0;
          for (let c = 0; c < this.cols; c++)
            for (let r = 0; r < this.rowsPerCol[c]; r++)
              if (this.grid[c][r].sym === 'crown')
                [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].forEach(([cc, rr]) => {
                  const cell = this.grid[cc]?.[rr];
                  if (cell && ['gem', 'star'].includes(cell.sym)) { cell.sym = 'crown'; cell.scale = 0.3; n++; }
                });
          if (n) {
            const w = this.evaluate();
            if (w.total > (arg?.total ?? 0)) { arg.total = w.total; arg.breakdown = [...w.breakdown, `${n} symbols transformed to Crown`]; arg.cells = w.cells; arg.lines = w.lines; }
            this.pushLog(`${n} adjacent symbols transformed`);
          }
        }
        break;
      case 'collect':
        if (phase === 'populate') {
          for (let i = 0; i < 2 + Math.floor(this.rand() * 3); i++) {
            const c = Math.floor(this.rand() * this.cols), r = Math.floor(this.rand() * this.rowsPerCol[c]);
            const cell = this.grid[c][r];
            cell.sym = 'coin'; cell.mult = [5, 10, 25, 50][Math.floor(this.rand() * 4)]; cell.badge = String(cell.mult);
          }
        }
        if (phase === 'postEvaluate') {
          let sum = 0;
          this.grid.flat().forEach(cell => { if (cell.sym === 'coin') sum += cell.mult; });
          if (sum) {
            this.meta.collected = ((this.meta.collected as number) || 0) + sum;
            arg.breakdown = [...(arg.breakdown ?? []), `coins collected +${sum} (total ${this.meta.collected})`];
            arg.total += sum;
            this.pushLog(`coins +${sum}`);
          }
        }
        break;
      case 'symbol-multiplier':
        if (phase === 'populate')
          this.grid.flat().forEach(cell => { if (this.rand() < 0.12) { cell.mult = [2, 3, 5][Math.floor(this.rand() * 3)]; cell.badge = `×${cell.mult}`; } });
        break;
      case 'respin':
        if (phase === 'postSpin' && !arg && !this.modifiers.includes('respin-used')) {
          this.modifiers.push('respin-used');
          this.pushLog('near miss — reel 3 respins');
          setTimeout(() => {
            for (let r = 0; r < this.rowsPerCol[2]; r++) this.grid[2][r] = this.freshCell(this.randomSymbol(), 2, r);
            this.strip[2] = [...this.grid[2].map(cell => cell.sym), ...Array.from({ length: 14 }, () => this.randomSymbol())];
            this.spinStart[2] = performance.now(); this.spinDur[2] = 780; this.colSettle[2] = 0;
            this.phase = 'spinning';
            this.bump();
          }, 700);
        }
        if (phase === 'preSpin') this.modifiers = this.modifiers.filter(m => m !== 'respin-used');
        break;
      case 'locked-respin':
        if (phase === 'postEvaluate' && arg?.cells?.size > 0 && !this.inFreeSpins) {
          arg.cells.forEach((k0: string) => {
            const [c, r] = k0.split(',').map(Number);
            const cell = this.grid[c]?.[r];
            if (cell) { cell.sticky = 2; cell.badge = 'LOCKED'; }
          });
          this.pushLog('winning symbols locked for respins');
        }
        break;
      case 'holdwin-grid':
        if (phase === 'populate') {
          for (let i = 0; i < 1 + Math.floor(this.rand() * 3); i++) {
            const c = Math.floor(this.rand() * this.cols), r = Math.floor(this.rand() * this.rowsPerCol[c]);
            const cell = this.grid[c][r];
            if (cell.sticky === 0) { cell.sym = 'coin'; cell.mult = [5, 10, 25][Math.floor(this.rand() * 3)]; cell.badge = String(cell.mult); }
          }
        }
        if (phase === 'postEvaluate') {
          /* landed coins LOCK in place; a full grid pays the lot */
          let locked = 0, total = 0;
          this.grid.flat().forEach(cell => {
            if (cell.sym === 'coin') { cell.sticky = 999; locked++; total += cell.mult; }
          });
          const capacity = this.rowsPerCol.reduce((a, b) => a + b, 0);
          if (locked > 0) arg.breakdown = [...(arg.breakdown ?? []), `${locked} coins locked (bank ${total})`];
          if (locked >= capacity) {
            arg.total += total * 2;
            arg.breakdown.push(`FULL GRID! coin bank ×2 = ${total * 2}`);
            this.grid.flat().forEach(cell => { cell.sticky = 0; cell.badge = ''; });
            this.floatText('FULL GRID!', 0.5, 0.3, '#ffd76a');
            this.shake = 1;
          }
        }
        break;
      case 'win-mult-slam':
        if (phase === 'postEvaluate' && arg?.total > 0) {
          const slam = [2, 3, 5, 10][Math.floor(this.rand() * 4)];
          arg.total *= slam;
          arg.breakdown.push(`WIN SLAM ×${slam}`);
          this.floatText(`×${slam}!`, 0.5, 0.3, '#ff3df0');
          this.shake = Math.max(this.shake, 0.8);
        }
        break;
    }
  }

  /* ── meta systems ── */

  private metaOnWin(win: WinInfo) {
    const m = this.meta;
    switch (this.cfg.meta) {
      case 'progressive':
        break; // fed per spin below
      case 'collection': {
        win.cells.forEach(k0 => {
          const [c, r] = k0.split(',').map(Number);
          const s = this.grid[c]?.[r]?.sym;
          if (s === 'gem') m.gems = (m.gems as number) + 1;
          if (s === 'star') m.stars = (m.stars as number) + 1;
          if (s === 'crown') m.crowns = (m.crowns as number) + 1;
        });
        if ((m.gems as number) >= 15) { m.gems = 0; m.reward = (m.reward as number) + 1; this.floatText('GEM SET COMPLETE!', 0.5, 0.4, '#22d3ee'); this.pushLog('collection reward!'); }
        break;
      }
      case 'achievements': {
        const got = (name: string) => {
          if (!this.log.includes(`unlocked: ${name}`)) { this.pushLog(`unlocked: ${name}`); m.unlocked = (m.unlocked as number) + 1; this.floatText(`UNLOCKED · ${name}`, 0.5, 0.2, '#ffd76a'); }
        };
        if (win.total > 0) got('First Win');
        if (win.total >= 200) got('Big Win');
        if (this.chain >= 3) got('Chain ×3');
        if (this.chain >= 5) got('Chain ×5');
        if (this.spins >= 10) got('Ten Spins');
        if (this.multiplier >= 5) got('×5 Multiplier');
        break;
      }
      case 'level': {
        m.xp = (m.xp as number) + Math.max(5, Math.round(win.total / 10));
        if ((m.xp as number) >= (m.next as number)) {
          m.level = (m.level as number) + 1; m.xp = 0; m.next = (m.next as number) + 25;
          this.floatText(`LEVEL ${m.level}!`, 0.5, 0.3, '#2ee98f');
          this.pushLog(`level up → ${m.level}`);
        }
        break;
      }
      case 'upgrade': {
        m.coins = (m.coins as number) + Math.round(win.total / 5);
        break;
      }
    }
  }

  metaSpinTick() {
    const m = this.meta;
    if (this.cfg.meta === 'progressive') {
      m.meter = Math.min(100, (m.meter as number) + 2 + Math.round(this.rand() * 3));
      if ((m.meter as number) >= 100) {
        m.meter = 0; m.jackpots = (m.jackpots as number) + 1;
        this.floatText('PROGRESSIVE JACKPOT!', 0.5, 0.35, '#ffd76a');
        this.shake = 1; this.pushLog('progressive hits!');
      }
    }
    if (this.cfg.meta === 'tiered') {
      (['mini', 'minor', 'major', 'grand'] as const).forEach((t, i) => { m[t] = (m[t] as number) + (i + 1); });
      if (this.rand() < 0.06) {
        const tier = (['mini', 'mini', 'mini', 'minor'] as const)[Math.floor(this.rand() * 4)];
        this.floatText(`${tier.toUpperCase()} JACKPOT ${m[tier]}!`, 0.5, 0.35, '#ffd76a');
        m[tier] = tier === 'mini' ? 250 : 1250;
        this.pushLog(`${tier} jackpot paid`);
      }
    }
    if (this.cfg.meta === 'mystery') {
      m.pot = (m.pot as number) + 1 + Math.round(this.rand() * 2);
      if ((m.pot as number) >= (m.dropBy as number)) {
        this.floatText(`MYSTERY DROP ${m.pot}!`, 0.5, 0.35, '#b28dff');
        m.pot = 30; m.dropBy = 90 + Math.round(this.rand() * 30);
        this.shake = 0.8; this.pushLog('mystery jackpot drops (must-hit-by reached)');
      }
    }
  }

  upgrade(symId: 'gem' | 'star' | 'crown') {
    const m = this.meta;
    if (this.cfg.meta !== 'upgrade') return false;
    const cost = 40;
    if ((m.coins as number) < cost) return false;
    m.coins = (m.coins as number) - cost;
    const k0 = `${symId}Lvl` as const;
    m[k0] = (m[k0] as number) + 1;
    SYM[symId].payout = Math.round(SYM[symId].payout * 1.5);
    this.pushLog(`${symId} upgraded → pays ${SYM[symId].payout}`);
    this.bump();
    return true;
  }

  /* ── overlays (bonus rounds) ── */

  launchOverlay(kind: OverlayKind) {
    if (this.overlay) return;
    const st: any = { t: 0, entered: performance.now() };
    switch (kind) {
      case 'freespins': case 'retrigger': case 'expandingfs':
        this.inFreeSpins = true;
        this.freeSpins = 8;
        st.banner = true;
        this.pushLog('FREE SPINS x8');
        setTimeout(() => { this.overlay = null; this.freeSpins--; this.spin(); this.bump(); }, 1600);
        break;
      case 'pick':
        st.items = Array.from({ length: 9 }, (_, i) => ({ i, revealed: false, value: i < 2 ? 'COLLECT' : [10, 20, 30, 50, 75, 100, 150][Math.floor(this.rand() * 7)] }));
        st.won = 0; st.done = false;
        this.pushLog('PICK BONUS — choose chests');
        break;
      case 'wheel':
        st.slices = [10, 25, 50, 15, 100, 20, 250, 30];
        st.angle = 0; st.speed = 0; st.spinning = false; st.result = null;
        this.pushLog('PRIZE WHEEL — click to spin');
        break;
      case 'gamble':
        st.stake = Math.max(20, this.lastWin.total || 40); st.stage = 0; st.done = false; st.reveal = null;
        this.pushLog(`GAMBLE — stake ${st.stake}, pick red or black`);
        break;
      case 'choice':
        st.options = [
          { label: '5 SPINS · ×10', spins: 5, mult: 10 },
          { label: '10 SPINS · ×5', spins: 10, mult: 5 },
          { label: '15 SPINS · ×3', spins: 15, mult: 3 },
        ];
        this.pushLog('BONUS CHOICE — pick your volatility');
        break;
      case 'adventure':
        st.node = 0; st.nodes = ['START', '+25', 'WILDS', '+75', 'BOSS ×5'];
        st.rolling = false;
        this.pushLog('ADVENTURE — wins advance your token');
        break;
      case 'battle':
        st.bossHP = 100; st.playerHP = 100; st.turn = 'ready'; st.msg = 'CLICK ATTACK';
        this.pushLog('BATTLE BONUS — defeat the boss');
        break;
      case 'holdwin':
        this.pushLog('HOLD & WIN — coins lock, 3 respins');
        st.respins = 3;
        st.locked = [];
        break;
    }
    this.overlay = { kind, state: st };
    this.bump();
  }

  /** canvas click routed here when an overlay is up; x/y are 0..1 fractions */
  overlayClick(fx: number, fy: number) {
    const o = this.overlay;
    if (!o) return;
    const st = o.state;
    switch (o.kind) {
      case 'pick': {
        if (st.done) { this.overlay = null; break; }
        const c = Math.floor(fx * 3), r = Math.floor((fy - 0.2) / 0.6 * 3);
        const i = r * 3 + c;
        const item = st.items[i];
        if (!item || item.revealed || r < 0 || r > 2) break;
        item.revealed = true;
        if (item.value === 'COLLECT') { st.done = true; this.pushLog(`pick bonus ends — won ${st.won}`); setTimeout(() => { this.overlay = null; this.bump(); }, 1600); }
        else { st.won += item.value; this.pushLog(`picked +${item.value}`); }
        break;
      }
      case 'wheel': {
        if (st.result != null) { this.overlay = null; break; }
        if (!st.spinning) { st.spinning = true; st.speed = 0.35 + this.rand() * 0.2; this.pushLog('wheel spinning…'); }
        break;
      }
      case 'gamble': {
        if (st.done) { this.overlay = null; break; }
        const choice = fx < 0.5 ? 'red' : 'black';
        const actual = this.rand() < 0.5 ? 'red' : 'black';
        st.reveal = actual;
        if (choice === actual) { st.stake *= 2; st.stage++; this.pushLog(`gamble WIN → ${st.stake}`); if (st.stage >= 5) { st.done = true; } }
        else { st.stake = 0; st.done = true; this.pushLog('gamble lost'); }
        if (st.done) setTimeout(() => { this.overlay = null; this.bump(); }, 1400);
        break;
      }
      case 'choice': {
        const i = Math.floor(fy * 3 % 3);
        const opt = st.options[Math.max(0, Math.min(2, Math.floor((fy - 0.25) / 0.18)))] ?? st.options[i];
        this.pushLog(`chose ${opt.label}`);
        this.multiplier = opt.mult;
        this.freeSpins = opt.spins; this.inFreeSpins = true;
        this.overlay = null;
        this.spin();
        break;
      }
      case 'adventure': {
        if (st.rolling) break;
        st.rolling = true;
        setTimeout(() => {
          st.node = Math.min(st.nodes.length - 1, st.node + 1);
          this.pushLog(`advanced to ${st.nodes[st.node]}`);
          st.rolling = false;
          if (st.node === st.nodes.length - 1) { this.floatText('BOSS REWARD ×5', 0.5, 0.4, '#ff3df0'); setTimeout(() => { this.overlay = null; this.bump(); }, 1500); }
          this.bump();
        }, 600);
        break;
      }
      case 'battle': {
        if (st.turn !== 'ready') break;
        st.turn = 'anim';
        const dmg = 15 + Math.floor(this.rand() * 25);
        st.bossHP = Math.max(0, st.bossHP - dmg);
        st.msg = `YOU HIT ${dmg}`;
        this.shake = 0.6;
        setTimeout(() => {
          if (st.bossHP <= 0) { st.msg = 'BOSS DEFEATED! +500'; this.pushLog('battle won +500'); setTimeout(() => { this.overlay = null; this.bump(); }, 1600); return; }
          const bdmg = 8 + Math.floor(this.rand() * 18);
          st.playerHP = Math.max(0, st.playerHP - bdmg);
          st.msg = `BOSS HITS ${bdmg}`;
          st.turn = st.playerHP <= 0 ? 'lost' : 'ready';
          if (st.playerHP <= 0) { st.msg = 'DEFEATED…'; setTimeout(() => { this.overlay = null; this.bump(); }, 1500); }
          this.bump();
        }, 700);
        break;
      }
      default:
        this.overlay = null;
    }
    this.bump();
  }

  /* ── FX helpers ── */

  private spawnWinFX(win: WinInfo) {
    win.cells.forEach(k0 => {
      const [c, r] = k0.split(',').map(Number);
      this.burst(c, r, SYM[this.grid[c]?.[r]?.sym ?? 'gem']?.color ?? '#fff', 6);
    });
    if (win.total > 0) this.floatText(`+${win.total}`, 0.5, 0.5, '#2ee98f');
  }

  private burst(c: number, r: number, color: string, n: number) {
    const g = this.geometry(); if (!g) return;
    const x = g.gx + c * g.cell + g.cell / 2;
    const y = g.gy + r * g.cell + g.cell / 2;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, sp = 60 + this.rand() * 180;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.7 + this.rand() * 0.5, color, size: 2 + this.rand() * 3 });
    }
  }

  private floatText(text: string, fx: number, fy: number, color: string) {
    const cv = this.canvas; if (!cv) return;
    this.floatTexts.push({ x: cv.clientWidth * fx, y: cv.clientHeight * fy, text, t: 0, color });
  }

  private pushLog(s: string) { this.log.push(s); if (this.log.length > 60) this.log.shift(); }
  private bump() { this.version++; this.onChange?.(); }

  getSnapshot(): Snapshot {
    return {
      phase: this.phase,
      cols: this.cols,
      rowsPerCol: [...this.rowsPerCol],
      winMode: this.cfg.winMode,
      ways: this.waysCount(),
      multiplier: this.multiplier,
      chain: this.chain,
      modifiers: [...this.modifiers],
      lastWin: { total: this.lastWin.total, breakdown: [...this.lastWin.breakdown] },
      feature: this.cfg.feature ?? '—',
      overlay: this.overlay?.kind ?? null,
      spins: this.spins,
      freeSpins: this.freeSpins,
      meta: { ...this.meta },
      log: this.log.slice(-8),
    };
  }

  /* ═══════════════ renderer ═══════════════ */

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lastT = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.update(t, dt);
      this.draw(t, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach() { cancelAnimationFrame(this.raf); this.canvas = null; this.ctx = null; }

  private geometry() {
    const cv = this.canvas; if (!cv) return null;
    const W = cv.clientWidth, H = cv.clientHeight;
    const maxRows = Math.max(...this.rowsPerCol, 1);
    const cell = Math.min((W - 60) / this.cols, (H - 100) / maxRows, 96);
    const gw = cell * this.cols, gh = cell * maxRows;
    return { W, H, cell, gx: (W - gw) / 2, gy: (H - gh) / 2 + 8, maxRows };
  }

  private update(t: number, dt: number) {
    /* reel spinning / stopping — each reel rides for spinDur ms (staggered),
       then plays a short landing bounce (colSettle 0→1). */
    if (this.phase === 'spinning') {
      let allDone = true;
      for (let c = 0; c < this.cols; c++) {
        if (this.colSettle[c] >= 1) continue;
        const p = this.spinDur[c] > 0 ? (t - this.spinStart[c]) / this.spinDur[c] : 1;
        if (p < 1) {
          allDone = false;               // still riding
        } else if (this.colSettle[c] === 0) {
          this.colSettle[c] = 0.0001;     // ride done — start the bounce
          allDone = false;
        } else {
          this.colSettle[c] = Math.min(1, this.colSettle[c] + dt * 4.5);
          if (this.colSettle[c] < 1) allDone = false;
        }
      }
      if (allDone) {
        this.phase = 'evaluating';
        setTimeout(() => this.resolveWins(), 120);
        this.metaSpinTick();
        this.bump();
      }
    }
    /* drop physics */
    this.grid.flat().forEach(cell => {
      if (cell.offY < 0) {
        cell.velY += 1400 * dt;
        cell.offY += cell.velY * dt;
        if (cell.offY >= 0) { cell.offY = 0; cell.velY = cell.velY > 220 ? -cell.velY * 0.25 : 0; if (cell.velY === 0) cell.offY = 0; }
      } else if (cell.velY < 0) {
        cell.velY += 1400 * dt;
        cell.offY += cell.velY * dt;
        if (cell.offY >= 0 && cell.velY > 0) { cell.offY = 0; cell.velY = 0; }
      }
      if (cell.scale < 1) cell.scale = Math.min(1, cell.scale + dt * 4);
      if (cell.popT > 0) cell.popT = Math.min(1, cell.popT + dt * 3.5);
    });
    /* particles */
    this.particles = this.particles.filter(p => (p.life += dt) < p.max);
    this.particles.forEach(p => { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; });
    /* floats + shake */
    this.floatTexts = this.floatTexts.filter(f => (f.t += dt) < 1.6);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    /* wheel physics */
    if (this.overlay?.kind === 'wheel') {
      const st = this.overlay.state;
      if (st.spinning) {
        st.angle += st.speed;
        st.speed *= 0.985;
        if (st.speed < 0.004) {
          st.spinning = false;
          const slice = Math.floor(((-st.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * st.slices.length);
          st.result = st.slices[slice];
          this.pushLog(`wheel lands on ${st.result}`);
          this.floatText(`+${st.result}`, 0.5, 0.3, '#ffd76a');
          this.bump();
        }
      }
    }
  }

  private draw(t: number, _dt: number) {
    const ctx = this.ctx, cv = this.canvas;
    if (!ctx || !cv) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== cv.clientWidth * dpr || cv.height !== cv.clientHeight * dpr) {
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = this.geometry()!;
    ctx.clearRect(0, 0, g.W, g.H);

    /* shake */
    if (this.shake > 0) ctx.translate((this.rand() - 0.5) * 10 * this.shake, (this.rand() - 0.5) * 10 * this.shake);

    /* layered backdrop grid (multi-layer mechanic) */
    if (this.cfg.layered) {
      ctx.save(); ctx.globalAlpha = 0.14;
      for (let c = 0; c < this.cols; c++)
        for (let r = 0; r < g.maxRows; r++) {
          const x = g.gx + c * g.cell + 10, y = g.gy + r * g.cell + 10;
          drawSymbol(ctx, PAYING[(c * 3 + r + Math.floor(t / 900)) % PAYING.length], x + g.cell / 2 - 10, y + g.cell / 2 - 10, g.cell * 0.5, '#8aa3b8');
        }
      ctx.restore();
    }

    /* cells */
    for (let c = 0; c < this.cols; c++) {
      const rows = this.rowsPerCol[c];
      const colTop = g.gy + (g.maxRows - rows) * g.cell / 2; // center shorter megaways reels
      const cx = g.gx + c * g.cell + g.cell / 2;
      /* frame per reel */
      ctx.strokeStyle = 'rgba(34,211,238,.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(g.gx + c * g.cell + 2, colTop - 2, g.cell - 4, rows * g.cell + 4);

      const riding = this.phase === 'spinning' && this.colSettle[c] === 0;
      if (riding) {
        /* clean vertical reel scroll: strip decelerates onto the result, with
           a light motion blur that fades to crisp as it lands. Locked symbols
           are held stationary on top (drawn after). */
        const strip = this.strip[c];
        const p = this.spinDur[c] > 0 ? Math.min(1, (t - this.spinStart[c]) / this.spinDur[c]) : 1;
        const maxScroll = (strip.length - rows) * g.cell;
        /* constant-speed cruise for the first 60% of the ride, then a smooth
           brake to a crisp stop — velocity is continuous across the seam. */
        const A = 0.6, V0 = 2 / (1 + A);
        let travelled: number, velFrac: number;
        if (p < A) { travelled = V0 * p; velFrac = 1; }
        else { const x = (p - A) / (1 - A); travelled = V0 * A + (1 - V0 * A) * (1 - (1 - x) * (1 - x)); velFrac = 1 - x; }
        const s = maxScroll * (1 - travelled);
        const blur = 2.3 * velFrac;
        ctx.save();
        ctx.beginPath(); ctx.rect(g.gx + c * g.cell, colTop, g.cell, rows * g.cell); ctx.clip();
        if (blur > 0.05) ctx.filter = `blur(${blur.toFixed(2)}px)`;
        const iStart = Math.max(0, Math.floor(s / g.cell) - 1);
        const iEnd = Math.min(strip.length - 1, iStart + rows + 2);
        for (let i = iStart; i <= iEnd; i++) {
          const y = colTop + i * g.cell - s + g.cell / 2;
          drawSymbol(ctx, strip[i], cx, y, g.cell * 0.62, SYM[strip[i]]?.color ?? '#fff');
        }
        ctx.filter = 'none';
        /* held (locked) symbols stay put while the reel spins behind them */
        for (let r = 0; r < rows; r++) {
          const cell = this.grid[c][r];
          if (cell.sticky <= 0) continue;
          const y = colTop + r * g.cell + g.cell / 2;
          this.drawHeldCell(ctx, cell, cx, y, g.cell, t);
        }
        ctx.restore();
        continue;
      }

      const settle = this.colSettle[c] < 1 ? easeOutBack(this.colSettle[c]) : 1;
      const settleOff = this.colSettle[c] < 1 ? (1 - settle) * -16 : 0;   // subtle landing bounce
      for (let r = 0; r < rows; r++) {
        const cell = this.grid[c][r];
        const x = cx;
        const y = colTop + r * g.cell + g.cell / 2 + cell.offY + settleOff;
        const size = g.cell * 0.62 * cell.scale * (cell.popT > 0 ? 1 + cell.popT * 0.6 : 1);
        ctx.save();
        ctx.globalAlpha = cell.popT > 0 ? 1 - cell.popT : cell.alpha;
        if (cell.sticky > 0 && cell.popT <= 0) this.drawLockFrame(ctx, x, y, g.cell, t);
        if (cell.win) {
          const pulse = 0.6 + Math.sin(t / 120) * 0.4;
          ctx.shadowColor = SYM[cell.sym]?.color ?? '#fff';
          ctx.shadowBlur = 22 * pulse;
          ctx.fillStyle = `rgba(255,255,255,${0.06 * pulse})`;
          ctx.fillRect(x - g.cell / 2 + 4, y - g.cell / 2 + 4, g.cell - 8, g.cell - 8);
        }
        if (cell.split) {
          drawSymbol(ctx, cell.split[0], x, y - g.cell * 0.16, size * 0.55, SYM[cell.split[0]]?.color ?? '#fff');
          drawSymbol(ctx, cell.split[1], x, y + g.cell * 0.16, size * 0.55, SYM[cell.split[1]]?.color ?? '#fff');
        } else {
          drawSymbol(ctx, cell.sym, x, y, size, SYM[cell.sym]?.color ?? '#fff');
        }
        if (cell.badge) {
          ctx.shadowBlur = 0;
          ctx.font = '700 10px "Chakra Petch", sans-serif';
          ctx.textAlign = 'center';
          const w = ctx.measureText(cell.badge).width + 10;
          ctx.fillStyle = cell.sticky > 0 ? LOCK_COLOR : (SYM[cell.sym]?.color ?? '#ffd76a');
          ctx.beginPath(); (ctx as any).roundRect(x - w / 2, y + g.cell * 0.24, w, 14, 4); ctx.fill();
          ctx.fillStyle = '#04080d';
          ctx.fillText(cell.badge, x, y + g.cell * 0.24 + 10.5);
        }
        ctx.restore();
      }
    }

    /* payline overlays */
    if (this.lastWin.lines.length && (this.phase === 'settled' || this.phase === 'cascading' || this.phase === 'evaluating')) {
      this.lastWin.lines.forEach((line, i) => {
        ctx.save();
        ctx.strokeStyle = `hsla(${(i * 47) % 360},90%,65%,.85)`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
        ctx.beginPath();
        line.forEach(([c, r], j) => {
          const rows = this.rowsPerCol[c];
          const colTop = g.gy + (g.maxRows - rows) * g.cell / 2;
          const x = g.gx + c * g.cell + g.cell / 2, y = colTop + r * g.cell + g.cell / 2;
          j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      });
    }

    /* particles */
    this.particles.forEach(p => {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    /* floating texts */
    this.floatTexts.forEach(f => {
      const k0 = f.t / 1.6;
      ctx.save();
      ctx.globalAlpha = 1 - k0;
      ctx.font = `700 ${26 + (1 - k0) * 10}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color; ctx.shadowBlur = 18;
      ctx.fillText(f.text, f.x, f.y - k0 * 60);
      ctx.restore();
    });

    /* overlay scenes */
    if (this.overlay) this.drawOverlay(ctx, g, t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** pulsing amber frame marking a locked/held cell (matches the slots SHIELD LOCK look) */
  private drawLockFrame(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, t: number) {
    const pulse = 0.7 + Math.sin(t / 260) * 0.3;
    ctx.save();
    ctx.strokeStyle = LOCK_COLOR;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = LOCK_COLOR;
    ctx.shadowBlur = 16 * pulse;
    ctx.beginPath(); (ctx as any).roundRect(cx - cell / 2 + 4, cy - cell / 2 + 4, cell - 8, cell - 8, 9);
    ctx.stroke();
    ctx.restore();
  }

  /** a held symbol drawn stationary and opaque while the reel spins behind it */
  private drawHeldCell(ctx: CanvasRenderingContext2D, cell: Cell, cx: number, cy: number, size: number, t: number) {
    ctx.save();
    /* opaque backing so the spinning strip doesn't bleed through */
    ctx.fillStyle = 'rgba(8,17,25,0.94)';
    ctx.beginPath(); (ctx as any).roundRect(cx - size / 2 + 3, cy - size / 2 + 3, size - 6, size - 6, 9); ctx.fill();
    this.drawLockFrame(ctx, cx, cy, size, t);
    drawSymbol(ctx, cell.sym, cx, cy, size * 0.62, SYM[cell.sym]?.color ?? '#fff');
    if (cell.badge) {
      ctx.shadowBlur = 0;
      ctx.font = '700 10px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(cell.badge).width + 10;
      ctx.fillStyle = LOCK_COLOR;
      ctx.beginPath(); (ctx as any).roundRect(cx - w / 2, cy + size * 0.24, w, 14, 4); ctx.fill();
      ctx.fillStyle = '#04080d';
      ctx.fillText(cell.badge, cx, cy + size * 0.24 + 10.5);
    }
    ctx.restore();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, g: { W: number; H: number }, t: number) {
    const o = this.overlay!;
    const st = o.state;
    ctx.save();
    ctx.fillStyle = 'rgba(3,7,12,.88)';
    ctx.fillRect(0, 0, g.W, g.H);
    ctx.textAlign = 'center';
    const title = (s: string, color = '#22d3ee') => {
      ctx.font = '700 30px "Chakra Petch", sans-serif';
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 24;
      ctx.fillText(s, g.W / 2, 60);
      ctx.shadowBlur = 0;
    };
    switch (o.kind) {
      case 'freespins': case 'retrigger': case 'expandingfs': {
        title('FREE SPINS');
        ctx.font = '700 72px "Chakra Petch", sans-serif';
        ctx.fillStyle = '#ffd76a'; ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 30;
        ctx.fillText('8', g.W / 2, g.H / 2 + 10);
        ctx.shadowBlur = 0;
        ctx.font = '600 14px "Space Mono", monospace'; ctx.fillStyle = '#8aa3b8';
        ctx.fillText('ENTERING BONUS…', g.W / 2, g.H / 2 + 60);
        break;
      }
      case 'pick': {
        title('PICK BONUS');
        ctx.font = '600 13px "Space Mono", monospace'; ctx.fillStyle = '#8aa3b8';
        ctx.fillText(`WON SO FAR: ${st.won} — COLLECT ENDS THE ROUND`, g.W / 2, 92);
        st.items.forEach((item: any, i: number) => {
          const c = i % 3, r = Math.floor(i / 3);
          const bw = g.W / 4.2, bh = (g.H * 0.6) / 3.4;
          const x = g.W / 2 + (c - 1) * (bw + 14) - bw / 2;
          const y = g.H * 0.2 + r * (bh + 14);
          ctx.fillStyle = item.revealed ? (item.value === 'COLLECT' ? 'rgba(255,61,240,.25)' : 'rgba(34,211,238,.16)') : 'rgba(255,255,255,.06)';
          ctx.strokeStyle = item.revealed ? '#22d3ee' : 'rgba(34,211,238,.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); (ctx as any).roundRect(x, y, bw, bh, 12); ctx.fill(); ctx.stroke();
          ctx.font = '700 20px "Chakra Petch", sans-serif';
          ctx.fillStyle = item.revealed ? (item.value === 'COLLECT' ? '#ff3df0' : '#ffd76a') : '#22d3ee';
          ctx.fillText(item.revealed ? String(item.value) : '?', x + bw / 2, y + bh / 2 + 7);
        });
        break;
      }
      case 'wheel': {
        title('PRIZE WHEEL');
        const cx = g.W / 2, cy = g.H / 2 + 20, R = Math.min(g.W, g.H) * 0.3;
        st.slices.forEach((v: number, i: number) => {
          const a0 = st.angle + (i / st.slices.length) * Math.PI * 2;
          const a1 = st.angle + ((i + 1) / st.slices.length) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
          ctx.fillStyle = `hsla(${(i * 45) % 360},75%,${i % 2 ? 45 : 30}%,.9)`;
          ctx.fill();
          ctx.save();
          ctx.translate(cx, cy); ctx.rotate((a0 + a1) / 2);
          ctx.font = '700 15px "Chakra Petch", sans-serif';
          ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
          ctx.fillText(String(v), R - 12, 5);
          ctx.restore();
        });
        /* pointer */
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath(); ctx.moveTo(cx + R + 14, cy); ctx.lineTo(cx + R - 6, cy - 10); ctx.lineTo(cx + R - 6, cy + 10); ctx.closePath(); ctx.fill();
        ctx.font = '600 13px "Space Mono", monospace'; ctx.fillStyle = '#8aa3b8'; ctx.textAlign = 'center';
        ctx.fillText(st.result != null ? `WON ${st.result} — CLICK TO CLOSE` : (st.spinning ? '…' : 'CLICK TO SPIN'), cx, g.H - 26);
        break;
      }
      case 'gamble': {
        title('GAMBLE — DOUBLE OR NOTHING', '#ff3df0');
        ctx.font = '700 22px "Chakra Petch", sans-serif'; ctx.fillStyle = '#ffd76a';
        ctx.fillText(`STAKE: ${st.stake}`, g.W / 2, 100);
        const bw = g.W / 3.4, bh = g.H * 0.4, y = g.H * 0.28;
        [['RED', '#e0344c', g.W / 2 - bw - 10], ['BLACK', '#1a2432', g.W / 2 + 10]].forEach(([label, color, x]: any) => {
          ctx.fillStyle = color;
          ctx.beginPath(); (ctx as any).roundRect(x, y, bw, bh, 14); ctx.fill();
          if (st.reveal && label.toLowerCase() === st.reveal) { ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 4; ctx.stroke(); }
          ctx.font = '700 22px "Chakra Petch", sans-serif'; ctx.fillStyle = '#fff';
          ctx.fillText(label, x + bw / 2, y + bh / 2 + 8);
        });
        ctx.font = '600 13px "Space Mono", monospace'; ctx.fillStyle = '#8aa3b8';
        ctx.fillText(st.done ? (st.stake > 0 ? `COLLECTED ${st.stake}` : 'LOST THE STAKE') : `STAGE ${st.stage + 1}/5 — PICK A COLOR`, g.W / 2, g.H - 26);
        break;
      }
      case 'choice': {
        title('CHOOSE YOUR BONUS');
        st.options.forEach((opt: any, i: number) => {
          const bw = g.W * 0.6, bh = 54;
          const x = g.W / 2 - bw / 2, y = g.H * 0.25 + i * (bh + 18);
          ctx.fillStyle = 'rgba(34,211,238,.1)';
          ctx.strokeStyle = 'rgba(34,211,238,.5)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); (ctx as any).roundRect(x, y, bw, bh, 12); ctx.fill(); ctx.stroke();
          ctx.font = '700 18px "Chakra Petch", sans-serif'; ctx.fillStyle = '#eaf6fb';
          ctx.fillText(opt.label, g.W / 2, y + bh / 2 + 6);
        });
        break;
      }
      case 'adventure': {
        title('ADVENTURE TRAIL', '#2ee98f');
        const y = g.H / 2;
        st.nodes.forEach((label: string, i: number) => {
          const x = g.W * 0.14 + (i / (st.nodes.length - 1)) * g.W * 0.72;
          ctx.strokeStyle = 'rgba(46,233,143,.4)'; ctx.lineWidth = 3;
          if (i < st.nodes.length - 1) {
            const x2 = g.W * 0.14 + ((i + 1) / (st.nodes.length - 1)) * g.W * 0.72;
            ctx.beginPath(); ctx.moveTo(x + 22, y); ctx.lineTo(x2 - 22, y); ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2);
          ctx.fillStyle = i <= st.node ? '#2ee98f' : 'rgba(255,255,255,.08)';
          ctx.fill();
          ctx.font = '700 11px "Chakra Petch", sans-serif';
          ctx.fillStyle = i <= st.node ? '#04120a' : '#8aa3b8';
          ctx.fillText(label, x, y + 4);
        });
        /* player token */
        const tx = g.W * 0.14 + (st.node / (st.nodes.length - 1)) * g.W * 0.72;
        ctx.beginPath(); ctx.arc(tx, y - 44 + Math.sin(t / 250) * 4, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd76a'; ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
        ctx.font = '600 13px "Space Mono", monospace'; ctx.fillStyle = '#8aa3b8';
        ctx.fillText('CLICK = WIN A SPIN → TOKEN ADVANCES', g.W / 2, g.H - 26);
        break;
      }
      case 'battle': {
        title('BATTLE BONUS', '#e0344c');
        const bar = (x: number, y: number, w: number, frac: number, color: string, label: string) => {
          ctx.fillStyle = 'rgba(255,255,255,.08)';
          ctx.fillRect(x, y, w, 16);
          ctx.fillStyle = color;
          ctx.fillRect(x, y, w * Math.max(0, frac), 16);
          ctx.font = '700 12px "Chakra Petch", sans-serif'; ctx.fillStyle = '#eaf6fb'; ctx.textAlign = 'left';
          ctx.fillText(label, x, y - 6);
          ctx.textAlign = 'center';
        };
        bar(g.W * 0.1, 110, g.W * 0.34, st.playerHP / 100, '#22d3ee', 'YOU');
        bar(g.W * 0.56, 110, g.W * 0.34, st.bossHP / 100, '#e0344c', 'BOSS');
        /* combatants */
        drawSymbol(ctx, 'gem', g.W * 0.27, g.H * 0.55, 70, '#22d3ee');
        drawSymbol(ctx, 'crown', g.W * 0.73, g.H * 0.55 + Math.sin(t / 300) * 6, 80, '#e0344c');
        ctx.font = '700 20px "Chakra Petch", sans-serif'; ctx.fillStyle = '#ffd76a';
        ctx.fillText(st.msg, g.W / 2, g.H * 0.82);
        ctx.font = '600 13px "Space Mono", monospace'; ctx.fillStyle = '#8aa3b8';
        ctx.fillText('CLICK TO ATTACK', g.W / 2, g.H - 26);
        break;
      }
    }
    ctx.restore();
  }
}

/* ═══════════════ vector symbol art (the "generated SVG" set, drawn in-canvas) ═══════════════ */

export function drawSymbol(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, color: string) {
  const s = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.lineJoin = 'round';
  switch (id) {
    case 'gem':
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, -s * 0.2); ctx.lineTo(0, s); ctx.lineTo(-s * 0.85, -s * 0.2); ctx.closePath();
      ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.85, -s * 0.2); ctx.lineTo(s * 0.85, -s * 0.2); ctx.moveTo(0, -s); ctx.lineTo(0, s);
      ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
      break;
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s : s * 0.45;
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      break;
    }
    case 'moon':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.9, Math.PI * 0.32, Math.PI * 1.68, false);
      ctx.arc(s * 0.42, 0, s * 0.62, Math.PI * 1.55, Math.PI * 0.45, true);
      ctx.closePath();
      ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      break;
    case 'bolt':
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s); ctx.lineTo(-s * 0.55, s * 0.15); ctx.lineTo(-s * 0.05, s * 0.15);
      ctx.lineTo(-s * 0.1, s); ctx.lineTo(s * 0.55, -s * 0.15); ctx.lineTo(s * 0.05, -s * 0.15);
      ctx.closePath();
      ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      break;
    case 'ring':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
      ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, s * 0.5); ctx.lineTo(-s * 0.8, -s * 0.3); ctx.lineTo(-s * 0.35, s * 0.05);
      ctx.lineTo(0, -s * 0.75); ctx.lineTo(s * 0.35, s * 0.05); ctx.lineTo(s * 0.8, -s * 0.3); ctx.lineTo(s * 0.8, s * 0.5);
      ctx.closePath();
      ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      break;
    case 'wild':
      ctx.beginPath(); (ctx as any).roundRect(-s * 0.85, -s * 0.6, s * 1.7, s * 1.2, s * 0.25);
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = `700 ${Math.max(9, size * 0.34)}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('WILD', 0, size * 0.12);
      break;
    case 'scatter':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.35, Math.sin(a) * s * 0.35);
        ctx.lineTo(Math.cos(a) * s * 0.95, Math.sin(a) * s * 0.95); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      break;
    case 'mystery':
      ctx.beginPath(); (ctx as any).roundRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4, s * 0.2);
      ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      ctx.font = `700 ${size * 0.5}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('?', 0, size * 0.17);
      break;
    case 'coin':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
      ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.stroke();
      break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
