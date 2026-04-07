'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Amount parsing (number words → digits) ───────────────────────────────────
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  hundred: 100, thousand: 1000, k: 1000,
};

function parseAmount(text: string): number | null {
  const clean = text.replace(/,/g, '');
  const direct = parseFloat(clean);
  if (!isNaN(direct) && direct > 0) return direct;
  let total = 0;
  let current = 0;
  for (const word of clean.split(/\s+/)) {
    const num = NUMBER_WORDS[word];
    if (num === undefined) continue;
    if (num === 1000) { total += (current || 1) * 1000; current = 0; }
    else if (num === 100) { current = (current || 1) * 100; }
    else { current += num; }
  }
  total += current;
  return total > 0 ? total : null;
}

// ── Blackjack ────────────────────────────────────────────────────────────────
export type BJSpeechAction =
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double_down' }
  | { type: 'split' }
  | { type: 'rebet' }
  | { type: 'bet'; amount: number };

// ── Poker ────────────────────────────────────────────────────────────────────
export type PokerSpeechAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'all_in' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number };

// ── Confirm-required actions ─────────────────────────────────────────────────
// double_down and split fire immediately per spec.
// call fires immediately unless amount > callThreshold (handled by caller).
const BJ_CONFIRM_REQUIRED = new Set<BJSpeechAction['type']>(['bet']);
const POKER_CONFIRM_REQUIRED = new Set<PokerSpeechAction['type']>(['bet', 'raise', 'all_in']);
// 'call' confirm is conditional — handled by caller via callThreshold

export function bjNeedsConfirm(action: BJSpeechAction): boolean {
  return BJ_CONFIRM_REQUIRED.has(action.type);
}

export function pokerNeedsConfirm(
  action: PokerSpeechAction,
  callThreshold: number,
): boolean {
  if (action.type === 'call') return false; // caller decides based on amount vs threshold
  return POKER_CONFIRM_REQUIRED.has(action.type);
}

// ── Yes/No voice patterns ────────────────────────────────────────────────────
const YES_PATTERNS = ['yes', 'yeah', 'yep', 'confirm', 'do it', 'correct', 'affirmative', 'sure', 'ok', 'okay'];
const NO_PATTERNS  = ['no', 'nope', 'cancel', 'never mind', 'nevermind', 'stop', 'abort', 'nah'];

export function isVoiceYes(text: string): boolean {
  return YES_PATTERNS.some(p => text === p || text.startsWith(p + ' ') || text.endsWith(' ' + p));
}
export function isVoiceNo(text: string): boolean {
  return NO_PATTERNS.some(p => text === p || text.startsWith(p + ' ') || text.endsWith(' ' + p));
}

// ── Word-boundary helper ─────────────────────────────────────────────────────
function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(text);
}

// ── Blackjack parser ─────────────────────────────────────────────────────────
const BJ_REBET_PHRASES = ['run it back', 'same bet', 'bet again', 'rebet', 're-bet'];

/**
 * immediateOnly: when true, only return actions safe to fire on interim
 * results (single unambiguous words — hit, stand, double, split).
 */
export function parseBlackjackSpeech(text: string, immediateOnly = false): BJSpeechAction | null {
  if (immediateOnly) {
    if (text === 'hit')                                    return { type: 'hit' };
    if (text === 'stand' || text === 'stay')               return { type: 'stand' };
    if (text === 'double' || text === 'double down')       return { type: 'double_down' };
    if (text === 'split')                                  return { type: 'split' };
    return null;
  }

  if (BJ_REBET_PHRASES.some(p => text.includes(p))) return { type: 'rebet' };
  if (text === 'go' || text === 'again')               return { type: 'rebet' };

  const betMatch = text.match(/\bbet\b(.*)/);
  if (betMatch) {
    const amount = parseAmount(betMatch[1].trim());
    if (amount !== null) return { type: 'bet', amount };
    return null;
  }

  if (text.includes('double down') || hasWord(text, 'double')) return { type: 'double_down' };
  if (hasWord(text, 'split'))                                   return { type: 'split' };
  if (hasWord(text, 'hit'))                                     return { type: 'hit' };
  if (hasWord(text, 'stand') || hasWord(text, 'stay'))          return { type: 'stand' };

  return null;
}

// ── Poker parser ─────────────────────────────────────────────────────────────
const ALL_IN_PHRASES = ['all in', 'all-in', 'shove', 'jam'];

