/**
 * win-sounds.ts — the catalogue of real recorded win samples, and the recipes
 * that stack them into a sting.
 *
 * Everything here is Creative Commons Zero, verified on each asset's own
 * Freesound page rather than trusted from a search filter, and logged in
 * public/sounds/SOURCES.md as that file requires. No attribution is legally
 * required; the author and page are kept anyway so any claim can be re-checked
 * years from now.
 *
 * WHY LAYERS. A win sting is assembled from up to four parts rather than
 * chosen as a single clip: the IMPACT lands under the word, the BODY carries
 * the tune, the TAIL rings out behind it, and COINS rattles the payout.
 * Staggering them is most of what separates a produced sting from a stacked
 * one — a lone clip, however good, always sounds like a lone clip.
 *
 * WHY `norm`. Measured, not guessed. These files came from thirty different
 * authors and their loudness spans roughly 35 dB, so a shared gain would have
 * made one layer deafening and another inaudible. Each `norm` trims its file to
 * a common reference of about -24 dBFS short-term (loudest 300 ms, which tracks
 * perceived loudness far better than whole-file RMS on sounds this sparse), and
 * is capped so nothing peaks above -1 dBFS. The upshot: the gains in
 * WIN_RECIPES are a musical balance between layers, and swapping any file for
 * another keeps roughly the level you already dialled in.
 *
 * TO RE-TUNE: open /win-sound-lab.html, listen, and paste what it exports over
 * WIN_RECIPES. That page and this file are the two halves of the same job.
 */

export type WinRole = 'impact' | 'body' | 'tail' | 'coins';

export interface WinSample {
  file: string;
  role: WinRole;
  title: string;
  author: string;
  /** The asset page, so the CC0 claim stays checkable. */
  page: string;
  /** Seconds, as decoded. */
  dur: number;
  /** Loudness-matching gain, measured. See the note above. */
  norm: number;
}

/** Where the files live under public/. */
export const WIN_SOUND_DIR = '/sounds/wins/';

