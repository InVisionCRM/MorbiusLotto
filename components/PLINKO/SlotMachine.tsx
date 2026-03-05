"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { LoaderOne } from '@/components/ui/loader';
import { AudioManager } from '@/hooks/use-audio';

// Casino symbols with casino-themed icons
const SYMBOLS = [
  { id: 'seven', emoji: '7️⃣', name: 'Seven', multiplier: 10 },
  { id: 'morbius', image: '/morbius/MorbiusLogo (3).png', name: 'Morbius', multiplier: 8 },
  { id: 'bell', emoji: '🔔', name: 'Bell', multiplier: 5 },
  { id: 'pulse', image: '/Pulse Branding/Logo/ball.png', name: 'Pulse', multiplier: 6 },
  { id: 'star', emoji: '⭐', name: 'Star', multiplier: 3 },
  { id: 'bar', emoji: '🎰', name: 'Bar', multiplier: 4 },
];

// Create extended reel strip
const REEL_STRIP = [...SYMBOLS, ...SYMBOLS, ...SYMBOLS, ...SYMBOLS, ...SYMBOLS];

interface SlotMachineProps {
  isSpinning?: boolean;
  onSpinComplete?: (result: { symbols: string[]; isWinner: boolean; multiplier: number }) => void;
  confirmationStage?: 'broadcast' | 'mempool' | 'mined' | null;
  disabled?: boolean;
  autoSpin?: boolean;
  onClose?: () => void;
}

// Sound generator using shared Web Audio API context (mobile-friendly)
class SlotSoundEngine {
  private masterGain: GainNode | null = null;
  private muted = false;

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 0.25;
    }
  }

  private getContext(): AudioContext | null {
    return AudioManager.getContext();
  }

  init() {
    const ctx = this.getContext();
    if (!ctx || this.masterGain) return;
    if (this.muted) return;

    try {
      // Unlock audio for mobile browsers
      AudioManager.unlock();

      this.masterGain = ctx.createGain();
      this.masterGain.connect(ctx.destination);
      this.masterGain.gain.value = this.muted ? 0 : 0.25;
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    // Ensure context is running (mobile browsers may suspend it)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }

  spinStart() {
    if (this.muted) return;
    this.init();
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(100, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
  }

  tick() {
    if (this.muted) return;
    this.init();
    this.playTone(600 + Math.random() * 200, 0.03, 'square');
  }

  reelStop(reelIndex: number) {
    if (this.muted) return;
    this.init();
    const baseFreq = 180 - reelIndex * 25;
    this.playTone(baseFreq, 0.12, 'square');
  }

  win() {
    if (this.muted) return;
    this.init();
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.25, 'sine'), i * 100);
    });
  }

  lose() {
    if (this.muted) return;
    this.init();
    this.playTone(250, 0.3, 'triangle');
    setTimeout(() => this.playTone(180, 0.4, 'triangle'), 150);
  }
}

