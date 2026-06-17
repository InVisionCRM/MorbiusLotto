/**
 * cipherOdds — odds-tab data for /cipher (Mastermind code-breaking). Two ladders
 * sit on every round: the CRACK ladder (multiplier paid for solving the code on
 * guess g — fastest cracks pay most, decaying each guess) and the SECURED ladder
 * (a consolation multiplier you can bank from your best exact-peg count, all
 * below 1.0×). Values are taken verbatim from CIPHER_DIFFICULTIES in
 * server/src/services/arcade-cipher.ts.
 *
 * The ladders are Monte-Carlo-tuned against a strong solver so optimal play
 * returns ~97.5% — a ~2.5% house edge (the lab's ~2% target; CIPHER_HOUSE_EDGE_BP
 * = 200). Edge varies a touch by difficulty, so each variant carries its own.
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab';

interface Difficulty {
  id: string;
  label: string;
  codeLen: number;
  symbols: number;
  maxGuesses: number;
  /** ×100, crack[g] for cracking on guess g (1-based); crack[0] unused. */
  crack: number[];
  /** ×100, secure[e] banked at best-exact-peg count e; secure[0] = 0. */
  secure: number[];
  /** Optimal-play house edge for this difficulty, %. */
  edgePct: number;
}

// codeLen / symbols / maxGuesses / crack / secure mirror CIPHER_DIFFICULTIES.
const DIFFICULTIES: Difficulty[] = [
  {
    id: 'easy',
    label: 'Easy',
    codeLen: 4,
    symbols: 5,
    maxGuesses: 8,
    crack: [0, 2143, 535, 178, 80, 46, 30, 22, 18],
    secure: [0, 15, 35, 60],
    edgePct: 2.5,
  },
  {
    id: 'medium',
    label: 'Medium',
    codeLen: 4,
    symbols: 6,
    maxGuesses: 7,
    crack: [0, 3938, 827, 255, 108, 59, 35, 23],
    secure: [0, 15, 35, 60],
    edgePct: 2.5,
  },
  {
    id: 'hard',
    label: 'Hard',
    codeLen: 5,
    symbols: 6,
    maxGuesses: 7,
    crack: [0, 8730, 1527, 392, 152, 74, 41, 27],
    secure: [0, 12, 28, 48, 72],
    edgePct: 2.5,
  },
];

function fmtX(x100: number): string {
  return `${(x100 / 100).toFixed(2)}×`;
}

function buildVariant(d: Difficulty): OddsVariant {
  const rows: OddsRow[] = [];
  for (let g = 1; g <= d.maxGuesses; g++) {
    const x100 = d.crack[g];
    rows.push({
      outcome: `Guess ${g}`,
      chance: fmtX(x100),
      extra: x100 >= 100 ? 'profit' : 'partial',
      tone: g === 1 ? 'amber' : x100 >= 100 ? 'cyan' : 'muted',
    });
  }
  // Secured (bank-your-progress) consolation rungs, all < 1.0×.
  for (let e = 1; e <= d.codeLen; e++) {
    rows.push({
      outcome: `Bank ${e} exact`,
      chance: fmtX(d.secure[e]),
      extra: 'secured',
      tone: 'slate',
    });
  }
  return {
    id: d.id,
    label: `${d.label} · ${d.codeLen}×${d.symbols}`,
    edgePct: d.edgePct,
    rtpPct: 100 - d.edgePct,
    rows,
    headers: ['Outcome', 'Pays', 'Kind'],
    note: `A ${d.codeLen}-peg code over ${d.symbols} colours (duplicates allowed), ${d.maxGuesses} guesses. Crack on guess 1 for the ${fmtX(d.crack[1])} jackpot; the prize decays each guess and slow cracks pay below 1.0× (you spent the guesses). Or bank the secured multiplier for your best exact-peg count. ~${d.edgePct.toFixed(1)}% edge under optimal play.`,
  };
}

export const cipherOdds: GameOdds = {
  blurb:
    'Break a sealed colour code Mastermind-style. The crack ladder pays a jackpot for solving on the first guess and decays from there; you can instead bank a small secured multiplier from your best exact-peg count. The ~2% edge is tuned into the ladders.',
  variants: DIFFICULTIES.map(buildVariant),
};