export const WIN_SAMPLES: WinSample[] = [
  {
    file: 'impact-brass-hit.mp3',
    role: 'impact',
    title: 'brass_Hit_Jean',
    author: 'germona',
    page: 'https://freesound.org/people/germona/sounds/653604/',
    dur: 4.03,
    norm: 0.269,
  },
  {
    file: 'impact-orchestral-hit.mp3',
    role: 'impact',
    title: 'Orchestral Hit',
    author: 'Rizzard',
    page: 'https://freesound.org/people/Rizzard/sounds/559391/',
    dur: 4,
    norm: 0.226,
  },
  {
    file: 'impact-riser-hit.mp3',
    role: 'impact',
    title: 'Riser Hit sfx 015',
    author: 'AudioPapkin',
    page: 'https://freesound.org/people/AudioPapkin/sounds/511863/',
    dur: 2.01,
    norm: 0.229,
  },
  {
    file: 'impact-soft-cinematic-impact.mp3',
    role: 'impact',
    title: 'Soft Cinematic Impact',
    author: 'Rizzard',
    page: 'https://freesound.org/people/Rizzard/sounds/560156/',
    dur: 6,
    norm: 0.186,
  },
  {
    file: 'body-achievement-jingle.mp3',
    role: 'body',
    title: 'Achievement Accomplish Jingle App UI',
    author: 'CogFireStudios',
    page: 'https://freesound.org/people/CogFireStudios/sounds/619840/',
    dur: 2.37,
    norm: 0.596,
  },
  {
    file: 'body-bonus-points.mp3',
    role: 'body',
    title: 'Bonus Points 1_1',
    author: 'Joao_Janz',
    page: 'https://freesound.org/people/Joao_Janz/sounds/482653/',
    dur: 0.75,
    norm: 3.199,
  },
  {
    file: 'body-collect.mp3',
    role: 'body',
    title: 'collect',
    author: 'Wagna',
    page: 'https://freesound.org/people/Wagna/sounds/325805/',
    dur: 1.27,
    norm: 0.794,
  },
  {
    file: 'body-game-reward.mp3',
    role: 'body',
    title: 'Game Reward',
    author: 'IENBA',
    page: 'https://freesound.org/people/IENBA/sounds/656643/',
    dur: 5,
    norm: 0.207,
  },
  {
    file: 'body-game-success-fanfare.mp3',
    role: 'body',
    title: 'Game Success Fanfare',
    author: 'el_boss',
    page: 'https://freesound.org/people/el_boss/sounds/677859/',
    dur: 3.38,
    norm: 0.422,
  },
  {
    file: 'body-glockenspiel-treasure.mp3',
    role: 'body',
    title: 'Short Success Sound Glockenspiel Treasure Video G...',
    author: 'FunWithSound',
    page: 'https://freesound.org/people/FunWithSound/sounds/456965/',
    dur: 2.48,
    norm: 1.161,
  },
  {
    file: 'body-level-win.mp3',
    role: 'body',
    title: 'Level win',
    author: 'Tuudurt',
    page: 'https://freesound.org/people/Tuudurt/sounds/258142/',
    dur: 3.48,
    norm: 0.543,
  },
  {
    file: 'body-magic-win-success-2.mp3',
    role: 'body',
    title: 'magic_game_win_success_2',
    author: 'MLaudio',
    page: 'https://freesound.org/people/MLaudio/sounds/615100/',
    dur: 2.4,
    norm: 4.169,
  },
  {
    file: 'body-magic-win-success.mp3',
    role: 'body',
    title: 'magic_game_win_success',
    author: 'MLaudio',
    page: 'https://freesound.org/people/MLaudio/sounds/615099/',
    dur: 3.04,
    norm: 4.169,
  },
  {
    file: 'body-mission-complete.mp3',
    role: 'body',
    title: 'Level Up / Mission Complete',
    author: 'Beetlemuse',
    page: 'https://freesound.org/people/Beetlemuse/sounds/528958/',
    dur: 3.43,
    norm: 0.257,
  },
  {
    file: 'body-success-fanfare-trumpets.mp3',
    role: 'body',
    title: 'Success Fanfare Trumpets',
    author: 'FunWithSound',
    page: 'https://freesound.org/people/FunWithSound/sounds/456966/',
    dur: 4.44,
    norm: 0.569,
  },
  {
    file: 'body-tada-fanfare-a.mp3',
    role: 'body',
    title: 'Tada Fanfare A',
    author: 'plasterbrain',
    page: 'https://freesound.org/people/plasterbrain/sounds/397355/',
    dur: 1.72,
    norm: 0.61,
  },
  {
    file: 'body-triumph-jingle.mp3',
    role: 'body',
    title: 'Triumph (jingle)',
    author: 'lightbulbafagd',
    page: 'https://freesound.org/people/lightbulbafagd/sounds/518750/',
    dur: 8,
    norm: 0.403,
  },
  {
    file: 'body-victory-sting.mp3',
    role: 'body',
    title: 'Victory (short sting)',
    author: 'xkeril',
    page: 'https://freesound.org/people/xkeril/sounds/706753/',
    dur: 6,
    norm: 0.638,
  },
  {
    file: 'body-win-brass.mp3',
    role: 'body',
    title: 'WinBrass',
    author: 'Fupicat',
    page: 'https://freesound.org/people/Fupicat/sounds/521639/',
    dur: 3.78,
    norm: 1.202,
  },
  {
    file: 'body-win-spacey.mp3',
    role: 'body',
    title: 'Win Spacey',
    author: 'GameAudio',
    page: 'https://freesound.org/people/GameAudio/sounds/220184/',
    dur: 0.99,
    norm: 0.881,
  },
  {
    file: 'tail-achievement-chimes.mp3',
    role: 'tail',
    title: 'Achievment Chimes',
    author: 'LaurenPonder',
    page: 'https://freesound.org/people/LaurenPonder/sounds/635665/',
    dur: 6.42,
    norm: 1.396,
  },
  {
    file: 'tail-achievement-sparkle.mp3',
    role: 'tail',
    title: 'achievement-sparkle',
    author: 'SkySpeira',
    page: 'https://freesound.org/people/SkySpeira/sounds/715067/',
    dur: 1.76,
    norm: 6.095,
  },
  {
    file: 'tail-magic-sparkle.mp3',
    role: 'tail',
    title: 'cartoon_wink_magic_sparkle',
    author: 'MLaudio',
    page: 'https://freesound.org/people/MLaudio/sounds/511485/',
    dur: 1.27,
    norm: 6.383,
  },
  {
    file: 'tail-sparkling-star.mp3',
    role: 'tail',
    title: 'Sparkling Star 04',
    author: 'LilMati',
    page: 'https://freesound.org/people/LilMati/sounds/462092/',
    dur: 4.04,
    norm: 0.221,
  },
  {
    file: 'tail-success-bell.mp3',
    role: 'tail',
    title: 'success_bell',
    author: 'MLaudio',
    page: 'https://freesound.org/people/MLaudio/sounds/511484/',
    dur: 4,
    norm: 2.723,
  },
  {
    file: 'tail-victory-chime.mp3',
    role: 'tail',
    title: 'victory chime',
    author: '1bob',
    page: 'https://freesound.org/people/1bob/sounds/717771/',
    dur: 0.81,
    norm: 0.12,
  },
  {
    file: 'coins-badge-coin-win.mp3',
    role: 'coins',
    title: 'Badge Coin Win',
    author: 'steaq',
    page: 'https://freesound.org/people/steaq/sounds/387232/',
    dur: 3.06,
    norm: 1.365,
  },
  {
    file: 'coins-casino-hit-big-money.mp3',
    role: 'coins',
    title: 'Casino Hit Big Money',
    author: 'modusmogulus',
    page: 'https://freesound.org/people/modusmogulus/sounds/787908/',
    dur: 2.03,
    norm: 0.596,
  },
  {
    file: 'coins-money-handful.mp3',
    role: 'coins',
    title: 'MONEY_001',
    author: 'rolandseer',
    page: 'https://freesound.org/people/rolandseer/sounds/443334/',
    dur: 2.11,
    norm: 0.447,
  },
  {
    file: 'coins-slot-machine-payout.mp3',
    role: 'coins',
    title: 'slot machine payout',
    author: 'jack126guy',
    page: 'https://freesound.org/people/jack126guy/sounds/361346/',
    dur: 3.82,
    norm: 1.245,
  },
];

