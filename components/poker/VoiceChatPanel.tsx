'use client';

import React, { useEffect, useMemo } from 'react';
import {
  ParticipantsAudio,
  StreamVideo,
  StreamCall,
  useCallStateHooks,
} from '@stream-io/video-react-sdk';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { usePokerVoice } from '@/hooks/use-poker-voice';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import {
  clearPokerVoicePresence,
  normalizeVoiceAudioLevel,
  publishPokerVoicePresence,
} from './voice-presence';

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

  if (!props.enabled) return null;

  if (status === 'error') {
    return (
      <div className="text-[10px] text-[var(--poker-danger)] px-2 py-1">
        {props.seated ? 'Voice unavailable' : 'Voice listening unavailable'}{error ? `: ${error}` : ''}
      </div>
    );
  }

  if (!client || !call || status !== 'joined') {
    return (
      <div className="text-[10px] text-[var(--poker-text)]/60 px-2 py-1">
        {status === 'connecting' ? (props.seated ? 'Connecting voice…' : 'Joining voice as listener…') : 'Voice idle'}
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <VoiceChatBar canSpeak={props.seated} />
      </StreamCall>
    </StreamVideo>
  );
}

function VoiceChatBar({ canSpeak }: { canSpeak: boolean }) {
  const { useMicrophoneState, useParticipants, useLocalParticipant, useDominantSpeaker } = useCallStateHooks();
  const { isMute, microphone } = useMicrophoneState();
  const participants = useParticipants();
  const localParticipant = useLocalParticipant();
  const dominantSpeaker = useDominantSpeaker();
  const speakingParticipants = participants.filter((p) => p.isSpeaking);
  const localLevel = normalizeVoiceAudioLevel(localParticipant?.audioLevel);
  const activeLevel = !canSpeak || isMute ? 0 : localLevel;
  const speakingLabel = useMemo(() => {
    const source = dominantSpeaker ?? speakingParticipants[0];
    if (!source) return null;
    const name = source.name?.trim() || source.userId?.slice(-4) || 'Player';
    return source.isLocalParticipant ? 'You are speaking' : `${name} speaking`;
  }, [dominantSpeaker, speakingParticipants]);

  useEffect(() => {
    publishPokerVoicePresence(
      participants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.name,
        isSpeaking: participant.isSpeaking,
        isDominantSpeaker: participant.isDominantSpeaker,
        isLocalParticipant: !!participant.isLocalParticipant,
        audioLevel: participant.audioLevel,
      })),
    );
  }, [participants]);

  useEffect(() => () => clearPokerVoicePresence(), []);

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-full"
      style={{
        background: 'linear-gradient(180deg, rgba(18,22,30,0.72), rgba(8,10,14,0.58))',
        border: '1px solid rgba(255,255,255,0.13)',
        backdropFilter: 'blur(18px) saturate(150%)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      <ParticipantsAudio participants={participants} />
      {canSpeak ? (
        <button
          type="button"
          onClick={() => (isMute ? microphone.enable() : microphone.disable())}
          className="relative text-xs font-jost px-2.5 py-1 rounded-full overflow-hidden transition-transform active:scale-95"
          style={{
            background: isMute ? 'rgba(255,80,80,0.16)' : 'rgba(255,255,255,0.10)',
            color: 'var(--poker-text)',
            boxShadow: isMute
              ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
              : `0 0 ${8 + activeLevel * 18}px rgba(59,130,246,${0.18 + activeLevel * 0.35}), inset 0 1px 0 rgba(255,255,255,0.12)`,
          }}
          aria-label={isMute ? 'Unmute microphone' : 'Mute microphone'}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-blue-400/20 transition-[width,opacity] duration-150"
            style={{ width: `${Math.max(7, activeLevel * 100)}%`, opacity: isMute ? 0 : 1 }}
            aria-hidden
          />
          <span className="relative">{isMute ? 'Mic Off' : 'Mic On'}</span>
        </button>
      ) : (
        <span
          className="rounded-full px-2.5 py-1 text-xs font-jost"
          style={{
            background: 'rgba(96,165,250,0.14)',
            color: 'rgba(219,234,254,0.94)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
          }}
        >
          Listening
        </span>
      )}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[10px] tabular-nums text-[var(--poker-text)]/75">
          {participants.length} in voice
        </span>
        <span className="max-w-[160px] truncate text-[10px] font-medium text-blue-100/85">
          {speakingLabel ?? (canSpeak ? (isMute ? 'Muted' : activeLevel > 0.08 ? 'Mic receiving' : 'Quiet') : 'No mic access')}
        </span>
      </div>
    </div>
  );
}
