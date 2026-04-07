'use client';

interface Props {
  listening: boolean;
  transcript: string;
  lastAction: string | null;
  pendingLabel: string | null;
}

/**
 * Fixed bottom-left HUD shown when voice commands are enabled.
 * Displays the live transcript and the last fired/pending action.
 */
export function SpeechHUD({ listening, transcript, lastAction, pendingLabel }: Props) {
  if (!listening) return null;

  return (
    <div className="fixed bottom-24 left-4 z-[100] flex flex-col gap-1.5 pointer-events-none select-none">
      {/* Mic indicator + live transcript */}
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md max-w-[260px]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs text-white/50 shrink-0">Hearing:</span>
        <span className="text-xs text-white truncate">
          {transcript || <span className="text-white/30 italic">listening…</span>}
        </span>
      </div>

      {/* Pending confirmation */}
      {pendingLabel && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 backdrop-blur-md max-w-[260px]">
          <span className="text-xs text-amber-300 font-semibold">Confirm:</span>
          <span className="text-xs text-amber-200 truncate">{pendingLabel}</span>
        </div>
      )}

      {/* Last fired action */}
      {lastAction && !pendingLabel && (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 backdrop-blur-md max-w-[260px]">
          <span className="text-xs text-cyan-400 font-semibold">▶</span>
          <span className="text-xs text-cyan-300 truncate">{lastAction}</span>
        </div>
      )}
    </div>
  );
}
