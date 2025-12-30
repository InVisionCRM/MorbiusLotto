
import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import {
  ROWS,
  BUCKET_HEIGHT,
  MULTIPLIERS,
  COLORS,
  PHYSICS,
  CHUTE_RADIUS
} from '../constants';
import { CollisionLabel, RiskLevel } from '../types';


interface PlinkoGameProps {
  onScore: (multiplier: number) => void;
  lastDrop: { id: number; risk: RiskLevel } | null;
}

// Collision categories to prevent ball-ball interactions (like online Plinko games)
const COLLISION_CATEGORIES = {
  BALL: 0x0001,    // Category for balls
  PEG: 0x0002,     // Category for pegs
  BUCKET: 0x0004,  // Category for buckets
  WALL: 0x0008     // Category for walls (if any)
};

const PlinkoGame: React.FC<PlinkoGameProps> = ({ onScore, lastDrop }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const ballsToRemove = useRef<Set<Matter.Body>>(new Set());
  const activeHits = useRef<Map<string, number>>(new Map());
  const pegHits = useRef<Map<number, number>>(new Map()); // Track single hits
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);

  // Dynamic board dimensions that scale with available space
  const BOARD_HEIGHT = Math.max(300, Math.min(dimensions.height * 0.9, dimensions.width * 1.2)); // 90% of height or proportional to width, increased initial size
  const BOARD_WIDTH = BOARD_HEIGHT; // Keep square aspect ratio
  const BOARD_START_Y = 0; // Adjusted starting position

  // Dynamic ball and peg sizes that scale with board (accounting for additional scaleFactor)
  const PEG_RADIUS = Math.max(1.5, Math.min(BOARD_WIDTH * 0.006, 1.0));  // 0.6% of board width, min 1.5, max 2.0 (scales to max 3px)
  const BALL_RADIUS = Math.max(3, Math.min(BOARD_WIDTH * 0.010, 3.0));   // 1.0% of board width, min 3, max 4.0 (scales to max 6px)

  // Store scaled values for use in other effects
  const scaledValuesRef = useRef({
    ballRadius: BALL_RADIUS,
    pegRadius: PEG_RADIUS,
    chuteRadius: CHUTE_RADIUS,
    boardOffsetX: 0,
    boardWidth: 0,
    dropY: 0
  });


  // Sound effects with Web Audio API for smooth playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffers = useRef<Map<string, AudioBuffer>>(new Map());

  // Initialize Web Audio API context and preload sounds
  useEffect(() => {
    const initAudio = async () => {
      try {
        // Create audio context
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Load and decode audio files
        const loadAudio = async (url: string, key: string) => {
          try {
            console.log(`Loading audio: ${key} from ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch ${url}: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            console.log(`Decoding audio: ${key}, size: ${arrayBuffer.byteLength} bytes`);
            const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
            audioBuffers.current.set(key, audioBuffer);
            console.log(`Successfully loaded: ${key}, duration: ${audioBuffer.duration}s`);
          } catch (error) {
            console.error(`Failed to load audio ${key}:`, error);
          }
        };

          await Promise.all([
            loadAudio('/ui/sounds/positive.wav', 'bucket'),
            loadAudio('/ui/sounds/nagative.wav', 'negative'),
            loadAudio('/ui/sounds/drop.wav', 'drop')
          ]);

        console.log('Audio loading complete. Loaded buffers:', Array.from(audioBuffers.current.keys()));
      } catch (error) {
        console.warn('Audio initialization failed:', error);
      }
    };

    initAudio();

    // Resume audio context on user interaction
    const resumeAudio = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);

    return () => {
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
  }, []);

  const playSound = (soundKey: string, volume: number = 0.3, duration?: number, pitch: number = 1.0) => {
    if (!audioContextRef.current || !audioBuffers.current.has(soundKey)) return;

    try {
      const audioBuffer = audioBuffers.current.get(soundKey)!;
      const source = audioContextRef.current.createBufferSource();
      const gainNode = audioContextRef.current.createGain();

      source.buffer = audioBuffer;
      source.playbackRate.value = pitch; // Apply pitch shifting
      gainNode.gain.value = volume;

      // Use custom duration or full buffer duration
      const playDuration = duration || audioBuffer.duration;

      // Add fade in/out to prevent clicks - longer fades for smoother playback
      const now = audioContextRef.current.currentTime;
      const fadeInTime = 0; // 15ms fade in
      const fadeOutTime = 0.025; // 25ms fade out

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume, now + fadeInTime);

      // Hold volume, then fade out before the end
      if (playDuration > fadeInTime + fadeOutTime) {
        gainNode.gain.setValueAtTime(volume, now + playDuration - fadeOutTime);
        gainNode.gain.linearRampToValueAtTime(0, now + playDuration);
      } else {
        // If duration is too short, just do a quick fade out
        gainNode.gain.linearRampToValueAtTime(0, now + playDuration);
      }

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);


      // Start and stop at specified duration
      source.start(0);
      if (duration) {
        source.stop(now + duration);
      }
    } catch (error) {
      // Fallback to simple Audio if Web Audio API fails
      console.warn('Web Audio API failed, using fallback');
      try {
        let audioPath = '';
        if (soundKey === 'bucket') audioPath = '/ui/sounds/positive.wav';
        else if (soundKey === 'negative') audioPath = '/ui/sounds/nagative.wav';
        else if (soundKey === 'drop') audioPath = '/ui/sounds/drop.wav';

        if (audioPath) {
          const audio = new Audio(audioPath);
          audio.volume = volume;
          audio.play().catch(() => {});
        }
      } catch (fallbackError) {
        // Silently fail
      }
    }
  };


  const playBucketHitSound = () => playSound('bucket', 0.25);
  const playNegativeSound = () => playSound('negative', 0.25);
  const playDropSound = () => playSound('drop', 0.08);


    // Center the board in the available space, moved down by 300px
    const boardOffsetX = Math.max(0, (dimensions.width - BOARD_WIDTH) / 2);
    const boardOffsetY = Math.max(10, (dimensions.height - BOARD_HEIGHT) / 2) + 100;

    const startY = BOARD_START_Y + boardOffsetY;

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Update scaled values when dimensions change
  useEffect(() => {
    scaledValuesRef.current = {
      ballRadius: BALL_RADIUS,
      pegRadius: PEG_RADIUS,
      chuteRadius: CHUTE_RADIUS,
      boardOffsetX: Math.max(0, (dimensions.width - BOARD_WIDTH) / 2),
      boardWidth: BOARD_WIDTH,
      dropY: BOARD_START_Y - PEG_RADIUS - 1
    };
  }, [dimensions, BALL_RADIUS, PEG_RADIUS, BOARD_WIDTH]);

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.src = '/ui/Pulse Branding/Banner/Dark/minimal.png';
    img.onload = () => {
      setBackgroundLoaded(true);
      console.log('Background image loaded successfully');
    };
    img.onerror = () => {
      console.error('Failed to load background image');
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0) return;

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: PHYSICS.GRAVITY },
      positionIterations: PHYSICS.ENGINE_ITERATIONS,
      velocityIterations: PHYSICS.ENGINE_ITERATIONS,
    });
    engineRef.current = engine;

    const render = Matter.Render.create({
      element: containerRef.current!,
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width: dimensions.width,
        height: dimensions.height,
        wireframes: false,
        background: 'transparent',
      }
    });
    renderRef.current = render;

    // Dynamic peg spacing that scales with board size
    const pegGapX = BOARD_WIDTH / 21.66; // Proportional horizontal spacing (24/260 ratio)
    const pegGapY = BOARD_HEIGHT / 28.88; // Proportional vertical spacing (18/260 ratio)

    // Scale radii proportionally with board size (base reference: 260px board)
    const scaleFactor = BOARD_HEIGHT / 260;
    const scaledPegRadius = PEG_RADIUS * scaleFactor;
    const scaledBallRadius = BALL_RADIUS * scaleFactor;
    const scaledChuteRadius = CHUTE_RADIUS * scaleFactor;

    // Discs fall from above the top row (considering scaled peg radius)
    const dropY = startY - scaledPegRadius - 1;

    // Store scaled values in ref for use in other effects
    scaledValuesRef.current = {
      ballRadius: scaledBallRadius,
      pegRadius: scaledPegRadius,
      chuteRadius: scaledChuteRadius,
      boardOffsetX,
      boardWidth: BOARD_WIDTH,
      dropY
    };

    const pegs: Matter.Body[] = [];
    for (let r = 0; r < ROWS; r++) {
      const rowY = startY + r * pegGapY;
      const rowPegCount = r + 2;
      const rowWidth = (rowPegCount - 1) * pegGapX;
      const startX = boardOffsetX + (BOARD_WIDTH - rowWidth) / 2; // Center in fixed board

      for (let c = 0; c < rowPegCount; c++) {
        const x = startX + c * pegGapX;
        pegs.push(Matter.Bodies.circle(x, rowY, scaledPegRadius, {
          isStatic: true,
          label: CollisionLabel.PEG,
          restitution: PHYSICS.PEG_RESTITUTION,
          friction: PHYSICS.PEG_FRICTION,
          slop: PHYSICS.SLOP,
          collisionFilter: {
            category: COLLISION_CATEGORIES.PEG,
            mask: COLLISION_CATEGORIES.BALL  // Pegs only collide with balls
          },
          render: {
            fillStyle: 'transparent',
            strokeStyle: 'transparent',
            lineWidth: 0
          }
        }));
      }
    }
    Matter.World.add(engine.world, pegs);

    const bucketCount = 15;
    const bucketWidth = pegGapX; // Same spacing as pegs for consistent look
    const bucketsTotalWidth = bucketCount * bucketWidth;
    const bucketsStartX = boardOffsetX + (BOARD_WIDTH - bucketsTotalWidth) / 2;
    const bucketBaseY = startY + (ROWS + 1) * pegGapY - (BOARD_HEIGHT / 28.88); // Scaled offset (24/260 ratio)

    // Create 3 rows of bucket sensors (one for each risk tier)
    const tiers: RiskLevel[] = ['GREEN', 'YELLOW', 'RED'];
    const tierHeight = BOARD_HEIGHT / 28.88; // Scaled bucket height (18/260 ratio)
    const tierGap = BOARD_HEIGHT / 130; // Scaled gap (2/260 ratio)

    tiers.forEach((tier, tierIdx) => {
      const tierY = bucketBaseY + tierIdx * (tierHeight + tierGap);

      for (let i = 0; i < bucketCount; i++) {
        const x = bucketsStartX + i * bucketWidth + bucketWidth / 2;
        const sensor = Matter.Bodies.rectangle(x, tierY + tierHeight / 2, bucketWidth, tierHeight, {
          isStatic: true,
          isSensor: true,
          label: CollisionLabel.BUCKET,
          plugin: { index: i, tier: tier },
          collisionFilter: {
            category: COLLISION_CATEGORIES.BUCKET,
            mask: COLLISION_CATEGORIES.BALL  // Buckets only collide with balls
          },
          render: { fillStyle: 'transparent' }
        });
        Matter.World.add(engine.world, sensor);
      }
    });

    Matter.Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const ball = bodyA.label === CollisionLabel.BALL ? bodyA : (bodyB.label === CollisionLabel.BALL ? bodyB : null);
        const peg = bodyA.label === CollisionLabel.PEG ? bodyA : (bodyB.label === CollisionLabel.PEG ? bodyB : null);
        const bucket = bodyA.label === CollisionLabel.BUCKET ? bodyA : (bodyB.label === CollisionLabel.BUCKET ? bodyB : null);

        if (ball && peg) {
          // Track peg hit for animation - only if not already animating
          const existingHitTime = pegHits.current.get(peg.id);
          if (!existingHitTime) {
            // First hit - start animation
            pegHits.current.set(peg.id, Date.now());
          }
          // Don't restart animation if peg is already glowing
        }

        if (ball && bucket && !ballsToRemove.current.has(ball)) {
          const index = bucket.plugin.index;
          const tier = bucket.plugin.tier as RiskLevel; // Get tier from bucket sensor
          const multiplier = MULTIPLIERS[tier][index];
          activeHits.current.set(`${tier}-${index}`, Date.now());
          onScore(multiplier);
          ballsToRemove.current.add(ball);

          // Play appropriate sound based on multiplier
          if (multiplier > 1) {
            playBucketHitSound();
          } else if (multiplier < 1) {
            playNegativeSound();
          }
        }
      });
    });

    // Draw background and elements "Behind" the balls
    Matter.Events.on(render, 'beforeRender', () => {
      const ctx = render.context;
      if (!ctx) return;


      const chuteX = boardOffsetX + BOARD_WIDTH / 2;
      const chuteY = dropY - 2; // Offset slightly for aesthetics

      ctx.save();
      // Outer rim
      ctx.beginPath();
      ctx.arc(chuteX, chuteY, scaledChuteRadius + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();

      // Deep dark hole
      ctx.beginPath();
      ctx.arc(chuteX, chuteY, scaledChuteRadius, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(chuteX, chuteY, 0, chuteX, chuteY, scaledChuteRadius);
      grad.addColorStop(0, '#000000');
      grad.addColorStop(0.8, '#0a0a0a');
      grad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = grad;
      ctx.fill();

      // Inner shadow/depth
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });

    Matter.Events.on(render, 'afterRender', () => {
      const ctx = render.context;
      if (!ctx) return;
      const now = Date.now();

      // Draw all pegs
      const pegs = engine.world.bodies.filter(body => body.label === CollisionLabel.PEG);

      // First pass: Clean up expired peg hits BEFORE drawing
      pegHits.current.forEach((hitTime, pegId) => {
        const elapsed = now - hitTime;
        if (elapsed >= 2900) {
          pegHits.current.delete(pegId);
        }
      });

      // Draw non-hit pegs in batch for better performance
      pegs.forEach((peg: Matter.Body) => {
        if (!pegHits.current.has(peg.id)) {
          ctx.save();
          // Add shadow for depth
          ctx.shadowColor = 'rgba(0, 0, 0, 0.76)';
          ctx.shadowBlur = 4 * scaleFactor;
          ctx.shadowOffsetX = 1 * scaleFactor;
          ctx.shadowOffsetY = 1 * scaleFactor;

          // Draw white peg
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(peg.position.x, peg.position.y, scaledPegRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // Draw hit pegs with white glow animation
      pegs.forEach((peg: Matter.Body) => {
        const hitTime = pegHits.current.get(peg.id);
        if (!hitTime) return;

        const elapsed = now - hitTime;

        ctx.save();

        // Add shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 4 * scaleFactor;
        ctx.shadowOffsetX = 1 * scaleFactor;
        ctx.shadowOffsetY = 1 * scaleFactor;

        // Draw base peg with white color
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(peg.position.x, peg.position.y, scaledPegRadius, 0, Math.PI * 2);
        ctx.fill();

        // Reset shadow for glow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw simple white glow with fade in/out
        // Calculate opacity with short fade in (150ms) and long fade out
        let glowOpacity = 0;
        if (elapsed < 150) {
          // Quick fade in
          glowOpacity = elapsed / 150;
        } else if (elapsed < 400) {
          // Full opacity in the middle
          glowOpacity = 1.0;
        } else if (elapsed < 2900) {
          // Long fade out (2500ms)
          glowOpacity = 1.0 - ((elapsed - 400) / 2500);
        }

        // Clamp opacity to valid range
        glowOpacity = Math.max(0, Math.min(1, glowOpacity));

        // Apply white glow with opacity (only if visible)
        if (glowOpacity > 0.01) {
          // Draw outer glow
          ctx.shadowColor = `rgba(255, 255, 255, ${glowOpacity * 0.8})`;
          ctx.shadowBlur = 1 * glowOpacity * scaleFactor;

          ctx.fillStyle = `rgba(255, 255, 255, ${glowOpacity * 0.2})`;
          ctx.beginPath();
          ctx.arc(peg.position.x, peg.position.y, scaledPegRadius + 2 * scaleFactor, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        });

      // Draw balls with gradient fills
      const balls = engine.world.bodies.filter(body => body.label === CollisionLabel.BALL);
      balls.forEach((ball: Matter.Body) => {
        ctx.save();

        // Create radial gradient for ball fill
        const gradient = ctx.createRadialGradient(
          ball.position.x - scaledBallRadius * 0.3,
          ball.position.y - scaledBallRadius * 0.3,
          0,
          ball.position.x,
          ball.position.y,
          scaledBallRadius
        );

        // Get ball color and create gradient
        const ballColor = ball.plugin.risk === 'GREEN' ? COLORS.BALL_GREEN :
                         ball.plugin.risk === 'YELLOW' ? COLORS.BALL_YELLOW :
                         COLORS.BALL_RED;

        // Parse RGB values from ball color
        const rgbMatch = ballColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
          const [_, r, g, b] = rgbMatch;
          // Create gradient: center (lighter), middle, edge (darker)
          gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);     // Center - bright
          gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.7)`);   // Middle
          gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.4)`);     // Edge - darker
        }

        // Fill ball with gradient
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, scaledBallRadius, 0, Math.PI * 2);
        ctx.fill();

        // Add subtle stroke for definition
        ctx.strokeStyle = ballColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
      });

      // Bucket Multipliers Rendering - Professional Clean Layout
      const tiers: RiskLevel[] = ['GREEN', 'YELLOW', 'RED'];
      const tierColors = {
        GREEN: { normal: 'rgb(140, 185, 60)', dark: 'rgb(130, 140, 45)' },
        YELLOW: { normal: 'rgb(255, 240, 60)', dark: 'rgb(200, 190, 30)' },
        RED: { normal: 'rgb(210, 50, 50)', dark: 'rgb(160, 35, 35)' }
      };

      tiers.forEach((tier, tIdx) => {
        const tierHeight = BOARD_HEIGHT / 28.88; // Scaled bucket height
        const tierGap = BOARD_HEIGHT / 130; // Scaled gap
        const yBase = bucketBaseY + tIdx * (tierHeight + tierGap);
        const mults = MULTIPLIERS[tier];
        const tierColor = tierColors[tier];

        mults.forEach((m, i) => {
          const x = bucketsStartX + i * bucketWidth;
          const bW = bucketWidth - 0.5; // Minimal gap
          const bH = tierHeight;

          let scale = 1.0;
          let glowIntensity = 0;
          const hitKey = `${tier}-${i}`;
          const hitTime = activeHits.current.get(hitKey);

          if (hitTime) {
            const elapsed = now - hitTime;
            if (elapsed < 350) {
              scale = 1.0 + (Math.sin((elapsed / 350) * Math.PI) * 0.15); // Zoom animation
            }
            if (elapsed < 1500) {
              glowIntensity = 1.0 - (elapsed / 1500);
            } else {
              activeHits.current.delete(hitKey);
            }
          }

          const finalBW = bW * scale;
          const finalBH = bH * scale;
          const offsetX = (finalBW - bW) / 2;
          const offsetY = (finalBH - bH) / 2;

          ctx.save();

          // Solid color background - darker for multipliers under 1
          const isDark = m < 1;
          const bgColor = isDark ? tierColor.dark : tierColor.normal;

          // Glow effect when hit
          if (glowIntensity > 0) {
            ctx.shadowBlur = 1 * glowIntensity;
            ctx.shadowColor = `rgba(255, 255, 255, ${glowIntensity * 0.8})`;
          }

          // Draw bucket - sharp corners, no rounding
          ctx.fillStyle = bgColor;
          ctx.fillRect(x - offsetX, yBase - offsetY, finalBW, finalBH);

          // Draw multiplier text - clean and simple
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#000000'; // Black text for maximum legibility
          ctx.font = `bold ${Math.min(9, bW / 2.5) * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(m.toString(), x + bW / 2, yBase + bH / 2);

          ctx.restore();
        });
      });

      if (ballsToRemove.current.size > 0) {
        ballsToRemove.current.forEach(ball => Matter.World.remove(engine.world, ball));
        ballsToRemove.current.clear();
      }
    });

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
    };
  }, [dimensions]);

  useEffect(() => {
    if (!lastDrop || !engineRef.current) return;
    const risk = lastDrop.risk;
    const ballColor = risk === 'GREEN' ? COLORS.BALL_GREEN : risk === 'YELLOW' ? COLORS.BALL_YELLOW : COLORS.BALL_RED;

    // Use scaled values from ref
    const { ballRadius, boardOffsetX, boardWidth, dropY } = scaledValuesRef.current;

    // Spawn centered within the fixed board with narrow spread
    const spawnX = boardOffsetX + (boardWidth / 2) + (Math.random() * PHYSICS.SPAWN_RANGE_X - PHYSICS.SPAWN_RANGE_X / 2);
    const initialVelX = (Math.random() - 0.5) * PHYSICS.INITIAL_V_X_VARIANCE;

    const ball = Matter.Bodies.circle(spawnX, dropY, ballRadius, {
      restitution: PHYSICS.BALL_RESTITUTION,
      friction: PHYSICS.BALL_FRICTION,
      frictionStatic: PHYSICS.BALL_FRICTION_STATIC,
      frictionAir: PHYSICS.BALL_FRICTION_AIR,
      density: PHYSICS.BALL_DENSITY,
      label: CollisionLabel.BALL,
      slop: PHYSICS.SLOP,
      plugin: { risk },
      collisionFilter: {
        category: COLLISION_CATEGORIES.BALL,
        mask: COLLISION_CATEGORIES.PEG | COLLISION_CATEGORIES.BUCKET // Balls don't collide with other balls
      },
      render: {
        visible: false // We'll draw balls manually with gradients
      }
    });
    // Give them a downward velocity so they don't just sit on the top peg
    Matter.Body.setVelocity(ball, { x: initialVelX, y: PHYSICS.INITIAL_V_Y });
    Matter.World.add(engineRef.current.world, ball);

    // Play drop sound when ball is released
    playDropSound();
  }, [lastDrop]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
    >
      <canvas ref={canvasRef} />
    </div>
  );
};

export default PlinkoGame;
