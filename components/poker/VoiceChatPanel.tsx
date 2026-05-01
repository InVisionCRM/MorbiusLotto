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
  /** Tighter one-line layout for the poker header center column. */
  compact?: boolean;
}

export function VoiceChatPanel(props: VoiceChatPanelProps) {
  const { client, call, status, error } = usePokerVoice(props);

  if (!props.enabled) return null;

  if (status === 'error') {
    const fullMsg = `${props.seated ? 'Voice unavailable' : 'Voice listening unavailable'}${error ? `: ${error}` : ''}`;
    return (
      <div
        className={`text-[var(--poker-danger)] ${props.compact ? 'max-w-full truncate px-1 py-0 text-[9px]' : 'px-2 py-1 text-[10px]'}`}
        title={fullMsg}
      >
        {props.compact ? 'Voice error' : fullMsg}
      </div>
    );
  }

  if (!client || !call || status !== 'joined') {
    const idle =
      status === 'connecting'
        ? props.seated
          ? 'Connecting voice…'
          : 'Joining voice as listener…'
        : 'Voice idle';
    return (
      <div
        className={`text-[var(--poker-text)]/60 ${props.compact ? 'max-w-full truncate px-1 py-0 text-[9px]' : 'px-2 py-1 text-[10px]'}`}
        title={idle}
      >
        {props.compact ? (status === 'connecting' ? 'Voice…' : 'Voice idle') : idle}
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <VoiceChatBar canSpeak={props.seated} compact={props.compact} />
      </StreamCall>
    </StreamVideo>
  );
}

function VoiceChatBar({ canSpeak, compact }: { canSpeak: boolean; compact?: boolean }) {
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

  const detailLine =
    speakingLabel ??
    (canSpeak ? (isMute ? 'Muted' : activeLevel > 0.08 ? 'Mic receiving' : 'Quiet') : 'No mic access');

  const fullTitle = `${participants.length} in voice — ${detailLine}`;

  if (compact) {
    return (
      <div
        className="flex max-w-full min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5"
        style={{
          background: 'linear-gradient(180deg, rgba(18,22,30,0.72), rgba(8,10,14,0.58))',
          border: '1px solid rgba(255,255,255,0.13)',
          backdropFilter: 'blur(18px) saturate(150%)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
        title={fullTitle}
      >
        <ParticipantsAudio participants={participants} />
        {canSpeak ? (
          <button
            type="button"
            onClick={() => (isMute ? microphone.enable() : microphone.disable())}
            className="relative shrink-0 overflow-hidden rounded-full px-2 py-0.5 font-jost text-[10px] transition-transform active:scale-95"
            style={{
              background: isMute ? 'rgba(255,80,80,0.16)' : 'rgba(255,255,255,0.10)',
              color: 'var(--poker-text)',
              boxShadow: isMute
                ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
                : `0 0 ${6 + activeLevel * 14}px rgba(59,130,246,${0.16 + activeLevel * 0.3}), inset 0 1px 0 rgba(255,255,255,0.1)`,
            }}
            aria-label={isMute ? 'Unmute microphone' : 'Mute microphone'}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-blue-400/20 transition-[width,opacity] duration-150"
              style={{ width: `${Math.max(7, activeLevel * 100)}%`, opacity: isMute ? 0 : 1 }}
              aria-hidden
            />
            <span className="relative">{isMute ? 'Off' : 'On'}</span>
          </button>
        ) : (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 font-jost text-[10px]"
            style={{
              background: 'rgba(96,165,250,0.14)',
              color: 'rgba(219,234,254,0.94)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
            }}
          >
            Listen
          </span>
        )}
        <span className="min-w-0 truncate text-[9px] font-medium leading-tight text-blue-100/85 tabular-nums">
          <span className="text-[var(--poker-text)]/70">{participants.length} · </span>
          {detailLine}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-full px-2.5 py-1.5"
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
          className="relative overflow-hidden rounded-full px-2.5 py-1 font-jost text-xs transition-transform active:scale-95"
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
          className="rounded-full px-2.5 py-1 font-jost text-xs"
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
        <span className="max-w-[160px] truncate text-[10px] font-medium text-blue-100/85">{detailLine}</span>
      </div>
    </div>
  );
}
