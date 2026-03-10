'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Theme } from '@/lib/theme';

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

  const lm = Theme.lightModal;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 pointer-events-none">
      {/* Semi-transparent backdrop - clickable to dismiss */}
      <div
        className={`absolute inset-0 ${lm.overlay} pointer-events-auto`}
        onClick={handleContinue}
      />

      {/* Reminder Card */}
      <div
        className={`relative ${lm.container} pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300`}
      >
        {/* Header with clock icon */}
        <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <svg className={`w-6 h-6 ${lm.accentText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className={`${lm.accentText} font-semibold text-lg`}>Time for a Break?</h2>
            <p className={`${lm.mutedText} text-sm`}>You've been playing for {timeString}</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className={`${lm.bodyText} text-sm leading-relaxed`}>
            Taking regular breaks helps you stay in control and enjoy gaming responsibly.
            Consider stepping away for a few minutes to stretch, hydrate, or just relax.
          </p>

          {/* Tips */}
          <div className={lm.panel}>
            <p className={`${lm.accentText} text-xs font-medium mb-2`}>Quick break ideas:</p>
            <ul className={`${lm.mutedText} text-xs space-y-1`}>
              <li className="flex items-center gap-2">
                <span className={lm.accentText}>•</span> Get a glass of water
              </li>
              <li className="flex items-center gap-2">
                <span className={lm.accentText}>•</span> Stretch your legs
              </li>
              <li className="flex items-center gap-2">
                <span className={lm.accentText}>•</span> Check in with how you're feeling
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button onClick={handleTakeBreak} className={lm.primaryButton}>
              Take a Break
            </button>
            <button onClick={handleContinue} className={lm.secondaryButton}>
              Continue Playing
            </button>
          </div>

          {/* Don't show again option */}
          <button onClick={handleDismiss} className={`w-full text-center ${lm.linkText}`}>
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
