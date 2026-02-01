"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { AudioManager } from '@/hooks/use-audio';

// Morbius Blazing 7s Symbols - Based on classic Blazing 7s with Morbius theme
const SYMBOLS = [
  { id: 'morbius-wild', image: '/morbius/MorbiusLogo (3).png', name: 'Morbius Wild', multiplier: 1000, isWild: true, isScatter: false },
  { id: 'blazing-7-red', emoji: '7️⃣', name: 'Blazing 7 Red', multiplier: 200, color: '#ff3333', isWild: false, isScatter: false },
  { id: 'blazing-7-blue', emoji: '7️⃣', name: 'Blazing 7 Blue', multiplier: 150, color: '#3399ff', isWild: false, isScatter: false },
  { id: 'blazing-7-white', emoji: '7️⃣', name: 'Blazing 7 White', multiplier: 100, color: '#ffffff', isWild: false, isScatter: false },
  { id: 'triple-bar', emoji: '☰', name: 'Triple BAR', multiplier: 50, isWild: false, isScatter: false },
  { id: 'double-bar', emoji: '═', name: 'Double BAR', multiplier: 25, isWild: false, isScatter: false },
  { id: 'single-bar', emoji: '─', name: 'Single BAR', multiplier: 10, isWild: false, isScatter: false },
  { id: 'cherry', emoji: '🍒', name: 'Cherry', multiplier: 5, isWild: false, isScatter: false },
  { id: 'bell', emoji: '🔔', name: 'Bell', multiplier: 15, isWild: false, isScatter: false },
  { id: 'scatter', image: '/morbius/MorbiusLogo (3).png', name: 'Free Spins', multiplier: 0, isWild: false, isScatter: true },
];

// Weighted reel strip for more realistic slot machine feel
const createReelStrip = () => {
  const strip: typeof SYMBOLS[number][] = [];
  // Morbius Wild - rare (2 per reel)
  for (let i = 0; i < 2; i++) strip.push(SYMBOLS[0]);
  // Blazing 7s - uncommon (3-4 each)
  for (let i = 0; i < 3; i++) strip.push(SYMBOLS[1]); // Red 7
  for (let i = 0; i < 4; i++) strip.push(SYMBOLS[2]); // Blue 7
  for (let i = 0; i < 4; i++) strip.push(SYMBOLS[3]); // White 7
  // BARs - common (5-6 each)
  for (let i = 0; i < 5; i++) strip.push(SYMBOLS[4]); // Triple BAR
  for (let i = 0; i < 6; i++) strip.push(SYMBOLS[5]); // Double BAR
  for (let i = 0; i < 6; i++) strip.push(SYMBOLS[6]); // Single BAR
  // Cherries & Bells - very common (8 each)
  for (let i = 0; i < 8; i++) strip.push(SYMBOLS[7]); // Cherry
  for (let i = 0; i < 6; i++) strip.push(SYMBOLS[8]); // Bell
  // Scatter - rare (2 per reel)
  for (let i = 0; i < 2; i++) strip.push(SYMBOLS[9]);

  // Shuffle the strip
  for (let i = strip.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [strip[i], strip[j]] = [strip[j], strip[i]];
  }
  return strip;
};

// Create 5 different reel strips
const REEL_STRIPS = [
  createReelStrip(),
  createReelStrip(),
  createReelStrip(),
  createReelStrip(),
  createReelStrip(),
];

// Paylines for 5-reel slot (20 paylines)
const PAYLINES = [
  // Horizontal lines
  [1, 1, 1, 1, 1], // Middle row
  [0, 0, 0, 0, 0], // Top row
  [2, 2, 2, 2, 2], // Bottom row
  // V shapes
  [0, 1, 2, 1, 0], // V down
  [2, 1, 0, 1, 2], // V up
  // Zigzags
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  // W shapes
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  // More complex patterns
  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  // Additional patterns
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 2, 0, 2, 0],
];

