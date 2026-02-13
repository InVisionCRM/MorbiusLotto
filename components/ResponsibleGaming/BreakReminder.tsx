'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
const STORAGE_KEY = 'morblotto_session_start';
const SNOOZE_KEY = 'morblotto_reminder_snoozed_until';
/** If last activity was more than this ago, treat as new session (avoid reminder on fresh load). */
const SESSION_STALE_MS = 10 * 60 * 1000; // 10 minutes

interface BreakReminderProps {
  /** Override the default 60 minute interval (in milliseconds) */
  intervalMs?: number;
}

export function BreakReminder({ intervalMs = REMINDER_INTERVAL_MS }: BreakReminderProps) {
  const { isConnected } = useAccount();
  const [showReminder, setShowReminder] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Initialize or get session start time
  useEffect(() => {
    if (!isConnected || typeof window === 'undefined') return;

    // Get or set session start time. If stored start is too old, treat as new session.
    const now = Date.now();
    let sessionStart = localStorage.getItem(STORAGE_KEY);
    if (!sessionStart) {
      sessionStart = now.toString();
      localStorage.setItem(STORAGE_KEY, sessionStart);
    } else {
      const storedStart = parseInt(sessionStart, 10);
      if (now - storedStart > SESSION_STALE_MS) {
        sessionStart = now.toString();
        localStorage.setItem(STORAGE_KEY, sessionStart);
      }
    }

    const checkTime = () => {
      const start = parseInt(localStorage.getItem(STORAGE_KEY) || Date.now().toString(), 10);
      const snoozedUntil = parseInt(localStorage.getItem(SNOOZE_KEY) || '0', 10);
      const now = Date.now();
      const elapsed = now - start;
      const minutes = Math.floor(elapsed / 60000);

      setSessionMinutes(minutes);

      // Check if we should show reminder
      if (elapsed >= intervalMs && now > snoozedUntil && !dismissed) {
        setShowReminder(true);
      }
    };

    // Check immediately and then every minute
    checkTime();
    const interval = setInterval(checkTime, 60000);

    return () => clearInterval(interval);
  }, [isConnected, intervalMs, dismissed]);

  const handleDismiss = useCallback(() => {
    setShowReminder(false);
    setDismissed(true);
    // Snooze for another interval
    localStorage.setItem(SNOOZE_KEY, (Date.now() + intervalMs).toString());
  }, [intervalMs]);

  const handleTakeBreak = useCallback(() => {
    setShowReminder(false);
    setDismissed(true);
    // Reset session timer
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    localStorage.removeItem(SNOOZE_KEY);
  }, []);

  const handleContinue = useCallback(() => {
    setShowReminder(false);
    // Snooze for 15 minutes
    localStorage.setItem(SNOOZE_KEY, (Date.now() + 15 * 60 * 1000).toString());
  }, []);

  if (!showReminder || !isConnected) return null;

  const hours = Math.floor(sessionMinutes / 60);
  const mins = sessionMinutes % 60;
  const timeString = hours > 0
    ? `${hours} hour${hours > 1 ? 's' : ''} and ${mins} minute${mins !== 1 ? 's' : ''}`
    : `${mins} minute${mins !== 1 ? 's' : ''}`;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 pointer-events-none">
      {/* Semi-transparent backdrop - clickable to dismiss */}
      <div
        className="absolute inset-0 bg-black/30 pointer-events-auto"
        onClick={handleContinue}
      />

      {/* Reminder Card */}
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden border border-blue-500/30 shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300"
        style={{
          background: 'linear-gradient(145deg, rgb(20, 30, 45), rgb(30, 40, 55))',
          boxShadow: '0 0 40px rgba(59, 130, 246, 0.2)',
        }}
      >
        {/* Header with clock icon */}
        <div
          className="flex items-center gap-4 px-5 py-4 border-b border-blue-500/20"
          style={{ background: 'linear-gradient(to right, rgba(59, 130, 246, 0.15), transparent)' }}
        >
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-blue-300 font-semibold text-lg">Time for a Break?</h2>
            <p className="text-white/50 text-sm">You've been playing for {timeString}</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-white/80 text-sm leading-relaxed">
            Taking regular breaks helps you stay in control and enjoy gaming responsibly.
            Consider stepping away for a few minutes to stretch, hydrate, or just relax.
          </p>

          {/* Tips */}
          <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/20">
            <p className="text-blue-300 text-xs font-medium mb-2">Quick break ideas:</p>
            <ul className="text-white/60 text-xs space-y-1">
              <li className="flex items-center gap-2">
                <span className="text-blue-400">•</span> Get a glass of water
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">•</span> Stretch your legs
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">•</span> Check in with how you're feeling
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTakeBreak}
              className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition"
            >
              Take a Break
            </button>
            <button
              onClick={handleContinue}
              className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition"
            >
              Continue Playing
            </button>
          </div>

          {/* Don't show again option */}
          <button
            onClick={handleDismiss}
            className="w-full text-center text-white/40 hover:text-white/60 text-xs transition"
          >
            Don't remind me again this session
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to get current session duration
 */
export function useSessionDuration() {
  const [minutes, setMinutes] = useState(0);
  const { isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected || typeof window === 'undefined') {
      setMinutes(0);
      return;
    }

    const update = () => {
      const start = parseInt(localStorage.getItem(STORAGE_KEY) || Date.now().toString(), 10);
      setMinutes(Math.floor((Date.now() - start) / 60000));
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const reset = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
      localStorage.removeItem(SNOOZE_KEY);
      setMinutes(0);
    }
  }, []);

  return { minutes, reset };
}
