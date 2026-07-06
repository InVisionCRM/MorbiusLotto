/**
 * useCrashStore.ts — Zustand store for chips Crash (/crash).
 *
 * Adapted from the crash prototype's store/useGameStore.ts: the shape and
 * phase machine are preserved (betting → flying → crashed), but rounds are
 * SERVER rounds — the bet debit, crash point, cashout and payout all live on
 * the backend. The store only mirrors what the server has already decided.
 *
 * Phase semantics for the per-player web game:
 *   betting  — idle on the pad; pressing Place Bet arms `hasBet` and runs the
 *              launch countdown, then CrashEngine POSTs /start
 *   flying   — server round active; multiplier animated by the shared curve
 *   crashed  — explosion hold, then back to betting
 */

import { create } from 'zustand';

export type CrashPhase = 'betting' | 'flying' | 'crashed';

export interface LiveCrashRound {
  roundId: string;
  bet: number;
  autoCashoutX100: number;
  serverSeedHash: string;
  /** Server clock at flight start (ms epoch) — for display/debug only. */
  startedAt: number;
  /** performance.now() at the moment the client began animating. */
  anchorMs: number;
  /** Crash point ×100, revealed by the server once the round settles. */
  crashX100: number | null;
}

interface CrashState {
  // Game status
  phase: CrashPhase;
  multiplier: number;
  /** Crash point (float) once known — drives the final displayed value. */
  crashPoint: number;
  /** Recent crash points (floats, newest first) — server-confirmed. */
  history: number[];

  // Player status
  balance: bigint | null;
  betAmount: number;
  autoCashout: number;
  hasBet: boolean;
  hasCashedOut: boolean;
  winAmount: number | null;

  // Live server round
  round: LiveCrashRound | null;

  // ── Replay (cinematic re-watch of a past round) ──
  // Fully separate from the live phase machine: the real `phase` stays
  // 'betting' during a replay, so the server flight effect never fires and no
  // chips move. The canvas/multiplier display read these when `replaying`.
  replaying: boolean;
  replayPhase: 'flying' | 'crashed';
  replayMultiplier: number;
  replayCrashX100: number | null;
  replayCashoutX100: number | null;
  replayBet: number;
  replayPayout: number;

  // Launch countdown (after Place Bet, before /start)
  countingDown: boolean;
  countdownLeft: number;

  /** Set by the Cash Out button (or the auto-cashout trigger); consumed by CrashEngine. */
  cashoutRequested: boolean;

  // Session stats (HUD)
  sessionRounds: number;
  sessionNet: number;

  error: string | null;
  noChips: boolean;

  // Settings
  isMuted: boolean;
  hasAudioInitialized: boolean;

  // Actions
  setBalance: (amount: bigint | null) => void;
  setHistory: (history: number[]) => void;
  pushHistory: (crashPoint: number) => void;

  setBetAmount: (amount: number) => void;
  setAutoCashout: (amount: number) => void;
  armBet: () => void;
  disarmBet: () => void;
  setCountdown: (countingDown: boolean, countdownLeft: number) => void;
  requestCashout: () => void;
  clearCashoutRequest: () => void;
  startGame: (round: LiveCrashRound) => void;
  updateMultiplier: (val: number) => void;
  revealCrashPoint: (crashX100: number) => void;
  recordCashout: (payout: number, balance: bigint | null) => void;
  endGame: (crashPoint: number) => void;
  startBettingPhase: () => void;
  beginReplay: (args: {
    crashX100: number;
    cashoutX100: number | null;
    bet: number;
    payout: number;
  }) => void;
  setReplayMultiplier: (val: number) => void;
  crashReplay: () => void;
  endReplay: () => void;
  setError: (error: string | null, noChips?: boolean) => void;
  addSessionRound: (net: number) => void;

  toggleMute: () => void;
  initAudio: () => void;
}