interface MorbiusBlazing7sProps {
  betAmount?: number;
  onSpinComplete?: (result: SpinResult) => void;
  disabled?: boolean;
  balance?: number;
  onBalanceChange?: (newBalance: number) => void;
}

interface SpinResult {
  grid: typeof SYMBOLS[number][][];
  winningLines: { lineIndex: number; symbols: typeof SYMBOLS[number][]; payout: number }[];
  totalWin: number;
  isJackpot: boolean;
  freeSpinsWon: number;
}

// Progressive Jackpot tiers
const JACKPOT_TIERS = [
  { name: 'MORBIUS MEGA', amount: 75000, color: '#ffd700', symbols: 5 },
  { name: 'BLAZING', amount: 30000, color: '#ff6b35', symbols: 4 },
  { name: 'HOT', amount: 9750, color: '#ff3366', symbols: 3 },
  { name: 'WARM', amount: 1500, color: '#ff6699', symbols: 3 },
  { name: 'MINI', amount: 750, color: '#cc99ff', symbols: 2 },
];

// Sound engine for slot machine
class SlotSoundEngine {
  private masterGain: GainNode | null = null;

  private getContext(): AudioContext | null {
    return AudioManager.getContext();
  }

  init() {
    const ctx = this.getContext();
    if (!ctx || this.masterGain) return;

    try {
      AudioManager.unlock();
      this.masterGain = ctx.createGain();
      this.masterGain.connect(ctx.destination);
      this.masterGain.gain.value = 0.3;
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

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
    oscillator.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
  }

  tick() {
    this.init();
    this.playTone(400 + Math.random() * 300, 0.02, 'square');
  }

  reelStop(reelIndex: number) {
    this.init();
    const baseFreq = 200 - reelIndex * 15;
    this.playTone(baseFreq, 0.15, 'square');
    setTimeout(() => this.playTone(baseFreq * 1.5, 0.1, 'sine'), 50);
  }

  win() {
    this.init();
    const notes = [523, 659, 784, 880, 1047, 1319];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.3, 'sine'), i * 80);
    });
  }

  jackpot() {
    this.init();
    const melody = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
    melody.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.4, 'sine');
        this.playTone(freq * 0.5, 0.4, 'triangle');
      }, i * 150);
    });
  }

  lose() {
    this.init();
    this.playTone(200, 0.3, 'triangle');
    setTimeout(() => this.playTone(150, 0.4, 'triangle'), 150);
  }
}

