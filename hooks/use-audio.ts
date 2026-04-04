'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Sound file paths
const SOUND_PATHS = {
  drop: '/sounds/drop.wav',
  positive: '/sounds/positive.wav',
  negative: '/sounds/negative.wav',
  peghit: '/sounds/peghit.mp3',
} as const;

type SoundName = keyof typeof SOUND_PATHS;

// Global audio context shared across all instances
let globalAudioContext: AudioContext | null = null;
let audioUnlocked = false;
const audioBuffers: Map<string, AudioBuffer> = new Map();
const unlockListeners: Set<() => void> = new Set();

// Get or create the global audio context
function getAudioContext(): AudioContext | null {
  if (globalAudioContext) return globalAudioContext;

  try {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    return globalAudioContext;
  } catch (e) {
    console.warn('Web Audio API not supported');
    return null;
  }
}

// Unlock audio for mobile browsers - must be called from user gesture
async function unlockAudio(): Promise<boolean> {
  if (audioUnlocked) return true;

  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    // Resume the audio context if it's suspended (required on mobile)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Play a silent buffer to fully unlock audio on iOS
    const silentBuffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(ctx.destination);
    source.start(0);

    audioUnlocked = true;

    // Notify all listeners that audio is unlocked
    unlockListeners.forEach(listener => listener());
    return true;
  } catch (e) {
    console.warn('Failed to unlock audio:', e);
    return false;
  }
}

// Load a sound file into an AudioBuffer
async function loadSound(path: string): Promise<AudioBuffer | null> {
  // Check cache first
  if (audioBuffers.has(path)) {
    return audioBuffers.get(path)!;
  }

  const ctx = getAudioContext();
  if (!ctx) return null;

  try {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    audioBuffers.set(path, audioBuffer);
    return audioBuffer;
  } catch (e) {
    console.warn(`Failed to load sound: ${path}`, e);
    return null;
  }
}

// Preload all sounds
async function preloadSounds(): Promise<void> {
  const paths = Object.values(SOUND_PATHS);
  await Promise.all(paths.map(path => loadSound(path)));
}

// Play a sound using Web Audio API
function playAudioBuffer(buffer: AudioBuffer, volume: number = 0.3): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();

    source.buffer = buffer;
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (e) {
    console.warn('Failed to play audio buffer:', e);
  }
}

/**
 * Hook for playing sounds with mobile browser support.
 *
 * Handles:
 * - Mobile browser autoplay restrictions (iOS Safari, Chrome on Android)
 * - Preloading sounds for instant playback
 * - Shared AudioContext across components
 *
 * Usage:
 * ```tsx
 * const { playSound, isUnlocked, unlockAudio } = useAudio(soundEnabled);
 *
 * // Play a sound
 * playSound('drop');
 * playSound('positive');
 *
 * // Or play a custom path
 * playSound('/sounds/custom.wav');
 * ```
 */
export function useAudio(enabled: boolean = true) {
  const [isUnlocked, setIsUnlocked] = useState(audioUnlocked);
  const enabledRef = useRef(enabled);

  // Keep enabledRef in sync
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Subscribe to unlock events
  useEffect(() => {
    const listener = () => setIsUnlocked(true);
    unlockListeners.add(listener);

    // Check if already unlocked
    if (audioUnlocked) {
      setIsUnlocked(true);
    }

    return () => {
      unlockListeners.delete(listener);
    };
  }, []);

  // Set up global unlock listeners on mount
  useEffect(() => {
    const handleInteraction = () => {
      unlockAudio();
      // Preload sounds after unlocking
      preloadSounds();
    };

    // Listen for user interactions to unlock audio
    const events = ['touchstart', 'touchend', 'mousedown', 'click', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, handleInteraction, { once: false, passive: true });
    });

    // Try to preload sounds (will work if audio is already unlocked)
    preloadSounds();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };
  }, []);

  // Play a sound by name or path
  const playSound = useCallback(async (soundNameOrPath: SoundName | string, volume: number = 0.3) => {
    if (!enabledRef.current) return;

    // Resolve the path
    const path = SOUND_PATHS[soundNameOrPath as SoundName] || soundNameOrPath;

    // Try to unlock audio if not already
    if (!audioUnlocked) {
      await unlockAudio();
    }

    // Load and play the sound
    const buffer = await loadSound(path);
    if (buffer) {
      playAudioBuffer(buffer, volume);
    }
  }, []);

  // Manual unlock function (useful for explicit "enable sound" buttons)
  const manualUnlock = useCallback(async () => {
    const success = await unlockAudio();
    if (success) {
      await preloadSounds();
    }
    return success;
  }, []);

  return {
    playSound,
    isUnlocked,
    unlockAudio: manualUnlock,
  };
}

// Export for use in class components or non-React contexts
export const AudioManager = {
  getContext: getAudioContext,
  unlock: unlockAudio,
  preload: preloadSounds,
  loadSound,
  play: async (path: string, volume: number = 0.3) => {
    const buffer = await loadSound(path);
    if (buffer) {
      playAudioBuffer(buffer, volume);
    }
  },
  isUnlocked: () => audioUnlocked,
};
