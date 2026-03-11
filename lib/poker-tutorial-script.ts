/**
 * Script for the poker interactive tutorial (demo page).
 * Each step defines full state for the demo table plus highlight target and copy.
 */

export type TutorialPhase =
  | 'idle'
  | 'dealt'
  | 'my-bet'
  | 'opp-raise'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'my-fold';

export type TutorialHighlight =
  | null
  | 'table'
  | 'dealer-button'
  | 'your-cards'
  | 'action-bar'
  | 'pot'
  | 'community-cards'
  | 'raise-slider'
  | 'seat-0';

export interface TutorialStepState {
  phase: TutorialPhase;
  pot: number;
  myBet: number;
  oppBet: number;
  myActing: boolean;
  myFolded: boolean;
  myLastAction: string | null;
  timeLeft: number | undefined;
  communityCards: number[];
  holeCards: number[] | undefined;
}

export interface TutorialStep {
  state: TutorialStepState;
  highlight: TutorialHighlight;
  title: string;
  body: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    state: {
      phase: 'idle',
      pot: 0,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [],
      holeCards: undefined,
    },
    highlight: null,
    title: 'Welcome to the table',
    body: "You're in the bottom seat (position 0). Other seats can be empty or filled. Each hand, the dealer button and blinds move clockwise.",
  },
  {
    state: {
      phase: 'idle',
      pot: 150,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [],
      holeCards: undefined,
    },
    highlight: 'dealer-button',
    title: 'Dealer and blinds',
    body: 'The dealer (D) posts no blind. The small blind (SB) and big blind (BB) are forced bets that start the pot. Here, seat 2 is the dealer; seats 7 and 8 have posted the blinds.',
  },
  {
    state: {
      phase: 'dealt',
      pot: 150,
      myBet: 0,
      oppBet: 0,
      myActing: true,
      myFolded: false,
      myLastAction: null,
      timeLeft: 22,
      communityCards: [],
      holeCards: [1, 14],
    },
    highlight: 'your-cards',
    title: 'Your hole cards',
    body: 'You receive two private hole cards. Only you see them. Use them together with the community cards to make your best five-card hand.',
  },
  {
    state: {
      phase: 'dealt',
      pot: 150,
      myBet: 0,
      oppBet: 0,
      myActing: true,
      myFolded: false,
      myLastAction: null,
      timeLeft: 22,
      communityCards: [],
      holeCards: [1, 14],
    },
    highlight: 'action-bar',
    title: 'Your turn — actions',
    body: "When it's your turn, use Fold (quit the hand), Check (stay in without betting, if no one has bet), Call (match the current bet), or Bet/Raise (put in more chips).",
  },
  {
    state: {
      phase: 'dealt',
      pot: 150,
      myBet: 0,
      oppBet: 0,
      myActing: true,
      myFolded: false,
      myLastAction: null,
      timeLeft: 22,
      communityCards: [],
      holeCards: [1, 14],
    },
    highlight: 'pot',
    title: 'The pot',
    body: 'Chips that players put in go into the pot. The pot is in the center. Right now it\'s the small blind + big blind. The winner of the hand takes the pot.',
  },
  {
    state: {
      phase: 'dealt',
      pot: 150,
      myBet: 0,
      oppBet: 0,
      myActing: true,
      myFolded: false,
      myLastAction: null,
      timeLeft: 22,
      communityCards: [],
      holeCards: [1, 14],
    },
    highlight: 'raise-slider',
    title: 'Bet sizes',
    body: 'To bet or raise, use the amount slider or presets (Min, ½ Pot, Pot, Max). You must raise at least the min raise; you can go up to your full stack.',
  },
  {
    state: {
      phase: 'my-bet',
      pot: 650,
      myBet: 500,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: 'bet',
      timeLeft: undefined,
      communityCards: [],
      holeCards: [1, 14],
    },
    highlight: 'your-cards',
    title: 'You bet',
    body: 'You chose to bet. Your chips go to the pot. Action moves to the next player — they can fold, call, or raise.',
  },
  {
    state: {
      phase: 'opp-raise',
      pot: 2150,
      myBet: 500,
      oppBet: 1500,
      myActing: true,
      myFolded: false,
      myLastAction: null,
      timeLeft: 18,
      communityCards: [],
      holeCards: [1, 14],
    },
    highlight: 'community-cards',
    title: 'Opponent raises',
    body: 'An opponent raised. Now you can Fold, Call (match their bet), or Raise again. The pot has grown.',
  },
  {
    state: {
      phase: 'flop',
      pot: 2150,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [0, 13, 26],
      holeCards: [1, 14],
    },
    highlight: 'community-cards',
    title: 'The flop',
    body: 'Three community cards are dealt face-up. Everyone can use these with their hole cards. This is the flop — first of four betting rounds.',
  },
  {
    state: {
      phase: 'flop',
      pot: 2150,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [0, 13, 26],
      holeCards: [1, 14],
    },
    highlight: 'pot',
    title: 'Betting continues',
    body: 'After the flop there is another betting round. Then the turn (one more card) and the river (final card), each followed by betting.',
  },
  {
    state: {
      phase: 'turn',
      pot: 2150,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [0, 13, 26, 39],
      holeCards: [1, 14],
    },
    highlight: 'community-cards',
    title: 'The turn',
    body: 'The turn is the fourth community card. You now have six cards (two hole + four board) to make your best five-card hand.',
  },
  {
    state: {
      phase: 'river',
      pot: 2150,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [0, 13, 26, 39, 12],
      holeCards: [1, 14],
    },
    highlight: 'community-cards',
    title: 'The river',
    body: 'The river is the fifth and last community card. After the final betting round, remaining players show their hands.',
  },
  {
    state: {
      phase: 'showdown',
      pot: 2150,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [0, 13, 26, 39, 12],
      holeCards: [1, 14],
    },
    highlight: 'community-cards',
    title: 'Showdown',
    body: 'Showdown: everyone reveals their hole cards. The best five-card hand (using any five of the seven cards) wins the pot.',
  },
  {
    state: {
      phase: 'showdown',
      pot: 2150,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [0, 13, 26, 39, 12],
      holeCards: [1, 14],
    },
    highlight: 'seat-0',
    title: 'Your hand',
    body: "Here, your hand is compared to opponents'. Hand rankings (high card, pair, two pair, straight, flush, full house, etc.) decide the winner.",
  },
  {
    state: {
      phase: 'showdown',
      pot: 2150,
      myBet: 0,
      oppBet: 0,
      myActing: false,
      myFolded: false,
      myLastAction: null,
      timeLeft: undefined,
      communityCards: [0, 13, 26, 39, 12],
      holeCards: [1, 14],
    },
    highlight: null,
    title: "You're ready",
    body: "You've seen the table, hole cards, community cards, pot, and actions. Join a table from the lobby to play for real. Good luck!",
  },
];
