/**
 * arcade-cipher.ts — MORBIUS Arcade: Cipher (Mastermind code-breaking).
 *
 * A secret code of `codeLen` pegs over `symbols` colours (duplicates allowed) is
 * sealed behind a commitment hash at /start. Each guess returns Mastermind
 * feedback — exact pegs (right colour, right slot) and partial pegs (right
 * colour, wrong slot). Crack the whole code and you win the CRACK LADDER for the
 * guess you cracked on (fastest cracks pay most; the prize decays each guess).
 * At any point you may bank the SECURED value earned from your best exact-peg
 * count so far. Spend the last guess without cracking or banking and the round
 * busts.
 *
 * Provably fair: the secret code is derived up front from the platform's
 * HMAC-SHA256 byte stream (the same primitive as the poker shuffle, the lottery
 * 6-of-55 draw, Mines, Towers and Chicken). The server commits to
 * `serverSeedHash` at round start and reveals `serverSeed` only when the round
 * settles, so anyone with the public payload can recompute the exact code,
 * re-score every guess, and confirm the code was fixed before the first guess
 * and never moved.
 *
 * Code derivation (matches the verifier exactly):
 *   For peg P in [0, codeLen): bytes = hmacByteStream(serverSeed, clientSeed,
 *   nonce, P*4); symbol[P] = min(symbols-1, floor(bytesToFloat(bytes) * symbols)).
 *   Cursor advances by 4 per peg — the same convention as deriveChickenBumpers
 *   (floor × 4) and the Fisher-Yates loops.
 *
 * All money math is integer × 100 (multipliers) → BigInt at the wallet path; no
 * floats are ever compared. The crack / secured ladders are taken verbatim from
 * the approved prototype (public/cipher-lab.html) and tuned so that even strong
 * play returns just under the stake on average (a small built-in house edge).
 */

/** House edge target baked into the ladders, in basis points (200 = 2%). */
export const CIPHER_HOUSE_EDGE_BP = 200;

export const CIPHER_MIN_BET = 100;
export const CIPHER_MAX_BET = 100000;

export type CipherDifficulty = 'easy' | 'medium' | 'hard';

export interface CipherDifficultyConfig {
  /** Number of pegs in the secret code. */
  codeLen: number;
  /** Number of distinct symbols (colours) a peg can take. */
  symbols: number;
  /** Maximum guesses before the round busts. */
  maxGuesses: number;
  /**
   * Crack ladder, ×100. crack[g] = multiplier paid for cracking on guess `g`
   * (1-based). crack[0] is an unused placeholder. crack.length === maxGuesses+1.
   * Faster cracks pay more; the prize decays each guess.
   */
  crack: number[];
  /**
   * Secured ladder, ×100. secure[e] = multiplier banked when the best exact-peg
   * count is `e`. secure[0] = 0 (can't bank with no exact pegs).
   * secure.length === codeLen+1.
   */
  secure: number[];
}

/**
 * Difficulty table. The codeLen / symbols / maxGuesses and the crack-ladder
 * SHAPE (jackpot-on-guess-1, decaying per guess) and the secured "bank your
 * progress" mechanic all come straight from the approved prototype
 * (public/cipher-lab.html). The ladder VALUES, however, are re-tuned here — the
 * prototype's literal numbers were never balanced (the lab states the real build
 * derives the code from the server HMAC pipeline and "tunes the ladders so
 * return stays at the house edge"; its own arrays return ~500% under strong
 * play). These values were fit by Monte-Carlo against a strong Mastermind solver
 * (fixed opener + random-consistent candidate) so optimal play returns ~97.5%
 * (≈2.5% edge, the lab's ~2% target) on every difficulty:
 *
 *   crack[g] = EV-fair scaling of the prototype's shape, so the strong solver's
 *     crack-distribution × crack[g] sums to the target — slow cracks correctly
 *     pay BELOW 1.0× (you spent the guesses), the guess-1 jackpot stays huge.
 *   secure[e] is a conservative consolation (all < 1.0×) so banking your best
 *     exact-peg count is a real choice without becoming a +EV exploit.
 *
 * Do not retune without re-running the Monte-Carlo RTP check.
 */
export const CIPHER_DIFFICULTIES: Record<CipherDifficulty, CipherDifficultyConfig> = {
  easy: {
    codeLen: 4,
    symbols: 5,
    maxGuesses: 8,
    crack: [0, 2143, 535, 178, 80, 46, 30, 22, 18],
    secure: [0, 15, 35, 60],
  },
  medium: {
    codeLen: 4,
    symbols: 6,
    maxGuesses: 7,
    crack: [0, 3938, 827, 255, 108, 59, 35, 23],
    secure: [0, 15, 35, 60],
  },
  hard: {
    codeLen: 5,
    symbols: 6,
    maxGuesses: 7,
    crack: [0, 8730, 1527, 392, 152, 74, 41, 27],
    secure: [0, 12, 28, 48, 72],
  },
};