const SlotMachine: React.FC<SlotMachineProps> = ({
  isSpinning: externalSpinning,
  onSpinComplete,
  confirmationStage,
  disabled = false,
  autoSpin = false,
  onClose,
}) => {
  const SYMBOL_HEIGHT = 40;
  const VISIBLE_SYMBOLS = 3;
  const TOTAL_HEIGHT = REEL_STRIP.length * SYMBOL_HEIGHT;

  // Reel positions (in pixels)
  const [reelOffsets, setReelOffsets] = useState([0, 0, 0]);
  const [isSpinningInternal, setIsSpinningInternal] = useState(false);
  const [spinningReels, setSpinningReels] = useState([false, false, false]);
  const [result, setResult] = useState<{ symbols: typeof SYMBOLS[number][]; isWinner: boolean; multiplier: number } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const soundEngine = useRef(new SlotSoundEngine());

  useEffect(() => {
    soundEngine.current.setMuted(!soundEnabled);
  }, [soundEnabled]);
  const animationFrameRef = useRef<number | null>(null);
  const velocitiesRef = useRef([0, 0, 0]);
  const targetPositionsRef = useRef([0, 0, 0]);
  const spinPhaseRef = useRef<('accelerating' | 'spinning' | 'decelerating' | 'stopped')[]>(['stopped', 'stopped', 'stopped']);
  const lastTickRef = useRef([0, 0, 0]);
  const hasTriggeredResultRef = useRef(false);

  const isSpinning = externalSpinning ?? isSpinningInternal;

  // Main animation loop
  useEffect(() => {
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = Math.min((currentTime - lastTime) / 16.67, 3); // Normalize to ~60fps, cap at 3x
      lastTime = currentTime;

      setReelOffsets(prevOffsets => {
        const newOffsets = [...prevOffsets];
        let anySpinning = false;

        for (let i = 0; i < 3; i++) {
          const phase = spinPhaseRef.current[i];

          if (phase === 'stopped') continue;
          anySpinning = true;

          if (phase === 'accelerating') {
            velocitiesRef.current[i] = Math.min(velocitiesRef.current[i] + 2 * deltaTime, 40);
            if (velocitiesRef.current[i] >= 40) {
              spinPhaseRef.current[i] = 'spinning';
            }
          } else if (phase === 'decelerating') {
            // Calculate distance to target
            const target = targetPositionsRef.current[i];
            const current = newOffsets[i] % TOTAL_HEIGHT;
            let distance = target - current;
            if (distance < 0) distance += TOTAL_HEIGHT;

            // Slow down as we approach target
            if (distance < SYMBOL_HEIGHT * 3) {
              velocitiesRef.current[i] = Math.max(velocitiesRef.current[i] * 0.92, 3);
            } else if (distance < SYMBOL_HEIGHT * 6) {
              velocitiesRef.current[i] = Math.max(velocitiesRef.current[i] * 0.96, 8);
            }

            // Snap to target when close enough
            if (distance < 5 && velocitiesRef.current[i] < 5) {
              newOffsets[i] = target;
              velocitiesRef.current[i] = 0;
              spinPhaseRef.current[i] = 'stopped';
              soundEngine.current.reelStop(i);
              setSpinningReels(prev => {
                const next = [...prev];
                next[i] = false;
                return next;
              });
              continue;
            }
          }

          // Apply velocity
          newOffsets[i] = (newOffsets[i] + velocitiesRef.current[i] * deltaTime) % TOTAL_HEIGHT;

          // Tick sound
          if (currentTime - lastTickRef.current[i] > 80 && velocitiesRef.current[i] > 15) {
            soundEngine.current.tick();
            lastTickRef.current[i] = currentTime;
          }
        }

        // Check if all stopped
        if (!anySpinning && !hasTriggeredResultRef.current && spinningReels.some(s => s === false) && isSpinningInternal) {
          // Small delay before showing result
          hasTriggeredResultRef.current = true;
          setTimeout(() => {
            checkResult(newOffsets);
          }, 200);
        }

        return newOffsets;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [spinningReels, isSpinningInternal]);

  const checkResult = useCallback((offsets: number[]) => {
    // Get symbols at center position
    const finalSymbols = offsets.map(offset => {
      const centerOffset = offset + SYMBOL_HEIGHT; // Account for visible area
      const symbolIndex = Math.round(centerOffset / SYMBOL_HEIGHT) % SYMBOLS.length;
      return SYMBOLS[symbolIndex];
    });

    const allSame = finalSymbols[0].id === finalSymbols[1].id && finalSymbols[1].id === finalSymbols[2].id;
    const twoSame = finalSymbols[0].id === finalSymbols[1].id ||
                    finalSymbols[1].id === finalSymbols[2].id ||
                    finalSymbols[0].id === finalSymbols[2].id;

    const isWinner = allSame;
    const multiplier = allSame ? finalSymbols[0].multiplier : (twoSame ? 1.5 : 0);

    const newResult = { symbols: finalSymbols, isWinner, multiplier };
    setResult(newResult);
    setShowResult(true);
    setIsSpinningInternal(false);

    if (isWinner) {
      soundEngine.current.win();
    } else {
      soundEngine.current.lose();
    }

    if (onSpinComplete) {
      onSpinComplete({
        symbols: finalSymbols.map(s => s.id),
        isWinner,
        multiplier,
      });
    }
  }, [onSpinComplete]);

  const handleSpin = useCallback(() => {
    // Only check internal state - external spinning means we SHOULD spin
    if (isSpinningInternal || spinningReels.some(s => s) || disabled) return;

    soundEngine.current.init();
    soundEngine.current.spinStart();

    setIsSpinningInternal(true);
    setShowResult(false);
    setResult(null);
    hasTriggeredResultRef.current = false;

    // Generate random final symbols
    const finalSymbolIndices = [
      Math.floor(Math.random() * SYMBOLS.length),
      Math.floor(Math.random() * SYMBOLS.length),
      Math.floor(Math.random() * SYMBOLS.length),
    ];

    // Calculate target positions (ensure at least 3 full rotations)
    targetPositionsRef.current = finalSymbolIndices.map(idx => {
      return (idx * SYMBOL_HEIGHT) % TOTAL_HEIGHT;
    });

    // Start all reels
    velocitiesRef.current = [5, 5, 5];
    spinPhaseRef.current = ['accelerating', 'accelerating', 'accelerating'];
    setSpinningReels([true, true, true]);

    // Stagger the deceleration
    setTimeout(() => {
      spinPhaseRef.current[0] = 'decelerating';
    }, 1500);

    setTimeout(() => {
      spinPhaseRef.current[1] = 'decelerating';
    }, 2100);

    setTimeout(() => {
      spinPhaseRef.current[2] = 'decelerating';
    }, 2700);
  }, [isSpinningInternal, spinningReels, disabled]);

  // Auto-spin trigger
  useEffect(() => {
    if ((autoSpin || externalSpinning) && !isSpinningInternal && !spinningReels.some(s => s)) {
      handleSpin();
    }
  }, [autoSpin, externalSpinning, isSpinningInternal, spinningReels, handleSpin]);

  const getStageIndicator = () => {
    switch (confirmationStage) {
      case 'broadcast': return { text: 'Broadcasting', color: 'text-cyan-400', pulse: true };
      case 'mempool': return { text: 'In Mempool', color: 'text-purple-400', pulse: true };
      case 'mined': return { text: 'Mining', color: 'text-green-400', pulse: true };
      default: return { text: 'Ready', color: 'text-cyan-300/60', pulse: false };
    }
  };

  const stage = getStageIndicator();

  const getVisibleSymbols = (offset: number) => {
    const symbols = [];
    const startIndex = Math.floor(offset / SYMBOL_HEIGHT);

    for (let i = -1; i <= VISIBLE_SYMBOLS; i++) {
      const idx = (startIndex + i + REEL_STRIP.length) % REEL_STRIP.length;
      const symbol = REEL_STRIP[idx];
      if (symbol && (symbol.emoji || symbol.image)) {
        symbols.push(symbol);
      }
    }
    return symbols;
  };

  return (
    <div
      className="flex flex-col items-center p-6 rounded-2xl max-w-lg w-full relative"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 30, 38))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.05), 0 8px 32px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
      }}
    >
      {/* Sound toggle + Close button */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSoundEnabled(prev => !prev)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-cyan-300/60 hover:text-cyan-300 hover:bg-cyan-400/10 transition-all"
          title={soundEnabled ? 'Mute sound' : 'Unmute sound'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center rounded-full text-cyan-300/60 hover:text-cyan-300 hover:bg-cyan-400/10 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-sm font-black tracking-wider mb-2 text-white">
          CONFIRMING TRANSACTION
        </h3>
        <div className="flex justify-center">
          <LoaderOne />
        </div>
      </div>

      {/* Slot Machine Frame */}
      <div
        className="relative rounded-xl p-1 mb-1"
        style={{
          background: 'linear-gradient(180deg, rgb(10, 18, 25), rgb(5, 10, 15))',
          boxShadow: 'inset 0 4px 12px rgba(0, 0, 0, 0.9), inset 0 -2px 8px rgba(6, 182, 212, 0.1)',
          border: '2px solid rgba(6, 182, 212, 0.3)',
        }}
      >
        {/* Win Line Indicators */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50 animate-pulse z-20" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50 animate-pulse z-20" />

        {/* Center Win Line */}
        <div
          className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-1 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.8), rgba(6, 182, 212, 0.4), rgba(6, 182, 212, 0.8))',
            boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
          }}
        />

        {/* Reels Container */}
        <div className="flex gap-1">
          {[0, 1, 2].map((reelIndex) => {
            const offset = reelOffsets[reelIndex];
            const fractionalOffset = offset % SYMBOL_HEIGHT;
            const visibleSymbols = getVisibleSymbols(offset);
            const isReelSpinning = spinningReels[reelIndex];

            return (
              <div
                key={reelIndex}
                className="relative overflow-hidden rounded-lg"
                style={{
                  width: '80px',
                  height: `${SYMBOL_HEIGHT * VISIBLE_SYMBOLS}px`,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(15,25,35,0.95), rgba(0,0,0,0.9))',
                  boxShadow: 'inset 0 8px 20px rgba(0, 0, 0, 0.9), inset 0 -8px 20px rgba(0, 0, 0, 0.9)',
                  border: '1px solid rgba(6, 182, 212, 0.15)',
                }}
              >
                {/* Gradient overlays for depth */}
                <div
                  className="absolute inset-0 z-10 pointer-events-none"
                  style={{
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.8) 100%)',
                  }}
                />

                {/* Symbol strip */}
                <div
                  className="absolute left-0 right-0"
                  style={{
                    transform: `translateY(${-fractionalOffset}px)`,
                  }}
                >
                  {visibleSymbols.map((symbol, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-center select-none"
                      style={{
                        height: `${SYMBOL_HEIGHT}px`,
                        filter: isReelSpinning && velocitiesRef.current[reelIndex] > 20 ? 'blur(2px)' : 'none',
                        transition: 'filter 0.15s ease-out',
                      }}
                    >
                      {symbol?.image ? (
                        <img
                          src={symbol.image}
                          alt={symbol.name}
                          className="w-8 h-8 object-contain"
                          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
                        />
                      ) : (
                        <span style={{ fontSize: '24px', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                          {symbol?.emoji || '🎰'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Win highlight */}
                {showResult && result?.isWinner && (
                  <div
                    className="absolute inset-0 z-20 animate-pulse"
                    style={{
                      background: 'linear-gradient(180deg, transparent 25%, rgba(6, 182, 212, 0.4) 40%, rgba(6, 182, 212, 0.4) 60%, transparent 75%)',
                      boxShadow: 'inset 0 0 30px rgba(6, 182, 212, 0.6)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

      </div>


      {/* Spin Button */}
      <button
        onClick={handleSpin}
        disabled={isSpinning || disabled || spinningReels.some(s => s)}
        className="relative gap-2 w-65 h-10 rounded-xl font-black text-md uppercase tracking-wider transition-all duration-200 overflow-hidden"
        style={{
          background: (isSpinning || disabled || spinningReels.some(s => s))
            ? 'linear-gradient(145deg, rgba(50, 50, 60, 0.5), rgba(30, 30, 40, 0.5))'
            : 'linear-gradient(145deg, rgba(6, 182, 212, 0.35), rgba(8, 145, 178, 0.35))',
          boxShadow: (isSpinning || disabled || spinningReels.some(s => s))
            ? 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.02)'
            : 'inset 2px 2px 4px rgba(0, 0, 0, 0.2), inset -2px -2px 4px rgba(255, 255, 255, 0.05), 0 4px 15px rgba(6, 182, 212, 0.25)',
          border: (isSpinning || disabled || spinningReels.some(s => s))
            ? '1px solid rgba(100, 100, 120, 0.2)'
            : '1px solid rgba(6, 182, 212, 0.5)',
          color: (isSpinning || disabled || spinningReels.some(s => s)) ? 'rgba(150, 150, 160, 0.5)' : '#22d3ee',
        }}
      >
        {/* Hover effect */}
        {!(isSpinning || disabled || spinningReels.some(s => s)) && (
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.5), rgba(8, 145, 178, 0.5))',
            }}
          />
        )}

        <span className="relative z-10 flex items-center justify-center gap-3">
          {spinningReels.some(s => s) ? (
            <>
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              SPINNING...
            </>
          ) : (
            <>
              <span className="text-2xl">🎰</span>
              SPIN
            </>
          )}
        </span>
      </button>

    </div>
  );
};

export default SlotMachine;