export const WIN_SAMPLES_BY_FILE: Record<string, WinSample> = Object.fromEntries(
  WIN_SAMPLES.map((s) => [s.file, s]),
);

export type WinStingTier = 'small' | 'big' | 'huge';

export interface WinLayer {
  file: string;
  /** Balance against the other layers, after `norm` has levelled them. */
  gain: number;
  /** Milliseconds after the win before this layer starts. */
  delay: number;
}

export type WinRecipe = Partial<Record<WinRole, WinLayer>>;

/**
 * The stings themselves.
 *
 * `small` is deliberately the plainest of the three. It fires on ordinary wins,
 * which is to say constantly, and a sting that thrills on the tenth win is
 * exhausting by the hundredth — so it gets a short body and a little shimmer
 * and nothing else. The ceremony is saved for the tiers that have earned it.
 *
 * These are a starting point chosen from measurements — length, attack, tonal
 * balance — by someone who could not hear them. Trust the lab over them.
 */
export const WIN_RECIPES: Record<WinStingTier, WinRecipe> = {
  small: {
    body: { file: 'body-collect.mp3', gain: 0.6, delay: 0 },
    tail: { file: 'tail-victory-chime.mp3', gain: 0.22, delay: 90 },
  },
  big: {
    // Fast attack (~23 ms) so it lands with the word rather than behind it.
    impact: { file: 'impact-orchestral-hit.mp3', gain: 0.3, delay: 0 },
    body: { file: 'body-tada-fanfare-a.mp3', gain: 0.62, delay: 60 },
    tail: { file: 'tail-achievement-sparkle.mp3', gain: 0.3, delay: 340 },
    coins: { file: 'coins-badge-coin-win.mp3', gain: 0.26, delay: 520 },
  },
  huge: {
    impact: { file: 'impact-soft-cinematic-impact.mp3', gain: 0.34, delay: 0 },
    // The trumpets take ~0.7 s to arrive; the impact covers that gap, which is
    // why this is barely delayed at all.
    body: { file: 'body-success-fanfare-trumpets.mp3', gain: 0.62, delay: 40 },
    tail: { file: 'tail-achievement-chimes.mp3', gain: 0.3, delay: 700 },
    coins: { file: 'coins-slot-machine-payout.mp3', gain: 0.28, delay: 900 },
  },
};

/** Every file a recipe actually reaches for — what preloading should fetch. */
export function recipeFiles(): string[] {
  const out = new Set<string>();
  for (const recipe of Object.values(WIN_RECIPES)) {
    for (const layer of Object.values(recipe)) {
      if (layer) out.add(layer.file);
    }
  }
  return [...out];
}
