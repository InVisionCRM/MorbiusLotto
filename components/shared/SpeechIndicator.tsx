'use client';

import React, { useEffect, useState } from 'react';

interface SpeechIndicatorProps {
  supported: boolean;
  listening: boolean;
  transcript: string;
  /** Called when the user clicks the mic button */
  onToggle: () => void;
}

/**
 * Unobtrusive mic pill — fixed in the bottom-right corner of its nearest
 * positioned ancestor. Shows mic icon, listening pulse, and a brief
 * transcript flash that fades after 1.5s.
 */
export function SpeechIndicator({ supported, listening, transcript, onToggle }: SpeechIndicatorProps) {
  const [flashText, setFlashText] = useState('');
  const [flashVisible, setFlashVisible] = useState(false);
  const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flash the transcript for 1.5s whenever it updates
  useEffect(() => {
    if (!transcript) return;
    setFlashText(transcript);
    setFlashVisible(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashVisible(false), 1500);
  }, [transcript]);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  if (!supported) return null;

  return (
    <div className="fixed bottom-20 right-3 z-40 flex flex-col items-end gap-1.5 pointer-events-none select-none">
      {/* Transcript flash */}
      <div
        className="pointer-events-none px-2.5 py-1 rounded-lg text-xs text-white/80 max-w-[160px] truncate text-right transition-all duration-300"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          opacity: flashVisible && flashText ? 1 : 0,
          transform: flashVisible ? 'translateY(0)' : 'translateY(4px)',
        }}
      >
        {flashText}
      </div>

      {/* Mic button */}
      <button
        onClick={onToggle}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-all duration-200"
        style={{
          background: listening
            ? 'rgba(34,197,94,0.15)'
            : 'rgba(255,255,255,0.06)',
          border: listening
            ? '1px solid rgba(34,197,94,0.4)'
            : '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        title={listening ? 'Stop voice commands' : 'Start voice commands'}
        aria-label={listening ? 'Stop voice commands' : 'Start voice commands'}
      >
        {/* Pulse dot when listening */}
        <span
          className="relative flex h-2 w-2 shrink-0"
          style={{ opacity: listening ? 1 : 0.4 }}
        >
          {listening && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
          )}
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ background: listening ? '#4ade80' : '#6b7280' }}
          />
        </span>

        {/* Mic icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          style={{ color: listening ? '#4ade80' : '#9ca3af' }}
        >
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
    </div>
  );
}
