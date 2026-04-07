'use client';

interface Props {
  listening: boolean;
  transcript: string;
  lastAction: string | null;
  pendingLabel: string | null;
  onToggle: () => void;
}

export function SpeechHUD({ listening, transcript, lastAction, pendingLabel, onToggle }: Props) {
  return (
    <div className="fixed top-4 left-4 z-[100] flex flex-col gap-1.5 pointer-events-none select-none items-start">

      {/* Mic toggle button — always visible, always clickable */}
      <button
        onClick={onToggle}
        pointer-events="auto"
        className="pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 backdrop-blur-md transition-all"
        style={{
          background: listening ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.6)',
          borderColor: listening ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
        }}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${listening ? 'bg-red-500 animate-pulse' : 'bg-neutral-500'}`} />
        <span className="text-xs font-medium" style={{ color: listening ? '#fca5a5' : '#9ca3af' }}>
          {listening ? 'Voice ON' : 'Voice OFF'}
        </span>
        <svg className="h-3.5 w-3.5" style={{ color: listening ? '#fca5a5' : '#6b7280' }} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 8a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V21h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-1.062A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z" />
        </svg>
      </button>

      {/* Live transcript */}
      {listening && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md max-w-[220px]">
          <span className="text-xs text-white/40 shrink-0">Hearing:</span>
          <span className="text-xs text-white truncate">
            {transcript || <span className="text-white/25 italic">listening…</span>}
          </span>
        </div>
      )}

      {/* Pending confirmation */}
      {pendingLabel && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 backdrop-blur-md max-w-[220px]">
          <span className="text-xs text-amber-300 font-semibold shrink-0">Confirm:</span>
          <span className="text-xs text-amber-200 truncate">{pendingLabel}</span>
        </div>
      )}

      {/* Last fired action */}
      {lastAction && !pendingLabel && (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 backdrop-blur-md max-w-[220px]">
          <span className="text-xs text-cyan-400 font-semibold">▶</span>
          <span className="text-xs text-cyan-300 truncate">{lastAction}</span>
        </div>
      )}
    </div>
  );
}
