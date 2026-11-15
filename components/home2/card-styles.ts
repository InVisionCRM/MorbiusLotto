/**
 * Chronograph card lockups — one per game.
 *
 * Every homepage card is a watch "reference": the art sits in a dial and the
 * title is live HTML underneath. To make the floor read as if a different
 * watchmaker drew each card, every game gets its own typographic lockup
 * (face, weight, case, tracking, size, arrangement) and its own dial
 * treatment (tone filter, case shape, tick and hand colour). Palette is shared:
 * black, brushed steel, gold, cyan, violet.
 *
 * The titles are never baked into the art: art comes from
 * /home2/clean/<key>.webp (title-free renders).
 *
 * Keep the table in FLOOR_GAMES order. A game missing here falls back to
 * DEFAULT_LOCKUP, so a new catalog entry still renders — but give it its own
 * row so it doesn't look stamped from the default mold.
 */

/** Card title faces, loaded in app/layout.tsx. `w` ≈ average glyph advance in em, used to fit the title. */
export const CARD_FONTS = {
  mic: { family: "'Michroma',sans-serif", w: 0.86 },
  ten: { family: "'Tenor Sans',sans-serif", w: 0.6 },
  mar: { family: "'Marcellus SC',serif", w: 0.66 },
  sai: { family: "'Saira Condensed',sans-serif", w: 0.44 },
  bai: { family: "'Bai Jamjuree',sans-serif", w: 0.6 },
  jur: { family: "'Jura',sans-serif", w: 0.56 },
  cor: { family: "'Cormorant Garamond',serif", w: 0.5 },
  ita: { family: "'Italiana',serif", w: 0.56 },
  cin: { family: "'Cinzel',serif", w: 0.72 },
  bod: { family: "'Bodoni Moda',serif", w: 0.58 },
  jos: { family: "'Josefin Sans',sans-serif", w: 0.6 },
  poi: { family: "'Poiret One',sans-serif", w: 0.56 },
  syn: { family: "'Syncopate',sans-serif", w: 0.9 },
  cha: { family: "'Chakra Petch',sans-serif", w: 0.6 },
  gru: { family: "'Gruppo',sans-serif", w: 0.6 },
  fed: { family: "'Federo',sans-serif", w: 0.62 },
} as const;

export type CardFont = keyof typeof CARD_FONTS;

/**
 * How title + subtitle are set:
 *  stack  — title, then a tracked mono caption (the Chronograph default)
 *  sub    — caption first, title under it ("The Morbius Daily / Freeroll")
 *  rule   — title, then the caption between two hairlines
 *  split  — title with an italic serif tail on the same baseline
 *  inline — title and a gold suffix on one line, caption below
 */
export type Arrangement = 'stack' | 'sub' | 'rule' | 'split' | 'inline';

/** Tone filters (SVG, defined once in ChronoDefs). */
export type ArtTone = 'st' | 'gd' | 'cy' | 'vi' | 'ink' | 'dusk';

/**
 * Case / bezel:
 *  dial    — the mockup's 60-tick dial
 *  minute  — fine minute track with heavy hour markers
 *  bezel   — knurled coin-edge bezel with a 12 o'clock pip
 *  sector  — railway track (inner + outer ring, ticks between)
 *  cushion — cushion-case (rounded square) dial
 *  chrome  — Liquid Chrome rim (minority accent)
 */
export type DialFrame = 'dial' | 'minute' | 'bezel' | 'sector' | 'cushion' | 'chrome';

export type Ink = 'steel' | 'gold' | 'cyan' | 'violet';

export interface CardLockup {
  /** Display title, in the case it should be typed (CSS may still transform it). */
  title: string;
  /** Short caption (subtitle). */
  sub: string;
  /** Gold suffix for the `inline` arrangement / italic tail for `split`. */
  tail?: string;
  font: CardFont;
  /** px at desktop card width; the card shrinks it to fit narrower cards. */
  size: number;
  weight?: number;
  /** em */
  tracking?: number;
  upper?: boolean;
  italic?: boolean;
  smallCaps?: boolean;
  arrangement: Arrangement;
  tone: ArtTone;
  frame: DialFrame;
  ticks?: Ink;
  hand?: Ink;
  /** object-position for the art inside the dial (default center). */
  pos?: string;
  /** Art zoom inside the dial (default 1). */
  zoom?: number;
}

export const DEFAULT_LOCKUP: Omit<CardLockup, 'title' | 'sub'> = {
  font: 'ten',
  size: 22,
  tracking: 0.06,
  arrangement: 'stack',
  tone: 'st',
  frame: 'dial',
};