export function isCipherDifficulty(value: unknown): value is CipherDifficulty {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

export interface CipherFeedback {
  /** Pegs that are the right symbol in the right slot. */
  exact: number;
  /** Pegs that are the right symbol in the wrong slot (duplicate-correct). */
  partial: number;
}

/**
 * Derive the secret code for the whole round. One 4-byte slice per peg at
 * cursor = peg × 4 — the same cursor convention as deriveChickenBumpers and the
 * Fisher-Yates loops. symbol = min(symbols-1, floor(r × symbols)), so the code
 * is a uniform draw over [0, symbols) per peg with duplicates allowed.
 *
 * Returns an array of `codeLen` symbol indices in [0, symbols).
 */
export function deriveSecretCode(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
  difficulty: CipherDifficulty,
): number[] {
  const { codeLen, symbols } = CIPHER_DIFFICULTIES[difficulty];
  const code: number[] = [];
  for (let peg = 0; peg < codeLen; peg++) {
    const float = bytesToFloat(hmacByteStream(peg * 4));
    // float < 1 always, so floor(float × symbols) ≤ symbols - 1.
    code.push(Math.min(symbols - 1, Math.floor(float * symbols)));
  }
  return code;
}

/**
 * Mastermind feedback for a guess against the secret code, duplicate-correct.
 * exact = positions that match; partial = remaining colour matches counted by
 * min(remaining-in-code, remaining-in-guess) per colour. Matches the prototype's
 * `score()` exactly so client and verifier agree.
 */
export function cipherFeedback(guess: number[], code: number[]): CipherFeedback {
  const slots = code.length;
  let exact = 0;
  const codeCount: Record<number, number> = {};
  const guessCount: Record<number, number> = {};
  for (let i = 0; i < slots; i++) {
    if (guess[i] === code[i]) {
      exact++;
    } else {
      codeCount[code[i]] = (codeCount[code[i]] || 0) + 1;
      guessCount[guess[i]] = (guessCount[guess[i]] || 0) + 1;
    }
  }
  let partial = 0;
  for (const k of Object.keys(guessCount)) {
    const key = Number(k);
    if (codeCount[key]) partial += Math.min(codeCount[key], guessCount[key]);
  }
  return { exact, partial };
}

/**
 * Validate a guess payload for a difficulty: must be an array of exactly
 * `codeLen` integers, each in [0, symbols). Returns the normalized integer
 * array, or null if invalid.
 */
export function validateCipherGuess(
  guess: unknown,
  difficulty: CipherDifficulty,
): number[] | null {
  const { codeLen, symbols } = CIPHER_DIFFICULTIES[difficulty];
  if (!Array.isArray(guess) || guess.length !== codeLen) return null;
  const out: number[] = [];
  for (const raw of guess) {
    const n = Math.floor(Number(raw));
    if (!Number.isInteger(n) || n < 0 || n >= symbols) return null;
    out.push(n);
  }
  return out;
}

/**
 * ×100 multiplier paid for cracking the code on guess `guessNum` (1-based).
 * Returns 0 for an out-of-range guess number.
 */
export function cipherCrackMultiplierX100(
  difficulty: CipherDifficulty,
  guessNum: number,
): number {
  const { crack, maxGuesses } = CIPHER_DIFFICULTIES[difficulty];
  if (!Number.isInteger(guessNum) || guessNum < 1 || guessNum > maxGuesses) return 0;
  return crack[guessNum];
}

/**
 * ×100 secured multiplier banked at a given best-exact-peg count. Returns 0 when
 * bestExact < 1 (you must have landed at least one exact peg to bank).
 */
export function cipherSecuredMultiplierX100(
  difficulty: CipherDifficulty,
  bestExact: number,
): number {
  const { secure, codeLen } = CIPHER_DIFFICULTIES[difficulty];
  if (!Number.isInteger(bestExact) || bestExact < 1 || bestExact > codeLen) return 0;
  return secure[bestExact];
}

/**
 * Payout in chips for a settled win at the given ×100 multiplier.
 * floor(bet × multiplier_x100 / 100). Matches the verifier's arithmetic.
 */
export function cipherPayout(bet: number, multiplierX100: number): number {
  if (!Number.isInteger(bet) || bet < CIPHER_MIN_BET || bet > CIPHER_MAX_BET) {
    throw new Error('Cipher bet out of range');
  }
  if (!Number.isInteger(multiplierX100) || multiplierX100 < 0) {
    throw new Error('Cipher multiplier out of range');
  }
  return Math.floor((bet * multiplierX100) / 100);
}