export const useCrashStore = create<CrashState>((set) => ({
  phase: 'betting',
  multiplier: 1.0,
  crashPoint: 0,
  history: [],

  balance: null,
  betAmount: 10,
  autoCashout: 2.0,
  hasBet: false,
  hasCashedOut: false,
  winAmount: null,

  round: null,

  replaying: false,
  replayPhase: 'flying',
  replayMultiplier: 1.0,
  replayCrashX100: null,
  replayCashoutX100: null,
  replayBet: 0,
  replayPayout: 0,

  countingDown: false,
  countdownLeft: 0,
  cashoutRequested: false,

  sessionRounds: 0,
  sessionNet: 0,

  error: null,
  noChips: false,

  isMuted: true, // Start muted until user interacts
  hasAudioInitialized: false,

  setBalance: (amount) => set({ balance: amount }),
  setHistory: (history) => set({ history }),
  pushHistory: (crashPoint) =>
    set((state) => ({ history: [crashPoint, ...state.history].slice(0, 15) })),

  setBetAmount: (amount) => set({ betAmount: Math.max(0, amount) }),
  setAutoCashout: (amount) => {
    const val = isNaN(amount) ? 1.01 : Math.max(1.01, amount);
    set({ autoCashout: val });
  },

  /** Player pressed Place Bet — the countdown begins (no chips move yet). */
  armBet: () => set({ hasBet: true, hasCashedOut: false, winAmount: null, error: null }),
  /** /start failed — release the armed bet. */
  disarmBet: () => set({ hasBet: false, countingDown: false }),
  setCountdown: (countingDown, countdownLeft) => set({ countingDown, countdownLeft }),
  requestCashout: () => set({ cashoutRequested: true }),
  clearCashoutRequest: () => set({ cashoutRequested: false }),

  startGame: (round) =>
    set({
      phase: 'flying',
      multiplier: 1.0,
      crashPoint: 0,
      round,
    }),

  updateMultiplier: (val) => set({ multiplier: val }),

  revealCrashPoint: (crashX100) =>
    set((state) => ({
      round: state.round ? { ...state.round, crashX100 } : state.round,
      crashPoint: crashX100 / 100,
    })),

  recordCashout: (payout, balance) =>
    set((state) => ({
      hasCashedOut: true,
      winAmount: payout,
      balance: balance ?? state.balance,
    })),

  endGame: (crashPoint) =>
    set({
      phase: 'crashed',
      multiplier: crashPoint,
      crashPoint,
    }),

  startBettingPhase: () =>
    set({
      phase: 'betting',
      multiplier: 1.0,
      hasBet: false,
      hasCashedOut: false,
      winAmount: null,
      round: null,
      crashPoint: 0,
      countingDown: false,
      countdownLeft: 0,
      cashoutRequested: false,
    }),

  // ── Replay actions — visual only, no chips/history/session touched. ──
  beginReplay: ({ crashX100, cashoutX100, bet, payout }) =>
    set({
      replaying: true,
      replayPhase: 'flying',
      replayMultiplier: 1.0,
      replayCrashX100: crashX100,
      replayCashoutX100: cashoutX100,
      replayBet: bet,
      replayPayout: payout,
      error: null,
    }),
  setReplayMultiplier: (val) => set({ replayMultiplier: val }),
  crashReplay: () =>
    set((state) => ({
      replayPhase: 'crashed',
      replayMultiplier:
        state.replayCrashX100 != null ? state.replayCrashX100 / 100 : state.replayMultiplier,
    })),
  endReplay: () =>
    set({
      replaying: false,
      replayPhase: 'flying',
      replayMultiplier: 1.0,
      replayCrashX100: null,
      replayCashoutX100: null,
      replayBet: 0,
      replayPayout: 0,
    }),

  setError: (error, noChips = false) => set({ error, noChips }),
  addSessionRound: (net) =>
    set((state) => ({
      sessionRounds: state.sessionRounds + 1,
      sessionNet: state.sessionNet + net,
    })),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted, hasAudioInitialized: true })),
  initAudio: () => set({ hasAudioInitialized: true, isMuted: false }),
}));
