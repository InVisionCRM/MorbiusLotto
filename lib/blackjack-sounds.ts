/**
 * Blackjack sound events — the audio contract for a table.
 *
 * Every sound the multiplayer table makes is a named event resolving to a pool
 * of file paths; a pool with several entries plays a random variation, a pool
 * with one entry always plays that file, and an empty pool silences the event.
 * A table theme overrides events by name instead of code hunting for path
 * literals — which is what makes per-table custom sounds (the founder uploading
 * their own) a data change rather than a code change.
 *
 * The default pools reference the same constants the single-player game uses,
 * so there is one source of truth for the stock sounds.
 */

import {
  SOUNDS_BETTING_OPEN,
  SOUNDS_BETTING_CLOSED,
  SOUNDS_DEALER_PHRASE,
  SOUNDS_PLAYER_WINS,
  SOUNDS_PLAYER_BLACKJACK,
  SOUNDS_DEALER_BLACKJACK,
  SOUNDS_DEALER_WINS,
  SOUNDS_TIP,
  SOUND_PUSH,
} from '@/app/BLACKJACK/constants';

export type BlackjackSoundEventKey =
  | 'cardDeal'
  | 'hitKnock'
  | 'click'
  | 'opponentJoined'
  | 'opponentLeft'
  | 'voiceBettingOpen'
  | 'voiceBettingClosed'
  | 'voiceDealerPhrase'
  | 'voicePlayerWins'
  | 'voicePlayerBlackjack'
  | 'voiceDealerWins'
  | 'voiceDealerBlackjack'
  | 'voicePush'
  | 'voiceTipThanks';

export type BlackjackSoundMap = Record<BlackjackSoundEventKey, string[]>;

/** Sparse override a table theme carries — only the events it changes. */
export type BlackjackSoundOverrides = Partial<Record<BlackjackSoundEventKey, string[]>>;

export const DEFAULT_BLACKJACK_SOUND_MAP: BlackjackSoundMap = {
  cardDeal: ['/BlackJack/sounds/cards.wav'],
  hitKnock: ['/BlackJack/sounds/knock.wav'],
  click: ['/POKER/PokerSounds/PlayerClickConfirmation.mp3'],
  opponentJoined: ['/POKER/PokerSounds/OpponentJoined.mp3'],
  opponentLeft: ['/POKER/PokerSounds/OpponentLeft.mp3'],
  voiceBettingOpen: SOUNDS_BETTING_OPEN,
  voiceBettingClosed: SOUNDS_BETTING_CLOSED,
  voiceDealerPhrase: SOUNDS_DEALER_PHRASE,
  voicePlayerWins: SOUNDS_PLAYER_WINS,
  voicePlayerBlackjack: SOUNDS_PLAYER_BLACKJACK,
  voiceDealerWins: SOUNDS_DEALER_WINS,
  voiceDealerBlackjack: SOUNDS_DEALER_BLACKJACK,
  voicePush: [SOUND_PUSH],
  voiceTipThanks: SOUNDS_TIP,
};

/** Editor metadata: friendly names and which channel an event plays on. */
export const BLACKJACK_SOUND_EVENT_INFO: Array<{
  key: BlackjackSoundEventKey;
  label: string;
  hint: string;
  channel: 'sfx' | 'voice';
}> = [
  { key: 'cardDeal', label: 'Card deal', hint: 'Every card hitting the felt', channel: 'sfx' },
  { key: 'hitKnock', label: 'Hit', hint: 'Player taps the table for a card', channel: 'sfx' },
  { key: 'click', label: 'Button click', hint: 'Bets, stand, double, seat changes', channel: 'sfx' },
  { key: 'opponentJoined', label: 'Player joins', hint: 'Someone takes a seat', channel: 'sfx' },
  { key: 'opponentLeft', label: 'Player leaves', hint: 'Someone leaves a seat', channel: 'sfx' },
  { key: 'voiceBettingOpen', label: 'Betting open', hint: 'Dealer announces bets', channel: 'voice' },
  { key: 'voiceBettingClosed', label: 'Betting closed', hint: 'Dealer closes betting', channel: 'voice' },
  { key: 'voiceDealerPhrase', label: 'Dealer chatter', hint: 'Random table talk', channel: 'voice' },
  { key: 'voicePlayerWins', label: 'You win', hint: 'Dealer calls your win', channel: 'voice' },
  { key: 'voicePlayerBlackjack', label: 'Your blackjack', hint: 'Dealer calls your natural', channel: 'voice' },
  { key: 'voiceDealerWins', label: 'Dealer wins', hint: 'Dealer takes the hand', channel: 'voice' },
  { key: 'voiceDealerBlackjack', label: 'Dealer blackjack', hint: 'Dealer flips a natural', channel: 'voice' },
  { key: 'voicePush', label: 'Push', hint: 'Dealer calls a tie', channel: 'voice' },
  { key: 'voiceTipThanks', label: 'Tip thanks', hint: 'Dealer thanks a tipper', channel: 'voice' },
];

/**
 * Overlays a theme's sparse overrides on the defaults. An override present with
 * an empty array deliberately silences that event.
 */
export function mergeSoundMap(
  base: BlackjackSoundMap,
  overrides?: BlackjackSoundOverrides | null,
): BlackjackSoundMap {
  if (!overrides) return base;
  const out = { ...base };
  for (const key of Object.keys(overrides) as BlackjackSoundEventKey[]) {
    const pool = overrides[key];
    if (Array.isArray(pool)) out[key] = pool;
  }
  return out;
}

/** Random pick from the event's pool; null when the event is silenced. */
export function pickSound(map: BlackjackSoundMap, key: BlackjackSoundEventKey): string | null {
  const pool = map[key];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
