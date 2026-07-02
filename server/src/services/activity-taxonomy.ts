// Unified player-activity taxonomy.
//
// Every chip movement on the platform is recorded as a single row in
// `poker_chip_ledger` (see poker-chip-wallet.ts -> applyPokerChipDelta). That table
// is therefore the one true source of "all activity sitewide": poker, blackjack,
// keno, plinko, every arcade game, deposits/withdrawals and holder rewards all land
// there with a `reason` string.
//
// This module turns a raw ledger `reason` into a player-facing classification:
//   - gameKey   stable machine key for filtering (e.g. 'dragon_tiger', 'poker', 'exchange')
//   - gameLabel human label for display      (e.g. 'Dragon Tiger')
//   - kind      what the row represents       ('bet' | 'payout' | 'refund' | ...)
//
// It is the single place the reason enum is mapped to UX. The /api/players/:address/activity
// endpoint enriches each row with this so the client never has to know the reason strings.

import type { PokerChipLedgerReason } from './poker-chip-wallet';

export type ActivityKind =
  | 'bet' // stake placed (debit)
  | 'payout' // winnings credited
  | 'win' // settled game net positive (blackjack / lottery rows)
  | 'loss' // settled game net negative (blackjack / lottery rows)
  | 'push' // settled game net zero (blackjack tie)
  | 'refund' // stake returned (cancel / leave / push)
  | 'tip' // gratuity routed to dealer/deployer
  | 'fee' // rake / creator / platform fee
  | 'deposit' // on-chain MORBIUS -> chips
  | 'withdrawal' // chips -> on-chain MORBIUS
  | 'buy' // chips purchased
  | 'sell' // chips cashed out
  | 'reward' // holder / LP holder epoch credit
  | 'adjustment'; // migration / unknown bookkeeping

export interface ActivityClassification {
  gameKey: string;
  gameLabel: string;
  kind: ActivityKind;
}

// Human labels for arcade game keys (the part between `arcade_<key>_<bet|payout|refund>`).
const ARCADE_LABELS: Record<string, string> = {
  limbo: 'Limbo',
  mines: 'Mines',
  hilo: 'Hi-Lo',
  dice: 'Dice',
  dicex2: 'Dice X2',
  craps: 'Craps',
  baccarat: 'Baccarat',
  crash: 'Crash',
  roulette: 'Roulette',
  towers: 'Towers',
  chicken: 'Chicken',
  dragon_tiger: 'Dragon Tiger',
  andar_bahar: 'Andar Bahar',
  pachinko: 'Pachinko',
  cascade: 'Cascade',
  firewalk: 'Firewalk',
  heist: 'Heist',
  three_card_poker: 'Three Card Poker',
  greed_dice: 'Greed Dice',
  cipher: 'Cipher',
};

// Explicit classification for every non-arcade reason. Arcade reasons are derived
// programmatically below so new arcade games only need an ARCADE_LABELS entry.
const EXPLICIT: Partial<Record<PokerChipLedgerReason, ActivityClassification>> = {
  // Poker cash tables
  cash_join: { gameKey: 'poker', gameLabel: 'Poker', kind: 'bet' },
  cash_reup: { gameKey: 'poker', gameLabel: 'Poker', kind: 'bet' },
  cash_leave: { gameKey: 'poker', gameLabel: 'Poker', kind: 'payout' },
  cash_admin_return: { gameKey: 'poker', gameLabel: 'Poker', kind: 'refund' },
  rake: { gameKey: 'poker', gameLabel: 'Poker', kind: 'fee' },

  // Poker tournaments
  tournament_create_guarantee: { gameKey: 'poker_tournament', gameLabel: 'Poker Tournament', kind: 'bet' },
  tournament_buyin: { gameKey: 'poker_tournament', gameLabel: 'Poker Tournament', kind: 'bet' },
  tournament_refund: { gameKey: 'poker_tournament', gameLabel: 'Poker Tournament', kind: 'refund' },
  tournament_prize: { gameKey: 'poker_tournament', gameLabel: 'Poker Tournament', kind: 'payout' },

  // Video poker
  video_poker_bet: { gameKey: 'video_poker', gameLabel: 'Video Poker', kind: 'bet' },
  video_poker_payout: { gameKey: 'video_poker', gameLabel: 'Video Poker', kind: 'payout' },

  // Keno
  keno_bet: { gameKey: 'keno', gameLabel: 'Keno', kind: 'bet' },
  keno_payout: { gameKey: 'keno', gameLabel: 'Keno', kind: 'payout' },

  // Plinko
  plinko_bet: { gameKey: 'plinko', gameLabel: 'Plinko', kind: 'bet' },
  plinko_payout: { gameKey: 'plinko', gameLabel: 'Plinko', kind: 'payout' },

  // Blackjack
  blackjack_bet: { gameKey: 'blackjack', gameLabel: 'Blackjack', kind: 'bet' },
  blackjack_payout: { gameKey: 'blackjack', gameLabel: 'Blackjack', kind: 'payout' },
  blackjack_refund: { gameKey: 'blackjack', gameLabel: 'Blackjack', kind: 'refund' },
  blackjack_tip: { gameKey: 'blackjack', gameLabel: 'Blackjack', kind: 'tip' },

  // Chip <-> MORBIUS exchange
  purchase: { gameKey: 'exchange', gameLabel: 'Exchange', kind: 'buy' },
  cashout: { gameKey: 'exchange', gameLabel: 'Exchange', kind: 'sell' },
  deposit: { gameKey: 'exchange', gameLabel: 'Deposit', kind: 'deposit' },
  withdrawal: { gameKey: 'exchange', gameLabel: 'Withdrawal', kind: 'withdrawal' },

  // Fees (these land on the fee wallet, not normal players)
  creator_fee: { gameKey: 'fees', gameLabel: 'Creator Fee', kind: 'fee' },
  platform_fee: { gameKey: 'fees', gameLabel: 'Platform Fee', kind: 'fee' },

  // Holder rewards
  holder_reward: { gameKey: 'rewards', gameLabel: 'Holder Reward', kind: 'reward' },
  lp_holder_reward: { gameKey: 'rewards', gameLabel: 'LP Holder Reward', kind: 'reward' },

  // The Weekly Drop raffle (WEEKLY_DROP_SPEC.md)
  weekly_drop_prize: { gameKey: 'rewards', gameLabel: 'Weekly Drop Prize', kind: 'reward' },

  // One-time bookkeeping
  migration: { gameKey: 'system', gameLabel: 'Balance Migration', kind: 'adjustment' },
};