export const CARD_LOCKUPS: Record<string, CardLockup> = {
  blackjack: { title: 'Blackjack', sub: 'Single + multi', font: 'jos', size: 17, weight: 300, tracking: 0.3, upper: true, arrangement: 'rule', tone: 'st', frame: 'dial' },
  ruby: { title: "Ruby's", sub: 'Table', font: 'sai', size: 30, weight: 300, tracking: 0.06, upper: true, arrangement: 'stack', tone: 'cy', frame: 'chrome', pos: '50% 30%' },
  poker: { title: 'Poker', sub: 'Cash tables', font: 'jur', size: 24, tracking: 0.08, arrangement: 'stack', tone: 'gd', frame: 'dial', ticks: 'gold' },
  keno: { title: 'Keno', sub: 'Pick 10', font: 'ten', size: 22, tracking: 0.06, arrangement: 'stack', tone: 'cy', frame: 'minute', ticks: 'cyan' },
  dice: { title: 'Dice', sub: '99% RTP', font: 'mar', size: 22, arrangement: 'stack', tone: 'st', frame: 'bezel' },
  roulette: { title: 'Roulette', sub: 'Single zero', tail: 'européenne', font: 'cor', size: 27, weight: 500, italic: true, arrangement: 'split', tone: 'gd', frame: 'sector', ticks: 'gold', pos: '50% 70%' },
  dicex2: { title: 'Dice', sub: 'Double roll', tail: '×2', font: 'gru', size: 25, tracking: 0.2, upper: true, arrangement: 'inline', tone: 'vi', frame: 'dial', ticks: 'violet', hand: 'cyan' },
  towers: { title: 'Towers', sub: 'Climb', font: 'ita', size: 25, tracking: 0.16, upper: true, arrangement: 'sub', tone: 'gd', frame: 'cushion', pos: '50% 60%' },
  limbo: { title: 'Limbo', sub: 'Any multiplier', font: 'syn', size: 15, tracking: 0.22, upper: true, arrangement: 'stack', tone: 'cy', frame: 'minute', hand: 'steel', pos: '50% 70%' },
  baccarat: { title: 'Baccarat', sub: 'Player · Banker', font: 'cin', size: 20, tracking: 0.08, arrangement: 'rule', tone: 'st', frame: 'dial', ticks: 'gold' },
  videopoker: { title: 'Video Poker', sub: 'Jacks or better', font: 'cha', size: 17, weight: 300, tracking: 0.12, upper: true, arrangement: 'stack', tone: 'vi', frame: 'sector', ticks: 'violet' },
  craps: { title: 'Craps', sub: 'Pass line', font: 'bod', size: 28, italic: true, arrangement: 'stack', tone: 'st', frame: 'bezel', ticks: 'gold' },
  crapsmulti: { title: 'Craps', sub: 'Table', font: 'ten', size: 24, tracking: 0.04, arrangement: 'stack', tone: 'gd', frame: 'dial' },
  ultimateholdem: { title: 'Ultimate', sub: "Hold'em", font: 'mar', size: 21, arrangement: 'sub', tone: 'st', frame: 'minute', hand: 'cyan' },
  uthmulti: { title: "Hold'em", sub: 'Table', font: 'mic', size: 15, tracking: 0.06, arrangement: 'stack', tone: 'st', frame: 'dial' },
  roulettemulti: { title: 'Roulette', sub: 'Table', font: 'bai', size: 21, weight: 300, tracking: 0.1, upper: true, arrangement: 'stack', tone: 'dusk', frame: 'dial', ticks: 'cyan', pos: '50% 70%' },
  caribbeanstud: { title: 'Caribbean', sub: 'Stud poker', font: 'poi', size: 22, tracking: 0.04, arrangement: 'sub', tone: 'gd', frame: 'dial', ticks: 'gold' },
  spanish21: { title: 'Spanish', sub: 'No tens', tail: '21', font: 'fed', size: 21, tracking: 0.04, arrangement: 'inline', tone: 'vi', frame: 'minute', ticks: 'violet' },
  doubleexposure: { title: 'Double Exposure', sub: 'Both cards up', font: 'cor', size: 17, weight: 500, tracking: 0.16, upper: true, arrangement: 'stack', tone: 'cy', frame: 'cushion', hand: 'steel' },
  pontoon: { title: 'Pontoon', sub: 'Five-card trick', font: 'bod', size: 18, tracking: 0.14, upper: true, arrangement: 'rule', tone: 'ink', frame: 'dial', hand: 'cyan' },
  freebet: { title: 'Free Bet', sub: 'Blackjack', font: 'ita', size: 25, tracking: 0.04, arrangement: 'stack', tone: 'gd', frame: 'bezel' },
  bjswitch: { title: 'Switch', sub: 'Blackjack', font: 'cha', size: 22, weight: 300, tracking: 0.04, arrangement: 'sub', tone: 'vi', frame: 'dial', hand: 'cyan' },
  dragontiger: { title: 'Dragon', sub: 'One card', tail: 'tiger', font: 'syn', size: 13, tracking: 0.18, upper: true, arrangement: 'split', tone: 'dusk', frame: 'sector', ticks: 'gold' },
  andarbahar: { title: 'Andar Bahar', sub: 'Pick a side', font: 'gru', size: 23, tracking: 0.12, upper: true, arrangement: 'stack', tone: 'gd', frame: 'minute', ticks: 'gold', pos: '50% 30%', zoom: 1.12 },
  pachinko: { title: 'Pachinko', sub: 'Pin storm', font: 'jos', size: 19, weight: 200, tracking: 0.24, upper: true, arrangement: 'stack', tone: 'vi', frame: 'chrome' },
  cascade: { title: 'Cascade', sub: 'Chain wins', font: 'poi', size: 24, tracking: 0.08, arrangement: 'rule', tone: 'cy', frame: 'dial', ticks: 'cyan' },
  firewalk: { title: 'Firewalk', sub: 'Raise the heat', font: 'fed', size: 19, tracking: 0.12, upper: true, arrangement: 'sub', tone: 'gd', frame: 'bezel' },
  heist: { title: 'Heist', sub: 'Crack the vault', font: 'bai', size: 22, weight: 300, tracking: 0.3, upper: true, arrangement: 'stack', tone: 'ink', frame: 'chrome', hand: 'cyan' },
  threecard: { title: 'Three Card', sub: 'Poker at speed', font: 'mar', size: 19, arrangement: 'rule', tone: 'st', frame: 'cushion', ticks: 'gold' },
  paigow: { title: 'Pai Gow', sub: 'Two hands', tail: 'poker', font: 'ten', size: 19, tracking: 0.16, upper: true, arrangement: 'split', tone: 'vi', frame: 'bezel' },
  greeddice: { title: 'Greed', sub: 'Push your luck', tail: 'dice', font: 'cor', size: 30, weight: 500, italic: true, arrangement: 'inline', tone: 'gd', frame: 'dial', ticks: 'gold' },
  cipher: { title: 'Cipher', sub: 'Break the code', font: 'jur', size: 21, tracking: 0.28, upper: true, arrangement: 'stack', tone: 'cy', frame: 'sector', ticks: 'cyan' },
  hilo: { title: 'Hi', sub: 'Higher or lower', tail: '· Lo', font: 'sai', size: 30, weight: 300, tracking: 0.08, upper: true, arrangement: 'inline', tone: 'dusk', frame: 'chrome' },
  chicken: { title: 'Chicken', sub: 'Cross the road', font: 'mic', size: 14, tracking: 0.16, upper: true, arrangement: 'sub', tone: 'st', frame: 'minute', ticks: 'gold', pos: '62% 50%' },
};

/** Lockup for a game, falling back to a plain Tenor stack built from its catalog name. */
export function lockupFor(key: string, name: string): CardLockup {
  const l = CARD_LOCKUPS[key];
  if (l) return l;
  const title = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return { ...DEFAULT_LOCKUP, title, sub: '' };
}

/**
 * Fit factor for the title (in cqw of the card). Desktop cards are ~210px wide,
 * mobile ~165px; the title is set at min(size, fit·cqw) so long titles in wide
 * faces step down instead of wrapping mid-word or overflowing the card.
 */
export function titleFit(l: CardLockup): number {
  const f = CARD_FONTS[l.font];
  const tail = l.arrangement === 'inline' || l.arrangement === 'split' ? (l.tail?.length ?? 0) + 1 : 0;
  // Longest word is what must fit on a line; multi-word titles may wrap between words.
  const words = l.title.split(/\s+/);
  const longest = Math.max(...words.map((w) => w.length), 1);
  const chars = l.arrangement === 'inline' || l.arrangement === 'split' ? l.title.length + tail : longest;
  const advance = (l.upper ? f.w * 1.12 : f.w) + (l.tracking ?? 0);
  // 86% of the card's inner width, expressed in cqw per px-of-font.
  return 86 / (chars * advance);
}
