/**
 * The mechanic registry — every demo in the showcase is a MechanicConfig
 * driving the shared SlotEngine, so adding a mechanic is adding data here.
 * hitBoost force-plants matches so each demo reliably demonstrates itself.
 */
import type { MechanicConfig, OverlayKind } from './engine';

export interface MechanicDef {
  id: string;
  name: string;
  category: string;
  blurb: string;
  cfg: MechanicConfig;
  featureButton?: { label: string; overlay: OverlayKind } | null;
}

const CAT = {
  GRID: '1 · Reel & Grid Systems',
  SYMBOL: '2 · Symbol Mechanics',
  WINFLOW: '3 · Win Flow Systems',
  BONUS: '4 · Bonus Round Systems',
  META: '5 · Meta Systems',
};

export const CATEGORIES = Object.values(CAT);

const M = (
  id: string, category: string, name: string, blurb: string,
  cfg: MechanicConfig, featureButton: MechanicDef['featureButton'] = null,
): MechanicDef => ({ id, category, name, blurb, cfg, featureButton });

export const MECHANICS: MechanicDef[] = [
  /* ═══ 1 · REEL & GRID SYSTEMS ═══ */
  M('classic-3x3', CAT.GRID, 'Classic 3×3 reels',
    '3 reels, 3 rows, 5 fixed paylines. The original mechanical layout.',
    { cols: 3, rows: 3, winMode: 'lines', linesCount: 5, hitBoost: 0.55 }),
  M('lines-5x3', CAT.GRID, '5×3 paylines slot',
    'The modern standard: 5 reels over 20 fixed paylines, drawn on wins.',
    { cols: 5, rows: 3, winMode: 'lines', linesCount: 20, hitBoost: 0.5 }),
  M('ways-5x4', CAT.GRID, '5×4 ways-to-win',
    'No lines — any adjacent left-to-right match pays. 4 rows × 5 reels = 1,024 ways.',
    { cols: 5, rows: 4, winMode: 'ways', hitBoost: 0.5 }),
  M('megaways-6x5', CAT.GRID, '6-reel Megaways',
    'Every reel rolls a random height (2–7) each spin — the ways count changes every single spin, up to 117,649.',
    { cols: 6, rows: 7, megaways: true, winMode: 'ways', hitBoost: 0.45 }),
  M('cluster-6x6', CAT.GRID, 'Cluster pays grid',
    '5+ matching symbols touching horizontally/vertically pay as a cluster — no reels, no lines.',
    { cols: 6, rows: 6, winMode: 'cluster', hitBoost: 0.7, cascades: true }),
  M('grid-7x7', CAT.GRID, '7×7 grid slot',
    'Scatter-pays on a big grid: 8+ of a symbol ANYWHERE pays, positions irrelevant.',
    { cols: 7, rows: 7, winMode: 'scatterpays', hitBoost: 0.6, cascades: true }),
  M('expanding-grid', CAT.GRID, 'Expanding grid',
    'Starts 5×3; every winning cascade adds a row, growing the board up to 5×6.',
    { cols: 5, rows: 3, winMode: 'ways', cascades: true, expandingGrid: true, maxRows: 6, hitBoost: 0.65 }),
  M('infinity-reels', CAT.GRID, 'Infinity reels',
    'Win and a NEW reel is added on the right; keep winning and the board keeps growing. A miss resets to 3 reels.',
    { cols: 3, rows: 3, winMode: 'ways', infinityReels: true, maxCols: 7, hitBoost: 0.6 }),
  M('split-reels', CAT.GRID, 'Split reel system',
    'Random cells split into two half-symbols — one position can hold two symbols, doubling that reel\'s ways.',
    { cols: 5, rows: 3, winMode: 'ways', splitReels: true, hitBoost: 0.5 }),
  M('multi-layer', CAT.GRID, 'Multi-layer reels',
    'A faint second symbol layer drifts behind the main grid — the visual base for layer-swap features.',
    { cols: 5, rows: 3, winMode: 'ways', layered: true, hitBoost: 0.5 }),

  /* ═══ 2 · SYMBOL MECHANICS ═══ */
  M('wild-normal', CAT.SYMBOL, 'Normal wild',
    'Substitutes for any paying symbol when evaluating lines/ways.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'wild-normal', hitBoost: 0.5 }),
  M('wild-stacked', CAT.SYMBOL, 'Stacked wild',
    'Wilds land as a full-reel stack, opening every way through that reel.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'wild-stacked', hitBoost: 0.45 }),
  M('wild-expanding', CAT.SYMBOL, 'Expanding wild',
    'A single wild lands, then grows to cover its whole reel before wins are re-evaluated.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'wild-expanding', hitBoost: 0.45 }),
  M('wild-sticky', CAT.SYMBOL, 'Sticky wild',
    'Wilds freeze in place for the next 3 spins — watch the countdown badge.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'wild-sticky', hitBoost: 0.45 }),
  M('wild-walking', CAT.SYMBOL, 'Walking wild',
    'Wilds march one reel left on every spin until they walk off the board.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'wild-walking', hitBoost: 0.45 }),
  M('wild-shifting', CAT.SYMBOL, 'Shifting wild',
    'A wild that jumps to a random adjacent cell each spin.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'wild-shifting', hitBoost: 0.45 }),
  M('wild-random', CAT.SYMBOL, 'Random wilds',
    '2–5 wilds are thrown onto the grid after the reels stop.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'wild-random', hitBoost: 0.4 }),
  M('wild-multiplier', CAT.SYMBOL, 'Multiplier wild',
    'Wilds carry ×2/×3/×5 — any win passing through multiplies.',
    { cols: 5, rows: 3, winMode: 'lines', linesCount: 10, feature: 'wild-multiplier', hitBoost: 0.55 }),
  M('scatter-syms', CAT.SYMBOL, 'Scatter symbols',
    'Position-independent symbols: 3+ anywhere flags a feature trigger.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'scatter-demo', hitBoost: 0.4 }),
  M('mystery-syms', CAT.SYMBOL, 'Mystery symbols',
    '“?” symbols land, then all flip to the SAME random symbol at once.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'mystery', hitBoost: 0.3 }),
  M('transforming', CAT.SYMBOL, 'Transforming symbols',
    'Low symbols adjacent to a Crown are converted into Crowns before evaluation.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'transforming', hitBoost: 0.5 }),
  M('collect-syms', CAT.SYMBOL, 'Collect symbols',
    'Coin symbols carry values that fly into a running collector total.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'collect', hitBoost: 0.4 }),
  M('symbol-mult', CAT.SYMBOL, 'Multiplier symbols',
    'Random symbols spawn with ×2–×5 badges; wins through them multiply.',
    { cols: 5, rows: 3, winMode: 'lines', linesCount: 10, feature: 'symbol-multiplier', hitBoost: 0.55 }),

  /* ═══ 3 · WIN FLOW SYSTEMS ═══ */
  M('normal-result', CAT.WINFLOW, 'Normal spin result',
    'The baseline: spin, stop, evaluate once, highlight, settle.',
    { cols: 5, rows: 3, winMode: 'ways', hitBoost: 0.55 }),
  M('cascading', CAT.WINFLOW, 'Cascading / tumbling reels',
    'Winners explode, everything above tumbles down, new symbols drop in — and the new board is evaluated again.',
    { cols: 5, rows: 4, winMode: 'ways', cascades: true, hitBoost: 0.65 }),
  M('avalanche', CAT.WINFLOW, 'Avalanche chain reactions',
    'Cluster grid cascades that chain until the board runs dry — watch the chain counter.',
    { cols: 6, rows: 6, winMode: 'cluster', cascades: true, hitBoost: 0.75 }),
  M('cascade-mult', CAT.WINFLOW, 'Cascade multiplier progression',
    'Each chain step climbs the ladder: ×1 → ×2 → ×3 → ×5 applied to every follow-up win.',
    { cols: 5, rows: 4, winMode: 'ways', cascades: true, cascadeLadder: [1, 2, 3, 5], hitBoost: 0.7 }),
  M('endless-cascade', CAT.WINFLOW, 'Endless cascades',
    'No multiplier cap — the ladder keeps climbing +1 for as long as the chain survives.',
    { cols: 6, rows: 5, winMode: 'cluster', cascades: true, cascadeLadder: [1, 2, 3, 4, 5], endlessLadder: true, hitBoost: 0.8 }),
  M('respins', CAT.WINFLOW, 'Respins',
    'A losing spin triggers a single free respin of reel 3 for a second chance.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'respin', hitBoost: 0.35 }),
  M('locked-respins', CAT.WINFLOW, 'Locked respins',
    'Winning symbols LOCK in place while the rest of the board respins around them.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'locked-respin', hitBoost: 0.55 }),
  M('hold-and-win', CAT.WINFLOW, 'Hold and win',
    'Coins lock where they land and bank their values; filling the whole grid doubles the bank.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'holdwin-grid', hitBoost: 0.3 }),
  M('symbol-collection', CAT.WINFLOW, 'Symbol collection',
    'Winning gems feed a set meter — complete the set for a reward burst.',
    { cols: 5, rows: 3, winMode: 'ways', meta: 'collection', hitBoost: 0.6 }),
  M('win-mult', CAT.WINFLOW, 'Win multiplication',
    'A finished win gets slammed by a random ×2/×3/×5/×10 with screen shake.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'win-mult-slam', hitBoost: 0.6 }),

  /* ═══ 4 · BONUS ROUND SYSTEMS ═══ */
  M('free-spins', CAT.BONUS, 'Free spins mode',
    '3 scatters (or the button) launch an 8-spin auto-playing bonus with a transition banner.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'scatter-demo', overlay: 'freespins', autoOverlay: true, hitBoost: 0.5 },
    { label: 'Trigger Free Spins', overlay: 'freespins' }),
  M('retrigger-fs', CAT.BONUS, 'Retriggering free spins',
    'Scatters landing DURING free spins add more spins to the counter.',
    { cols: 5, rows: 3, winMode: 'ways', feature: 'scatter-demo', overlay: 'retrigger', autoOverlay: true, hitBoost: 0.5 },
    { label: 'Trigger Free Spins', overlay: 'retrigger' }),
  M('expanding-fs', CAT.BONUS, 'Expanding free spins',
    'Free spins on an expanding board — each winning cascade grows the grid.',
    { cols: 5, rows: 3, winMode: 'ways', cascades: true, expandingGrid: true, maxRows: 6, overlay: 'expandingfs', hitBoost: 0.6 },
    { label: 'Trigger Free Spins', overlay: 'expandingfs' }),
  M('pick-bonus', CAT.BONUS, 'Pick bonus',
    'A 3×3 chest screen — keep picking prizes until you hit COLLECT.',
    { cols: 5, rows: 3, winMode: 'ways', overlay: 'pick', hitBoost: 0.45 },
    { label: 'Open Pick Bonus', overlay: 'pick' }),
  M('prize-wheel', CAT.BONUS, 'Prize wheel',
    'A weighted wheel with physics: click to spin, friction picks the slice.',
    { cols: 5, rows: 3, winMode: 'ways', overlay: 'wheel', hitBoost: 0.45 },
    { label: 'Spin the Wheel', overlay: 'wheel' }),
  M('gamble', CAT.BONUS, 'Gamble feature',
    'Red or black: double your win up to 5 rungs — or lose it all.',
    { cols: 5, rows: 3, winMode: 'ways', overlay: 'gamble', hitBoost: 0.55 },
    { label: 'Gamble the Win', overlay: 'gamble' }),
  M('bonus-choice', CAT.BONUS, 'Bonus choice selection',
    'Pick your volatility: few spins at a huge multiplier, or many at a small one.',
    { cols: 5, rows: 3, winMode: 'ways', overlay: 'choice', hitBoost: 0.55 },
    { label: 'Choose Bonus', overlay: 'choice' }),
  M('adventure', CAT.BONUS, 'Adventure progression',
    'A node trail — wins advance your token toward the boss reward.',
    { cols: 5, rows: 3, winMode: 'ways', overlay: 'adventure', hitBoost: 0.5 },
    { label: 'Open the Trail', overlay: 'adventure' }),
  M('battle-bonus', CAT.BONUS, 'Battle bonus',
    'Turn-based boss fight: your attacks roll damage, the boss hits back.',
    { cols: 5, rows: 3, winMode: 'ways', overlay: 'battle', hitBoost: 0.5 },
    { label: 'Start the Battle', overlay: 'battle' }),

  /* ═══ 5 · META SYSTEMS ═══ */
  M('progressive', CAT.META, 'Progressive jackpot meter',
    'Every spin feeds the meter; at 100% it bursts and reseeds.',
    { cols: 5, rows: 3, winMode: 'ways', meta: 'progressive', hitBoost: 0.5 }),
  M('tiered-jackpot', CAT.META, 'Tiered jackpot',
    'Mini / Minor / Major / Grand all climb at different rates; small tiers hit often.',
    { cols: 5, rows: 3, winMode: 'ways', meta: 'tiered', hitBoost: 0.5 }),
  M('mystery-jackpot', CAT.META, 'Mystery jackpot',
    'A must-drop-by pot: the exact trigger point is hidden, but it MUST pay before the cap.',
    { cols: 5, rows: 3, winMode: 'ways', meta: 'mystery', hitBoost: 0.5 }),
  M('collection-tracker', CAT.META, 'Collection tracker',
    'Per-symbol counters build across spins toward set rewards.',
    { cols: 5, rows: 3, winMode: 'ways', meta: 'collection', hitBoost: 0.6 }),
  M('achievements', CAT.META, 'Achievement system',
    'Toasts unlock as you play: first win, big win, chain milestones…',
    { cols: 5, rows: 4, winMode: 'ways', cascades: true, cascadeLadder: [1, 2, 3, 5], meta: 'achievements', hitBoost: 0.65 }),
  M('level-progression', CAT.META, 'Level progression',
    'Wins grant XP; level-ups flash and raise the next threshold.',
    { cols: 5, rows: 3, winMode: 'ways', meta: 'level', hitBoost: 0.6 }),
  M('upgrade-system', CAT.META, 'Upgrade system',
    'Spend collected coins to permanently upgrade a symbol\'s pay value — the paytable itself changes.',
    { cols: 5, rows: 3, winMode: 'ways', meta: 'upgrade', hitBoost: 0.6 }),
];

export const byCategory = () => {
  const map = new Map<string, MechanicDef[]>();
  CATEGORIES.forEach(c => map.set(c, []));
  MECHANICS.forEach(m => map.get(m.category)!.push(m));
  return map;
};