// Synthetic reasons. These games store ONE settled row per round (a net result),
// not split bet/payout rows, and live OUTSIDE the chip ledger:
//   - Blackjack: `games` / `game_hands` / `blackjack_multi_round_seats` (wei)
//   - Lottery 6-of-55: `instant_lottery_plays` (wei, indexed from on-chain events)
// getPlayerActivity's UNION emits these reason strings so the same taxonomy +
// reason-set filtering applies uniformly across DB sources.
const SYNTHETIC: Record<string, ActivityClassification> = {
  blackjack_win: { gameKey: 'blackjack', gameLabel: 'Blackjack', kind: 'win' },
  blackjack_loss: { gameKey: 'blackjack', gameLabel: 'Blackjack', kind: 'loss' },
  blackjack_push: { gameKey: 'blackjack', gameLabel: 'Blackjack', kind: 'push' },
  lottery_win: { gameKey: 'lottery', gameLabel: 'Lottery 6-of-55', kind: 'win' },
  lottery_loss: { gameKey: 'lottery', gameLabel: 'Lottery 6-of-55', kind: 'loss' },
};

function humanize(reason: string): string {
  return reason
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Classify a raw ledger reason into a player-facing {gameKey, gameLabel, kind}.
 * Fails open: an unrecognized reason still returns a sane label so a newly added
 * reason never breaks the feed (it just shows under gameKey 'other').
 */
export function classifyReason(reason: string): ActivityClassification {
  const explicit = EXPLICIT[reason as PokerChipLedgerReason];
  if (explicit) return explicit;

  const synthetic = SYNTHETIC[reason];
  if (synthetic) return synthetic;

  // Arcade pattern: arcade_<key>_<bet|payout|refund>
  const arcade = /^arcade_(.+)_(bet|payout|refund)$/.exec(reason);
  if (arcade) {
    const key = arcade[1];
    const suffix = arcade[2] as 'bet' | 'payout' | 'refund';
    const label = ARCADE_LABELS[key] ?? humanize(key);
    return { gameKey: key, gameLabel: label, kind: suffix };
  }

  return { gameKey: 'other', gameLabel: humanize(reason), kind: 'adjustment' };
}

// ---- Filter helpers -------------------------------------------------------
// The /activity endpoint accepts optional `game` and `kind` filters. We resolve
// those to the concrete set of reason strings to push the filter into SQL.

// All reasons we know about: the explicit keys plus every arcade game's bet/payout
// (+ refund where a game issues refunds). This list drives filter resolution; an
// unknown reason simply never matches a filter (and so only shows under "All").
const ARCADE_SUFFIXES: ReadonlyArray<'bet' | 'payout' | 'refund'> = ['bet', 'payout', 'refund'];

function allKnownReasons(): string[] {
  const reasons = new Set<string>([...Object.keys(EXPLICIT), ...Object.keys(SYNTHETIC)]);
  for (const key of Object.keys(ARCADE_LABELS)) {
    for (const suffix of ARCADE_SUFFIXES) reasons.add(`arcade_${key}_${suffix}`);
  }
  return [...reasons];
}

/** Reason strings whose classification has the given gameKey. */
export function reasonsForGame(gameKey: string): string[] {
  return allKnownReasons().filter((r) => classifyReason(r).gameKey === gameKey);
}

/** Reason strings whose classification has the given kind. */
export function reasonsForKind(kind: ActivityKind): string[] {
  return allKnownReasons().filter((r) => classifyReason(r).kind === kind);
}