export function parsePokerSpeech(text: string): PokerSpeechAction | null {
  if (ALL_IN_PHRASES.some(p => text.includes(p))) return { type: 'all_in' };

  const raiseMatch = text.match(/\braise\b(.*)/);
  if (raiseMatch) {
    const amount = parseAmount(raiseMatch[1].trim());
    if (amount !== null) return { type: 'raise', amount };
    return null;
  }

  const betMatch = text.match(/\bbet\b(.*)/);
  if (betMatch) {
    const amount = parseAmount(betMatch[1].trim());
    if (amount !== null) return { type: 'bet', amount };
    return null;
  }

  if (hasWord(text, 'fold') || text.includes('muck') || text.includes('give up')) return { type: 'fold' };
  if (hasWord(text, 'check') || hasWord(text, 'tap') || hasWord(text, 'knock'))   return { type: 'check' };
  if (hasWord(text, 'call') || hasWord(text, 'snap'))                              return { type: 'call' };

  return null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export type SpeechMode = 'blackjack' | 'poker';

export interface UseSpeechCommandsOptions {
  mode: SpeechMode;
  /** Called with a parsed blackjack action (only when mode === 'blackjack') */
  onBlackjackAction?: (action: BJSpeechAction) => void;
  /** Called with a parsed poker action (only when mode === 'poker') */
  onPokerAction?: (action: PokerSpeechAction) => void;
  /**
   * Poker call confirm threshold in whole MORBIUS. If the call amount
   * (resolved by the caller via getCallAmountMorbius) exceeds this, a
   * confirm dialog appears. Default: Infinity (never confirm call).
   */
  callThresholdMorbius?: number;
  /**
   * Required when callThresholdMorbius is set. Return the current call
   * amount in whole MORBIUS so the hook can compare against the threshold.
   */
  getCallAmountMorbius?: () => number;
  onPendingConfirm?: (label: string) => void;
  onConfirmResolved?: () => void;
}

export interface UseSpeechCommandsReturn {
  supported: boolean;
  listening: boolean;
  transcript: string;
  /** Pending action waiting for confirmation (null if none) */
  pendingLabel: string | null;
  toggle: () => void;
  start: () => void;
  stop: () => void;
  /** Call from the confirm dialog Yes button */
  confirmYes: () => void;
  /** Call from the confirm dialog No button */
  confirmNo: () => void;
}

export function useSpeechCommands({
  mode,
  onBlackjackAction,
  onPokerAction,
  callThresholdMorbius = Infinity,
  getCallAmountMorbius,
  onPendingConfirm,
  onConfirmResolved,
}: UseSpeechCommandsOptions): UseSpeechCommandsReturn {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  // Refs so callbacks inside recognition closures always see latest values
  const pendingActionRef = useRef<(() => void) | null>(null);
  const pendingLabelRef = useRef<string | null>(null);
  const listeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const isStoppingRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onBJRef = useRef(onBlackjackAction);
  onBJRef.current = onBlackjackAction;
  const onPKRef = useRef(onPokerAction);
  onPKRef.current = onPokerAction;
  const callThresholdRef = useRef(callThresholdMorbius);
  callThresholdRef.current = callThresholdMorbius;
  const getCallAmountRef = useRef(getCallAmountMorbius);
  getCallAmountRef.current = getCallAmountMorbius;
  const onPendingRef = useRef(onPendingConfirm);
  onPendingRef.current = onPendingConfirm;
  const onResolvedRef = useRef(onConfirmResolved);
  onResolvedRef.current = onConfirmResolved;

  useEffect(() => {
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
      setSupported(false);
    }
  }, []);

  const setPending = useCallback((label: string, fire: () => void) => {
    pendingActionRef.current = fire;
    pendingLabelRef.current = label;
    setPendingLabel(label);
    onPendingRef.current?.(label);
  }, []);

  const clearPending = useCallback(() => {
    pendingActionRef.current = null;
    pendingLabelRef.current = null;
    setPendingLabel(null);
    onResolvedRef.current?.();
  }, []);

  const confirmYes = useCallback(() => {
    pendingActionRef.current?.();
    clearPending();
  }, [clearPending]);

  const confirmNo = useCallback(() => {
    clearPending();
  }, [clearPending]);

  const handleFinalTranscript = useCallback((text: string) => {
    // If a confirm is pending, listen for yes/no voice response
    if (pendingLabelRef.current !== null) {
      if (isVoiceYes(text)) { confirmYes(); return; }
      if (isVoiceNo(text)) { confirmNo(); return; }
      return; // anything else while pending — ignore
    }

    if (modeRef.current === 'blackjack') {
      const action = parseBlackjackSpeech(text);
      if (!action) return;
      if (bjNeedsConfirm(action)) {
        const label = action.type === 'bet'
          ? `Bet ${action.amount.toLocaleString()} MORBIUS?`
          : `${action.type.replace('_', ' ')}?`;
        setPending(label, () => onBJRef.current?.(action));
      } else {
        onBJRef.current?.(action);
      }
    } else {
      const action = parsePokerSpeech(text);
      if (!action) return;

      // 'call' confirm is threshold-conditional
      if (action.type === 'call') {
        const callMorbius = getCallAmountRef.current?.() ?? 0;
        if (callMorbius > callThresholdRef.current) {
          const label = `Call ${callMorbius.toLocaleString()} MORBIUS?`;
          setPending(label, () => onPKRef.current?.(action));
        } else {
          onPKRef.current?.(action);
        }
        return;
      }

      if (pokerNeedsConfirm(action, 0)) {
        const label =
          action.type === 'all_in' ? 'Go all in?' :
          action.type === 'bet'    ? `Bet ${(action as { type: 'bet'; amount: number }).amount.toLocaleString()} MORBIUS?` :
          action.type === 'raise'  ? `Raise to ${(action as { type: 'raise'; amount: number }).amount.toLocaleString()} MORBIUS?` :
          `${action.type}?`;
        setPending(label, () => onPKRef.current?.(action));
      } else {
        // 'check', 'fold' fire immediately
        onPKRef.current?.(action);
      }
    }
  }, [confirmYes, confirmNo, setPending]);

  const createRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.lang = 'en-US';

    r.onstart = () => { setListening(true); listeningRef.current = true; };

    r.onresult = (e: any) => {
      const results = Array.from(e.results as SpeechRecognitionResultList);
      const latest = results[results.length - 1];

      // Collect all alternatives for the best transcript
      const alts: string[] = [];
      for (let i = 0; i < latest.length; i++) {
        alts.push((latest[i] as SpeechRecognitionAlternative).transcript.toLowerCase().trim());
      }
      const text = alts[0];
      setTranscript(text);

      if (!latest.isFinal) {
        // Interim: fire unambiguous single-word blackjack actions immediately
        if (modeRef.current === 'blackjack' && pendingLabelRef.current === null) {
          for (const alt of alts) {
            const action = parseBlackjackSpeech(alt, true);
            if (action) {
              onBJRef.current?.(action);
              setTranscript('');
              return;
            }
          }
        }
        return;
      }

      // Final: if pending confirmation, check all alts for yes/no
      setTranscript('');
      if (pendingLabelRef.current !== null) {
        for (const alt of alts) {
          if (isVoiceYes(alt)) { confirmYes(); return; }
          if (isVoiceNo(alt))  { confirmNo();  return; }
        }
        return; // still pending, unrecognized input — ignore
      }

      // No pending — find first alt that parses to an action
      for (const alt of alts) {
        const action = modeRef.current === 'blackjack'
          ? parseBlackjackSpeech(alt)
          : parsePokerSpeech(alt);
        if (action) {
          handleFinalTranscript(alt);
          return;
        }
      }
      // No alt matched — pass highest-confidence to handleFinalTranscript anyway
      // (it will return early if no action found)
      handleFinalTranscript(text);
    };

    r.onerror = (e: any) => {
      if (e.error === 'no-speech') return;
      if (e.error === 'aborted') return;
      // On other errors with continuous mode, restart
      if (!isStoppingRef.current) {
        setListening(false);
        listeningRef.current = false;
        const next = createRecognition();
        recognitionRef.current = next;
        try { next.start(); } catch { /* ignore */ }
      }
    };

    r.onend = () => {
      if (!isStoppingRef.current) {
        // continuous=true shouldn't fire onend normally, but handle edge cases
        const next = createRecognition();
        recognitionRef.current = next;
        try { next.start(); } catch { /* ignore if already stopped */ }
      } else {
        setListening(false);
        listeningRef.current = false;
      }
    };

    return r;
  }, [handleFinalTranscript]);

  const start = useCallback(() => {
    if (!supported || listeningRef.current) return;
    isStoppingRef.current = false;
    const r = createRecognition();
    recognitionRef.current = r;
    try { r.start(); } catch { /* already started */ }
  }, [supported, createRecognition]);

  const stop = useCallback(() => {
    isStoppingRef.current = true;
    recognitionRef.current?.stop();
    clearPending();
  }, [clearPending]);

  const toggle = useCallback(() => {
    if (listeningRef.current) stop();
    else start();
  }, [start, stop]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      isStoppingRef.current = true;
      recognitionRef.current?.stop();
    };
  }, []);

  return { supported, listening, transcript, pendingLabel, toggle, start, stop, confirmYes, confirmNo };
}
