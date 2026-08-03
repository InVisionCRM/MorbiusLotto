/**
 * Shipped clip catalog for the sound designer's Library.
 *
 * Data-driven, same as the slot builder's: drop a file under `public/` and add
 * an entry — waveform and duration render themselves, so nothing needs manual
 * organising. The slot builder ships five generic clips; blackjack additionally
 * exposes its own 58 voice and table sounds, which is what makes the Library
 * actually useful here (any of the 19 dealer phrases can voice any event).
 */

export interface SoundLibraryClip {
  name: string;
  file: string;
  group: string;
}

/** Expands a numbered pool, e.g. dealer-phrase-1..19. */
function pool(group: string, label: string, base: string, count: number): SoundLibraryClip[] {
  return Array.from({ length: count }, (_, i) => ({
    group,
    name: `${label} ${i + 1}`,
    file: `${base}-${i + 1}.mp3`,
  }));
}

export const SOUND_LIBRARY: SoundLibraryClip[] = [
  { group: 'Table', name: 'Card deal', file: '/BlackJack/sounds/cards.wav' },
  { group: 'Table', name: 'Knock', file: '/BlackJack/sounds/knock.wav' },
  { group: 'Table', name: 'Click confirm', file: '/POKER/PokerSounds/PlayerClickConfirmation.mp3' },
  { group: 'Table', name: 'Player joined', file: '/POKER/PokerSounds/OpponentJoined.mp3' },
  { group: 'Table', name: 'Player left', file: '/POKER/PokerSounds/OpponentLeft.mp3' },

  ...pool('Dealer voice', 'Betting open', '/BlackJack/sounds/betting-open', 6),
  ...pool('Dealer voice', 'Betting closed', '/BlackJack/sounds/betting-closed', 5),
  ...pool('Dealer voice', 'Table talk', '/BlackJack/sounds/dealer-phrase', 19),
  ...pool('Dealer voice', 'Player wins', '/BlackJack/sounds/player-wins', 5),
  ...pool('Dealer voice', 'Player blackjack', '/BlackJack/sounds/player-blackjack', 4),
  ...pool('Dealer voice', 'Dealer wins', '/BlackJack/sounds/dealer-wins', 4),
  ...pool('Dealer voice', 'Dealer blackjack', '/BlackJack/sounds/dealer-blackjack', 4),
  ...pool('Dealer voice', 'Tip thanks', '/BlackJack/sounds/tip', 7),
  { group: 'Dealer voice', name: 'Push', file: '/BlackJack/sounds/push-1.mp3' },

  { group: 'Beds & stings', name: 'Game UI SFX', file: '/sounds/library/game-ui-sfx.wav' },
  { group: 'Beds & stings', name: 'Catchy clip 1', file: '/sounds/library/catchy-clip-1.mp3' },
  { group: 'Beds & stings', name: 'Catchy clip 2', file: '/sounds/library/catchy-clip-2.mp3' },
  { group: 'Beds & stings', name: 'Dark & beautiful', file: '/sounds/library/dark-beautiful.mp3' },
  { group: 'Beds & stings', name: 'Dark & uplifting', file: '/sounds/library/dark-uplifting.mp3' },
  {
    group: 'Beds & stings',
    name: 'Casino ambience',
    file: '/BlackJack/sounds/casino_background_ch_%231-1769839327682.wav',
  },
];

export const SOUND_LIBRARY_GROUPS = ['Table', 'Dealer voice', 'Beds & stings'] as const;

/** Length buckets, matching the slot builder's Short / Medium / Long chips. */
export function durationBucket(seconds: number | null): 'short' | 'medium' | 'long' | null {
  if (seconds == null) return null;
  if (seconds < 1.5) return 'short';
  if (seconds <= 4) return 'medium';
  return 'long';
}
