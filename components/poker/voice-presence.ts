'use client';

import { useSyncExternalStore } from 'react';

export interface PokerVoicePresence {
  userId: string;
  displayName?: string;
  isSpeaking: boolean;
  isDominantSpeaker: boolean;
  isLocalParticipant: boolean;
  audioLevel: number;
}

export interface PokerVoicePresenceSnapshot {
  byUserId: Record<string, PokerVoicePresence>;
  participantCount: number;
  speakingUserIds: string[];
  dominantUserId: string | null;
  localUserId: string | null;
}

const EMPTY_SNAPSHOT: PokerVoicePresenceSnapshot = {
  byUserId: {},
  participantCount: 0,
  speakingUserIds: [],
  dominantUserId: null,
  localUserId: null,
};

let snapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

function normalizeUserId(userId: string | undefined | null): string | null {
  const trimmed = userId?.trim().toLowerCase();
  return trimmed || null;
}

export function normalizeVoiceAudioLevel(value: unknown): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (raw <= 0) return 0;
  if (raw <= 1) return Math.min(1, raw);
  return Math.min(1, raw / 100);
}

export function publishPokerVoicePresence(participants: PokerVoicePresence[]): void {
  const byUserId: Record<string, PokerVoicePresence> = {};
  const speakingUserIds: string[] = [];
  let dominantUserId: string | null = null;
  let localUserId: string | null = null;

  for (const participant of participants) {
    const userId = normalizeUserId(participant.userId);
    if (!userId) continue;

    const normalized: PokerVoicePresence = {
      ...participant,
      userId,
      audioLevel: normalizeVoiceAudioLevel(participant.audioLevel),
    };

    byUserId[userId] = normalized;
    if (normalized.isSpeaking) speakingUserIds.push(userId);
    if (normalized.isDominantSpeaker) dominantUserId = userId;
    if (normalized.isLocalParticipant) localUserId = userId;
  }

  snapshot = {
    byUserId,
    participantCount: Object.keys(byUserId).length,
    speakingUserIds,
    dominantUserId,
    localUserId,
  };
  listeners.forEach((listener) => listener());
}

export function clearPokerVoicePresence(): void {
  snapshot = EMPTY_SNAPSHOT;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PokerVoicePresenceSnapshot {
  return snapshot;
}

export function usePokerVoicePresenceSnapshot(): PokerVoicePresenceSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function usePokerVoicePresenceForAddress(address: string | null | undefined): PokerVoicePresence | null {
  const current = usePokerVoicePresenceSnapshot();
  const userId = normalizeUserId(address);
  return userId ? current.byUserId[userId] ?? null : null;
}
