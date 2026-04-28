'use client';

import React from 'react';
import {
  StreamVideo,
  StreamCall,
  useCallStateHooks,
} from '@stream-io/video-react-sdk';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { usePokerVoice } from '@/hooks/use-poker-voice';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';

export interface VoiceChatPanelProps {
  wsClient: BlackjackWebSocketClient | null;
  walletAddress: string | null;
  tableId: string | null;
  seated: boolean;
  /** Voice is currently tournament-only. Pass false on cash tables to render nothing. */
  enabled: boolean;
}

export function VoiceChatPanel(props: VoiceChatPanelProps) {
  const { client, call, status, error } = usePokerVoice(props);

  if (!props.enabled || !props.seated) return null;

  if (status === 'error') {
    return (
      <div className="text-[10px] text-[var(--poker-danger)] px-2 py-1">
        Voice unavailable{error ? `: ${error}` : ''}
      </div>
    );
  }

  if (!client || !call || status !== 'joined') {
    return (
      <div className="text-[10px] text-[var(--poker-text)]/60 px-2 py-1">
        {status === 'connecting' ? 'Connecting voice…' : 'Voice idle'}
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <VoiceChatBar />
      </StreamCall>
    </StreamVideo>
  );
}

function VoiceChatBar() {
  const { useMicrophoneState, useParticipants } = useCallStateHooks();
  const { isMute, microphone } = useMicrophoneState();
  const participants = useParticipants();
  const speaking = participants.filter((p) => p.isSpeaking).length;

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded-lg"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <button
        type="button"
        onClick={() => (isMute ? microphone.enable() : microphone.disable())}
        className="text-xs font-jost px-2 py-1 rounded"
        style={{
          background: isMute ? 'rgba(255,80,80,0.18)' : 'rgba(80,255,120,0.18)',
          color: 'var(--poker-text)',
        }}
        aria-label={isMute ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMute ? 'Mic Off' : 'Mic On'}
      </button>
      <span className="text-[10px] tabular-nums text-[var(--poker-text)]/70">
        {participants.length} in voice
        {speaking > 0 ? ` · ${speaking} speaking` : ''}
      </span>
    </div>
  );
}
