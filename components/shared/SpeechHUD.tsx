'use client';

import { truncateTranscriptWords } from '@/lib/speech-display';
import { cn } from '@/lib/utils';

/** Poker: show only the last few words of the live transcript (recognizer still gets full text). */
const LIVE_TRANSCRIPT_MAX_WORDS = 4;

export type SpeechVoiceToggleProps = {
  listening: boolean;
  onToggle: () => void;
  supported?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** `short`: compact label for header chips; `full`: same copy as legacy floating control */
  labelMode?: 'full' | 'short';
};

export function SpeechVoiceToggle({
  listening,
  supported = true,
  onToggle,
  className,
  style,
  labelMode = 'full',
}: Pick<SpeechVoiceToggleProps, 'listening' | 'supported' | 'onToggle' | 'className' | 'style' | 'labelMode'>) {
  const labelShort = !supported ? 'N/A' : 'Voice';
  const labelFull = !supported ? 'Voice N/A' : listening ? 'Voice ON' : 'Voice OFF';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!supported}
      className={cn(
        'flex items-center justify-center gap-1.5 font-bold tracking-wide transition-colors hover:brightness-125 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
        labelMode === 'full' &&
          'rounded-md border px-2 py-1 text-[10px] font-medium bg-slate-900/80 hover:bg-slate-800/80',
        className,
      )}
      style={{
        ...style,
        ...(labelMode === 'full'
          ? {
              borderColor: listening ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)',
              color: listening ? '#fca5a5' : '#9ca3af',
            }
          : {}),
        ...(labelMode === 'short' && listening
          ? { borderColor: 'rgba(239,68,68,0.45)', color: '#fca5a5' }
          : {}),
      }}
      aria-pressed={listening}
      aria-label={listening ? 'Turn voice commands off' : 'Turn voice commands on'}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          listening ? 'bg-red-500 animate-pulse' : 'bg-neutral-500',
        )}
      />
      <span className="tabular-nums">{labelMode === 'short' ? labelShort : labelFull}</span>
      <svg className="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 8a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V21h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-1.062A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z" />
      </svg>
    </button>
  );
}

type SpeechHUDProps = {
  listening: boolean;
  transcript: string;
  lastAction: string | null;
  pendingLabel: string | null;
  onToggle: () => void;
  supported?: boolean;
  /** When true, the mic toggle is not shown here — render `SpeechVoiceToggle` elsewhere (e.g. poker header). */
  hideFloatingToggle?: boolean;
};

export function SpeechHUD({
  listening,
  transcript,
  lastAction,
  pendingLabel,
  onToggle,
  supported = true,
  hideFloatingToggle = false,
}: SpeechHUDProps) {
  const statusStack = (
    <>
      {listening && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md max-w-[220px] pointer-events-none">
          <span className="text-xs text-white/40 shrink-0">Hearing:</span>
          <span className="text-xs text-white truncate">
            {truncateTranscriptWords(transcript, LIVE_TRANSCRIPT_MAX_WORDS) || (
              <span className="text-white/25 italic">listening…</span>
            )}
          </span>
        </div>
      )}

      {pendingLabel && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 backdrop-blur-md max-w-[220px] pointer-events-none">
          <span className="text-xs text-amber-300 font-semibold shrink-0">Confirm:</span>
          <span className="text-xs text-amber-200 truncate">{pendingLabel}</span>
        </div>
      )}

      {lastAction && !pendingLabel && (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 backdrop-blur-md max-w-[220px] pointer-events-none">
          <span className="text-xs text-cyan-400 font-semibold">▶</span>
          <span className="text-xs text-cyan-300 truncate">{lastAction}</span>
        </div>
      )}
    </>
  );

  if (hideFloatingToggle) {
    return (
      <div
        className="fixed z-[100] flex flex-col gap-1.5 select-none items-end pointer-events-none right-3 sm:right-4 max-w-[min(220px,calc(100vw-1.5rem))]"
        style={{ top: 'max(4.25rem, calc(env(safe-area-inset-top, 0px) + 3.25rem))' }}
      >
        {statusStack}
      </div>
    );
  }

  return (
    <div className="fixed top-4 left-1/4 z-[100] flex flex-col gap-1.5 select-none items-start pointer-events-none">
      <div className="pointer-events-auto relative flex flex-col items-start gap-1">
        <SpeechVoiceToggle
          listening={listening}
          supported={supported}
          onToggle={onToggle}
          labelMode="full"
        />
      </div>
      {statusStack}
    </div>
  );
}
