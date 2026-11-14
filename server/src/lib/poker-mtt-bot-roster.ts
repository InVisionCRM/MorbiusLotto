/**
 * Roster of the 70 house bots that fund + fill the 100-player MTT live test
 * (`role = 'mtt'` in `poker_bot_accounts`, migration 203).
 *
 * Deterministic: names are a fixed list, wallets are `0x…b100`–`0x…b169`, and the
 * tightness / aggression / bluff dials come from a seeded PRNG (`MTT_BOT_ROSTER_SEED`)
 * applied on top of a rotating archetype. Migration 203 holds the literal output of
 * `buildMttBotRoster()`; a unit test asserts the two never drift apart.
 *
 * Kept separate from the daily-freeroll ('tournament', b071–b077) and cash-table
 * ('cash', b081–b087) rosters so an MTT can never pull a bot off those games.
 *
 * Names are made up — no "_bot" suffix and no real poker players' names / nicknames.
 */

export const MTT_BOT_COUNT = 70;
/** "MTT1" in ASCII. Changing it changes every personality — don't, once migrated. */
export const MTT_BOT_ROSTER_SEED = 0x4d545431;

export const MTT_BOT_NAMES: readonly string[] = [
  'NightOwl', 'RiverRat', 'NeonNomad', 'MidnightMint', 'VelvetFold',
  'CopperCheck', 'IronRaiser', 'SilentSnap', 'LuckyLantern', 'StackSprite',
  'BluffBadger', 'FlopFox', 'TurnTortoise', 'ShoveShark', 'PocketComet',
  'GhostCall', 'ChipChaser', 'DuskRunner', 'OrbitOuts', 'CrimsonKicker',
  'PaperTiger', 'QuietQueen', 'TiltProof', 'NutHunter', 'AceOfDusk',
  'GutshotGale', 'MoonlitMuck', 'CardinalCheck', 'SteadyHand', 'PotOdds',
  'SageStack', 'BlindThief', 'FrostyFold', 'ThunderCall', 'MagpieMind',
  'HexHandler', 'PixelPair', 'SunsetShove', 'RookieRiver', 'MarbleMind',
  'CobaltCrush', 'HighCardHal', 'LateRegLarry', 'BigBlindBetty', 'ButtonBaron',
  'CutoffCrow', 'UTGUrsa', 'SuitedSam', 'OffsuitOtis', 'KickerKate',
  'SetMinerSue', 'SnapCallSid', 'TripleBarrel', 'CheckRaiseCleo', 'LimpLegend',
  'ColdDeckCody', 'SplitPotPete', 'RunItTwice', 'FeltWalker', 'ChipLeaderLou',
  'BountyBelle', 'DeepStackDot', 'ShortStackStu', 'FlushFinder', 'StraightShooter',
  'QuadQueen', 'FullHouseFern', 'BadBeatBen', 'OnTheBubble', 'FinalTableFaye',
];

export type MttBotArchetype = 'rock' | 'tag' | 'lag' | 'station' | 'maniac';

/** Centre points per archetype; the PRNG jitters each dial by ±0.08 (bluff ±0.02). */
const ARCHETYPES: Record<MttBotArchetype, { tightness: number; aggression: number; bluff: number }> = {
  rock: { tightness: 0.8, aggression: 0.3, bluff: 0.02 },
  tag: { tightness: 0.62, aggression: 0.7, bluff: 0.06 },
  lag: { tightness: 0.35, aggression: 0.82, bluff: 0.11 },
  station: { tightness: 0.3, aggression: 0.25, bluff: 0.03 },
  maniac: { tightness: 0.18, aggression: 0.95, bluff: 0.18 },
};
/** Rotation weights the field toward sensible regulars: 2 TAG, 1 each of the rest per 6 bots. */
const ARCHETYPE_CYCLE: readonly MttBotArchetype[] = ['tag', 'rock', 'lag', 'tag', 'station', 'maniac'];

export interface MttBotRosterEntry {
  walletAddress: string;
  displayName: string;
  archetype: MttBotArchetype;
  personality: { tightness: number; aggression: number; bluff: number };
}

/** mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Wallet for roster index 0…69: last four chars "b1" + two-digit decimal index (b100…b169),
 * same "bot" hex-speak convention as the daily (b071–b077) and cash (b081–b087) bots.
 */
export function mttBotWallet(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 99) throw new Error(`mtt bot index out of range: ${index}`);
  return `0x${'0'.repeat(36)}b1${String(index).padStart(2, '0')}`;
}

export function buildMttBotRoster(seed: number = MTT_BOT_ROSTER_SEED): MttBotRosterEntry[] {
  const rng = mulberry32(seed);
  const jitter = (spread: number) => (rng() * 2 - 1) * spread;
  return MTT_BOT_NAMES.slice(0, MTT_BOT_COUNT).map((displayName, i) => {
    const archetype = ARCHETYPE_CYCLE[i % ARCHETYPE_CYCLE.length];
    const base = ARCHETYPES[archetype];
    return {
      walletAddress: mttBotWallet(i),
      displayName,
      archetype,
      personality: {
        tightness: round2(clamp(base.tightness + jitter(0.08), 0.05, 0.95)),
        aggression: round2(clamp(base.aggression + jitter(0.08), 0.05, 0.98)),
        bluff: round2(clamp(base.bluff + jitter(0.02), 0, 0.25)),
      },
    };
  });
}

/** SQL VALUES rows for migration 203 (used once to author it; the unit test re-checks). */
export function mttBotRosterSqlValues(roster: MttBotRosterEntry[] = buildMttBotRoster()): string {
  return roster
    .map(
      (b) =>
        `  ('${b.walletAddress}', '${b.displayName}', '${JSON.stringify(b.personality)}', 'mtt')`,
    )
    .join(',\n');
}