const MorbiusBlazing7s: React.FC<MorbiusBlazing7sProps> = ({
  betAmount = 1,
  onSpinComplete,
  disabled = false,
  balance = 10000,
  onBalanceChange,
}) => {
  const SYMBOL_HEIGHT = 100;
  const SYMBOL_WIDTH = 100;
  const VISIBLE_ROWS = 3;
  const NUM_REELS = 5;

  // Reel positions (indices into the reel strips)
  const [reelPositions, setReelPositions] = useState<number[]>([0, 0, 0, 0, 0]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinningReels, setSpinningReels] = useState<boolean[]>([false, false, false, false, false]);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [showWin, setShowWin] = useState(false);
  const [currentBet, setCurrentBet] = useState(betAmount);
  const [activePaylines, setActivePaylines] = useState(20);
  const [winningPositions, setWinningPositions] = useState<Set<string>>(new Set());
  const [jackpots, setJackpots] = useState(JACKPOT_TIERS.map(t => t.amount + Math.random() * 100));
  const [autoSpin, setAutoSpin] = useState(false);
  const [freeSpins, setFreeSpins] = useState(0);

  const soundEngine = useRef(new SlotSoundEngine());
  const animationFrameRef = useRef<number | null>(null);
  const velocitiesRef = useRef<number[]>([0, 0, 0, 0, 0]);
  const targetPositionsRef = useRef<number[]>([0, 0, 0, 0, 0]);
  const spinPhaseRef = useRef<('stopped' | 'accelerating' | 'spinning' | 'decelerating')[]>(
    ['stopped', 'stopped', 'stopped', 'stopped', 'stopped']
  );
  const lastTickRef = useRef<number[]>([0, 0, 0, 0, 0]);
  const hasTriggeredResultRef = useRef(false);
  const currentPositionsRef = useRef<number[]>([0, 0, 0, 0, 0]);

  // Increment jackpots slowly
  useEffect(() => {
    const interval = setInterval(() => {
      setJackpots(prev => prev.map((j, i) => j + (0.01 * (5 - i))));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Get visible symbols for a reel at given position
  const getVisibleSymbols = useCallback((reelIndex: number, position: number) => {
    const strip = REEL_STRIPS[reelIndex];
    const symbols = [];
    for (let i = -1; i <= VISIBLE_ROWS; i++) {
      const idx = (Math.floor(position) + i + strip.length) % strip.length;
      symbols.push(strip[idx]);
    }
    return symbols;
  }, []);

  // Get the current grid of symbols (3 rows x 5 columns)
  const getCurrentGrid = useCallback((): typeof SYMBOLS[number][][] => {
    const grid: typeof SYMBOLS[number][][] = [[], [], []];
    for (let reel = 0; reel < NUM_REELS; reel++) {
      const strip = REEL_STRIPS[reel];
      const pos = Math.floor(currentPositionsRef.current[reel]);
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        const idx = (pos + row) % strip.length;
        grid[row][reel] = strip[idx];
      }
    }
    return grid;
  }, []);

  // Check for winning combinations
  const checkWins = useCallback((grid: typeof SYMBOLS[number][][]): SpinResult => {
    const winningLines: SpinResult['winningLines'] = [];
    let totalWin = 0;
    let isJackpot = false;
    let scatterCount = 0;
    const winPositions = new Set<string>();

    // Count scatters
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      for (let col = 0; col < NUM_REELS; col++) {
        if (grid[row][col].isScatter) {
          scatterCount++;
          winPositions.add(`${row}-${col}`);
        }
      }
    }

    // Check each active payline
    for (let lineIdx = 0; lineIdx < activePaylines; lineIdx++) {
      const line = PAYLINES[lineIdx];
      const lineSymbols = line.map((row, col) => grid[row][col]);

      // Get the first non-wild symbol
      let firstSymbol = lineSymbols.find(s => !s.isWild && !s.isScatter);
      if (!firstSymbol) firstSymbol = lineSymbols[0]; // All wilds

      // Count consecutive matches from left
      let matchCount = 0;
      for (let i = 0; i < lineSymbols.length; i++) {
        const sym = lineSymbols[i];
        if (sym.isWild || sym.id === firstSymbol.id) {
          matchCount++;
        } else {
          break;
        }
      }

      // Minimum 3 matches for a win
      if (matchCount >= 3) {
        const basePayout = firstSymbol.multiplier * currentBet;
        const wildMultiplier = lineSymbols.slice(0, matchCount).filter(s => s.isWild).length > 0 ? 2 : 1;
        const payout = basePayout * (matchCount - 2) * wildMultiplier;

        winningLines.push({
          lineIndex: lineIdx,
          symbols: lineSymbols.slice(0, matchCount),
          payout,
        });

        totalWin += payout;

        // Mark winning positions
        for (let i = 0; i < matchCount; i++) {
          winPositions.add(`${line[i]}-${i}`);
        }

        // Check for jackpot (5 morbius wilds)
        if (matchCount === 5 && firstSymbol.isWild) {
          isJackpot = true;
          totalWin = jackpots[0];
        }
      }
    }

    // Free spins from scatters
    const freeSpinsWon = scatterCount >= 3 ? (scatterCount - 2) * 5 : 0;

    setWinningPositions(winPositions);

    return {
      grid,
      winningLines,
      totalWin,
      isJackpot,
      freeSpinsWon,
    };
  }, [activePaylines, currentBet, jackpots]);

  // Animation loop
  useEffect(() => {
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = Math.min((currentTime - lastTime) / 16.67, 3);
      lastTime = currentTime;

      let anySpinning = false;

      for (let i = 0; i < NUM_REELS; i++) {
        const phase = spinPhaseRef.current[i];

        if (phase === 'stopped') continue;
        anySpinning = true;

        const strip = REEL_STRIPS[i];

        if (phase === 'accelerating') {
          velocitiesRef.current[i] = Math.min(velocitiesRef.current[i] + 3 * deltaTime, 50);
          if (velocitiesRef.current[i] >= 50) {
            spinPhaseRef.current[i] = 'spinning';
          }
        } else if (phase === 'decelerating') {
          const target = targetPositionsRef.current[i];
          const current = currentPositionsRef.current[i] % strip.length;
          let distance = target - current;
          if (distance < 0) distance += strip.length;

          if (distance < 3) {
            velocitiesRef.current[i] = Math.max(velocitiesRef.current[i] * 0.85, 2);
          } else if (distance < 8) {
            velocitiesRef.current[i] = Math.max(velocitiesRef.current[i] * 0.92, 5);
          }

          if (distance < 0.5 && velocitiesRef.current[i] < 3) {
            currentPositionsRef.current[i] = target;
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
        currentPositionsRef.current[i] = (currentPositionsRef.current[i] + velocitiesRef.current[i] * deltaTime * 0.1) % strip.length;

        // Tick sound
        if (currentTime - lastTickRef.current[i] > 60 && velocitiesRef.current[i] > 20) {
          soundEngine.current.tick();
          lastTickRef.current[i] = currentTime;
        }
      }

      // Update state for rendering
      setReelPositions([...currentPositionsRef.current]);

      // Check if all stopped
      const allStopped = spinPhaseRef.current.every(p => p === 'stopped');
      if (allStopped && !hasTriggeredResultRef.current && isSpinning) {
        hasTriggeredResultRef.current = true;
        setTimeout(() => {
          const grid = getCurrentGrid();
          const spinResult = checkWins(grid);
          setResult(spinResult);
          setShowWin(spinResult.totalWin > 0);
          setIsSpinning(false);

          if (spinResult.isJackpot) {
            soundEngine.current.jackpot();
          } else if (spinResult.totalWin > 0) {
            soundEngine.current.win();
          } else {
            soundEngine.current.lose();
          }

          if (spinResult.freeSpinsWon > 0) {
            setFreeSpins(prev => prev + spinResult.freeSpinsWon);
          }

          if (onSpinComplete) {
            onSpinComplete(spinResult);
          }

          if (onBalanceChange && spinResult.totalWin > 0) {
            onBalanceChange(balance + spinResult.totalWin);
          }
        }, 300);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isSpinning, checkWins, getCurrentGrid, onSpinComplete, onBalanceChange, balance]);

  // Handle spin
  const handleSpin = useCallback(() => {
    if (isSpinning || disabled || spinningReels.some(s => s)) return;
    if (balance < currentBet * activePaylines && freeSpins === 0) return;

    soundEngine.current.init();
    soundEngine.current.spinStart();

    setIsSpinning(true);
    setShowWin(false);
    setResult(null);
    setWinningPositions(new Set());
    hasTriggeredResultRef.current = false;

    // Deduct bet (unless free spin)
    if (freeSpins > 0) {
      setFreeSpins(prev => prev - 1);
    } else if (onBalanceChange) {
      onBalanceChange(balance - currentBet * activePaylines);
    }

    // Generate random target positions for each reel
    targetPositionsRef.current = REEL_STRIPS.map(strip =>
      Math.floor(Math.random() * strip.length)
    );

    // Start all reels
    velocitiesRef.current = [5, 5, 5, 5, 5];
    spinPhaseRef.current = ['accelerating', 'accelerating', 'accelerating', 'accelerating', 'accelerating'];
    setSpinningReels([true, true, true, true, true]);

    // Stagger the deceleration (left to right)
    const baseDelay = 800;
    for (let i = 0; i < NUM_REELS; i++) {
      setTimeout(() => {
        spinPhaseRef.current[i] = 'decelerating';
      }, baseDelay + i * 400);
    }
  }, [isSpinning, disabled, spinningReels, balance, currentBet, activePaylines, freeSpins, onBalanceChange]);

  // Auto-spin effect
  useEffect(() => {
    if (autoSpin && !isSpinning && !spinningReels.some(s => s)) {
      const timeout = setTimeout(handleSpin, 1000);
      return () => clearTimeout(timeout);
    }
  }, [autoSpin, isSpinning, spinningReels, handleSpin]);

  // Render a single symbol
  const renderSymbol = (symbol: typeof SYMBOLS[number], isBlurred: boolean, isWinning: boolean) => {
    const blurStyle = isBlurred ? { filter: 'blur(3px)' } : {};
    const winStyle = isWinning ? {
      filter: 'drop-shadow(0 0 10px #ffd700) drop-shadow(0 0 20px #ffd700)',
      animation: 'pulse 0.5s ease-in-out infinite',
    } : {};

    if (symbol.image) {
      return (
        <div
          className="flex items-center justify-center w-full h-full"
          style={{ ...blurStyle, ...winStyle }}
        >
          <Image
            src={symbol.image}
            alt={symbol.name}
            width={70}
            height={70}
            className="object-contain"
          />
        </div>
      );
    }

    // Render 7s with color
    if (symbol.id.includes('blazing-7')) {
      return (
        <div
          className="flex items-center justify-center w-full h-full text-6xl font-black"
          style={{
            color: symbol.color,
            textShadow: `0 0 20px ${symbol.color}, 0 0 40px ${symbol.color}`,
            ...blurStyle,
            ...winStyle,
          }}
        >
          7
        </div>
      );
    }

    // Render BAR symbols
    if (symbol.id.includes('bar')) {
      const barCount = symbol.id === 'triple-bar' ? 3 : symbol.id === 'double-bar' ? 2 : 1;
      return (
        <div
          className="flex flex-col items-center justify-center w-full h-full"
          style={{ ...blurStyle, ...winStyle }}
        >
          {[...Array(barCount)].map((_, i) => (
            <div
              key={i}
              className="w-16 h-3 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600 rounded-sm mb-0.5"
              style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
            />
          ))}
          <span className="text-xs font-bold text-yellow-400 mt-1">BAR</span>
        </div>
      );
    }

    return (
      <div
        className="flex items-center justify-center w-full h-full text-5xl"
        style={{ ...blurStyle, ...winStyle }}
      >
        {symbol.emoji}
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto">
      {/* Slot Machine Cabinet */}
      <div
        className="relative w-full rounded-t-3xl p-1"
        style={{
          background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
          border: '3px solid #2a2a4a',
          boxShadow: '0 0 50px rgba(138, 43, 226, 0.3), inset 0 0 30px rgba(0,0,0,0.8)',
        }}
      >
        {/* Top Header with Jackpots */}
        <div
          className="w-full rounded-t-2xl p-4 mb-2"
          style={{
            background: 'linear-gradient(180deg, #1a0a2e 0%, #0a0015 100%)',
            borderBottom: '2px solid #4a1a6e',
          }}
        >
          {/* Logo */}
          <div className="flex items-center justify-center mb-4">
            <Image
              src="/morbius/MorbiusLogo (3).png"
              alt="Morbius"
              width={60}
              height={60}
              className="mr-3"
            />
            <div className="text-center">
              <h1
                className="text-3xl font-black tracking-wider"
                style={{
                  background: 'linear-gradient(180deg, #ffd700, #ff6b35, #ff3366)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: '0 0 30px rgba(255, 107, 53, 0.5)',
                }}
              >
                MORBIUS BLAZING 7s
              </h1>
              <p className="text-purple-300 text-sm tracking-widest">MEGA JACKPOT</p>
            </div>
          </div>

          {/* Progressive Jackpots */}
          <div className="grid grid-cols-5 gap-2">
            {JACKPOT_TIERS.map((tier, idx) => (
              <div
                key={tier.name}
                className="text-center p-2 rounded-lg"
                style={{
                  background: `linear-gradient(180deg, ${tier.color}22, transparent)`,
                  border: `1px solid ${tier.color}44`,
                }}
              >
                <div className="text-xs font-bold" style={{ color: tier.color }}>{tier.name}</div>
                <div
                  className="text-lg font-black"
                  style={{ color: tier.color }}
                >
                  ${jackpots[idx].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Reel Area */}
        <div
          className="relative mx-2 rounded-xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #0a0a15, #050508)',
            border: '4px solid #3a3a5a',
            boxShadow: 'inset 0 0 50px rgba(0,0,0,0.9), 0 0 20px rgba(138, 43, 226, 0.2)',
          }}
        >
          {/* Win line indicators - Left */}
          <div className="absolute left-0 top-0 bottom-0 w-6 flex flex-col justify-around py-4 z-20">
            {[0, 1, 2].map(row => (
              <div
                key={row}
                className="w-4 h-4 rounded-full"
                style={{
                  background: showWin && winningPositions.size > 0
                    ? 'radial-gradient(circle, #ffd700, #ff6b35)'
                    : 'radial-gradient(circle, #4a4a6a, #2a2a4a)',
                  boxShadow: showWin ? '0 0 15px #ffd700' : 'none',
                }}
              />
            ))}
          </div>

          {/* Win line indicators - Right */}
          <div className="absolute right-0 top-0 bottom-0 w-6 flex flex-col justify-around py-4 z-20">
            {[0, 1, 2].map(row => (
              <div
                key={row}
                className="w-4 h-4 rounded-full ml-auto mr-1"
                style={{
                  background: showWin && winningPositions.size > 0
                    ? 'radial-gradient(circle, #ffd700, #ff6b35)'
                    : 'radial-gradient(circle, #4a4a6a, #2a2a4a)',
                  boxShadow: showWin ? '0 0 15px #ffd700' : 'none',
                }}
              />
            ))}
          </div>

          {/* Reels Container */}
          <div className="flex justify-center gap-1 p-4 pl-8 pr-8">
            {[0, 1, 2, 3, 4].map((reelIndex) => {
              const position = reelPositions[reelIndex];
              const fractionalOffset = (position % 1) * SYMBOL_HEIGHT;
              const visibleSymbols = getVisibleSymbols(reelIndex, position);
              const isReelSpinning = spinningReels[reelIndex];

              return (
                <div
                  key={reelIndex}
                  className="relative overflow-hidden rounded-lg"
                  style={{
                    width: `${SYMBOL_WIDTH}px`,
                    height: `${SYMBOL_HEIGHT * VISIBLE_ROWS}px`,
                    background: 'linear-gradient(180deg, rgba(20,20,35,0.95), rgba(10,10,20,0.98))',
                    boxShadow: 'inset 0 10px 30px rgba(0,0,0,0.8), inset 0 -10px 30px rgba(0,0,0,0.8)',
                    border: '2px solid #2a2a4a',
                  }}
                >
                  {/* Top/Bottom gradient overlay */}
                  <div
                    className="absolute inset-0 z-10 pointer-events-none"
                    style={{
                      background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.7) 100%)',
                    }}
                  />

                  {/* Symbol strip */}
                  <div
                    className="absolute left-0 right-0"
                    style={{
                      transform: `translateY(${-fractionalOffset}px)`,
                    }}
                  >
                    {visibleSymbols.map((symbol, idx) => {
                      const row = idx - 1;
                      const isWinning = winningPositions.has(`${row}-${reelIndex}`);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-center"
                          style={{
                            height: `${SYMBOL_HEIGHT}px`,
                            width: `${SYMBOL_WIDTH}px`,
                          }}
                        >
                          {renderSymbol(
                            symbol,
                            isReelSpinning && velocitiesRef.current[reelIndex] > 25,
                            isWinning && showWin
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Reel separator highlight */}
                  <div
                    className="absolute inset-y-0 right-0 w-px"
                    style={{ background: 'linear-gradient(180deg, transparent, #4a4a6a, transparent)' }}
                  />
                </div>
              );
            })}
          </div>

          {/* Center payline indicator */}
          <div
            className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 pointer-events-none z-30"
            style={{
              background: showWin
                ? 'linear-gradient(90deg, #ffd700, #ff6b35, #ffd700)'
                : 'linear-gradient(90deg, rgba(138, 43, 226, 0.6), rgba(255, 107, 53, 0.4), rgba(138, 43, 226, 0.6))',
              boxShadow: showWin ? '0 0 20px #ffd700' : '0 0 10px rgba(138, 43, 226, 0.5)',
            }}
          />
        </div>

        {/* Win Display */}
        {showWin && result && result.totalWin > 0 && (
          <div
            className="mx-2 mt-2 p-4 rounded-xl text-center"
            style={{
              background: 'linear-gradient(180deg, #2a1a0a, #1a0a00)',
              border: '2px solid #ffd700',
              boxShadow: '0 0 30px rgba(255, 215, 0, 0.5), inset 0 0 20px rgba(255, 215, 0, 0.1)',
            }}
          >
            <div className="text-yellow-400 text-lg font-bold mb-1">
              {result.isJackpot ? 'MEGA JACKPOT!' : result.winningLines.length > 3 ? 'BIG WIN!' : 'WIN!'}
            </div>
            <div
              className="text-4xl font-black"
              style={{
                background: 'linear-gradient(180deg, #ffd700, #ff6b35)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              ${result.totalWin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-yellow-400/60 text-sm mt-1">
              {result.winningLines.length} Winning Line{result.winningLines.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* Free Spins Display */}
        {freeSpins > 0 && (
          <div
            className="mx-2 mt-2 p-3 rounded-xl text-center"
            style={{
              background: 'linear-gradient(180deg, #0a2a1a, #001a0a)',
              border: '2px solid #00ff88',
              boxShadow: '0 0 20px rgba(0, 255, 136, 0.3)',
            }}
          >
            <div className="text-green-400 text-lg font-bold">
              FREE SPINS: {freeSpins}
            </div>
          </div>
        )}

        {/* Control Panel */}
        <div
          className="mx-2 mt-3 mb-2 p-4 rounded-xl"
          style={{
            background: 'linear-gradient(180deg, #1a1a2e, #0f0f1a)',
            border: '2px solid #3a3a5a',
          }}
        >
          {/* Bet Controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-purple-300 text-sm">BET:</span>
              <button
                onClick={() => setCurrentBet(Math.max(1, currentBet - 1))}
                disabled={isSpinning}
                className="w-8 h-8 rounded-lg bg-purple-900/50 text-purple-300 hover:bg-purple-800/50 disabled:opacity-50"
              >
                -
              </button>
              <span className="text-white font-bold w-16 text-center">${currentBet}</span>
              <button
                onClick={() => setCurrentBet(Math.min(100, currentBet + 1))}
                disabled={isSpinning}
                className="w-8 h-8 rounded-lg bg-purple-900/50 text-purple-300 hover:bg-purple-800/50 disabled:opacity-50"
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-purple-300 text-sm">LINES:</span>
              <button
                onClick={() => setActivePaylines(Math.max(1, activePaylines - 1))}
                disabled={isSpinning}
                className="w-8 h-8 rounded-lg bg-purple-900/50 text-purple-300 hover:bg-purple-800/50 disabled:opacity-50"
              >
                -
              </button>
              <span className="text-white font-bold w-8 text-center">{activePaylines}</span>
              <button
                onClick={() => setActivePaylines(Math.min(20, activePaylines + 1))}
                disabled={isSpinning}
                className="w-8 h-8 rounded-lg bg-purple-900/50 text-purple-300 hover:bg-purple-800/50 disabled:opacity-50"
              >
                +
              </button>
            </div>

            <div className="text-right">
              <div className="text-purple-300 text-xs">TOTAL BET</div>
              <div className="text-yellow-400 font-bold">${currentBet * activePaylines}</div>
            </div>
          </div>

          {/* Balance and Spin */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-purple-300 text-xs">BALANCE</div>
              <div className="text-white font-bold text-xl">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setAutoSpin(!autoSpin)}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                  autoSpin
                    ? 'bg-green-600 text-white'
                    : 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/50'
                }`}
              >
                AUTO
              </button>

              <button
                onClick={handleSpin}
                disabled={isSpinning || disabled || spinningReels.some(s => s) || (balance < currentBet * activePaylines && freeSpins === 0)}
                className="relative px-8 py-3 rounded-xl font-black text-lg uppercase tracking-wider transition-all overflow-hidden disabled:opacity-50"
                style={{
                  background: isSpinning
                    ? 'linear-gradient(180deg, #3a3a5a, #2a2a4a)'
                    : 'linear-gradient(180deg, #ff6b35, #ff3366)',
                  boxShadow: isSpinning
                    ? 'none'
                    : '0 0 30px rgba(255, 107, 53, 0.5), inset 0 2px 0 rgba(255,255,255,0.2)',
                  border: '2px solid',
                  borderColor: isSpinning ? '#4a4a6a' : '#ffd700',
                }}
              >
                {spinningReels.some(s => s) ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    SPINNING
                  </span>
                ) : freeSpins > 0 ? (
                  'FREE SPIN'
                ) : (
                  'SPIN'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cabinet Base */}
      <div
        className="w-full h-4 rounded-b-xl"
        style={{
          background: 'linear-gradient(180deg, #2a2a4a, #1a1a2e)',
          borderLeft: '3px solid #2a2a4a',
          borderRight: '3px solid #2a2a4a',
          borderBottom: '3px solid #2a2a4a',
        }}
      />

      {/* Paytable Preview */}
      <div
        className="w-full mt-4 p-4 rounded-xl"
        style={{
          background: 'linear-gradient(180deg, #1a1a2e, #0f0f1a)',
          border: '2px solid #2a2a4a',
        }}
      >
        <h3 className="text-purple-300 font-bold mb-3 text-center">PAYTABLE</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="text-yellow-400 font-bold">5x Morbius Wild</div>
            <div className="text-white">MEGA JACKPOT</div>
          </div>
          <div className="text-center">
            <div className="text-red-400 font-bold">5x Red 7</div>
            <div className="text-white">200x Bet</div>
          </div>
          <div className="text-center">
            <div className="text-blue-400 font-bold">5x Blue 7</div>
            <div className="text-white">150x Bet</div>
          </div>
          <div className="text-center">
            <div className="text-white font-bold">5x White 7</div>
            <div className="text-white">100x Bet</div>
          </div>
          <div className="text-center">
            <div className="text-yellow-600 font-bold">5x Triple BAR</div>
            <div className="text-white">50x Bet</div>
          </div>
          <div className="text-center">
            <div className="text-green-400 font-bold">3+ Scatters</div>
            <div className="text-white">Free Spins</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MorbiusBlazing7s;
