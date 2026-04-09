'use client';

import React, { useEffect, useState } from 'react';
import { truncateTranscriptWords } from '@/lib/speech-display';

const FLASH_MAX_WORDS = 4;
const FLASH_MS = 900;

interface SpeechIndicatorProps {
  listening: boolean;
  transcript: string;
}

/**
 * Transcript readback — sits absolute top-4 left-1/4 inside the table's
 * relative container. Shows a brief flash of what was heard, plus a small
 * green pulse dot while the mic is active.
 */
export function SpeechIndicator({ listening, transcript }: SpeechIndicatorProps) {
  const [flashText, setFlashText] = useState('');
  const [flashVisible, setFlashVisible] = useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!transcript) return;
    setFlashText(truncateTranscriptWords(transcript, FLASH_MAX_WORDS));
    setFlashVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFlashVisible(false), FLASH_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [transcript]);

  if (!listening && !flashVisible) return null;

  return (
    <div className="absolute top-4 left-1/4 z-40 flex items-center gap-2 pointer-events-none select-none">
      {/* Pulse dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {listening && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: listening ? '#4ade80' : '#6b7280' }}
        />
      </span>

      {/* Transcript flash */}
      <span
        className="text-xs text-white/80 transition-all duration-300 max-w-[140px] truncate"
        style={{
          opacity: flashVisible && flashText ? 1 : 0,
        }}
      >
        {flashText}
      </span>
    </div>
  );
}
