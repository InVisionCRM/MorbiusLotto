import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import seedrandom from 'seedrandom';
import { useAudio } from '@/hooks/use-audio';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ROWS,
  PEG_SPACING_X,
  PEG_SPACING_Y,
  START_Y,
  BUCKET_Y,
  PEG_RADIUS,
  BALL_RADIUS,
  PHYSICS,
  MULTIPLIERS
} from '@/app/PLINKO/constants';
import { RiskLevel } from '@/app/PLINKO/types';

// Seed database type - maps risk level -> bucket -> array of seed attempts
type SeedDatabase = {
  [riskLevel: string]: {
    [bucket: string]: number[];
  };
};

interface PlinkoGameProps {
  onScore: (multiplier: number, bucketIndex: number, contractData?: any) => void;
  lastDrop: any;
  selectedRiskLevel: RiskLevel;
  soundEnabled?: boolean;
  onSoundToggle?: (enabled: boolean) => void;
}

// Bucket odds based on binomial distribution for 16 rows (2^16 = 65536 total paths)
const BUCKET_ODDS: number[] = [
  1, 16, 120, 560, 1820, 4368, 8008, 11440, 12870, 11440, 8008, 4368, 1820, 560, 120, 16, 1
].map(paths => (paths / 65536) * 100);

const PlinkoGame: React.FC<PlinkoGameProps> = ({ onScore, lastDrop, selectedRiskLevel, soundEnabled = true, onSoundToggle }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine>(Matter.Engine.create());
  const ballsToRemove = useRef<Set<Matter.Body>>(new Set());
  const animatingPegs = useRef<Set<string>>(new Set());
  const pegAnimationStartTimes = useRef<Map<string, number>>(new Map());
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const animatingBucket = useRef<number | null>(null);
  const animatingBucketStartTime = useRef<number | null>(null);


  // Stable refs for callbacks used inside collision handler (avoids stale closures)
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const playSoundRef = useRef<typeof playSound>(null as any);

  // Sound state management
  const [internalSoundEnabled, setInternalSoundEnabled] = useState(soundEnabled);

  // Use the audio hook for mobile-friendly sound playback
  const { playSound, unlockAudio } = useAudio(internalSoundEnabled);
  playSoundRef.current = playSound;

  // Sound toggle handler - also unlocks audio on mobile when enabling
  const handleSoundToggle = () => {
    const newState = !internalSoundEnabled;
    setInternalSoundEnabled(newState);
    onSoundToggle?.(newState);

    // Unlock audio when user enables sound (user gesture)
    if (newState) {
      unlockAudio();
    }
  };

  // Seed database for deterministic physics replay
  const seedDatabaseRef = useRef<SeedDatabase | null>(null);
  const [seedDbLoaded, setSeedDbLoaded] = useState(false);

  // Load seed database on mount - MUST complete before contract drops work
  useEffect(() => {
    console.log('🔄 Loading seed database...');
    fetch('/seedDatabase.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SeedDatabase) => {
        seedDatabaseRef.current = data;
        setSeedDbLoaded(true);
        // Verify the data structure
        const bucketCount = Object.keys(data['GREEN'] || {}).length;
        const sampleBucket = data['GREEN']?.['8'];
        console.log('✅ Seed database loaded successfully:', {
          bucketCount,
          sampleBucketSeeds: sampleBucket?.length || 0,
          firstSeed: sampleBucket?.[0]
        });
      })
      .catch(err => {
        console.error('❌ Failed to load seed database:', err);
        // Try alternate path
        fetch('/public/seedDatabase.json')
          .then(res => res.json())
          .then((data: SeedDatabase) => {
            seedDatabaseRef.current = data;
            setSeedDbLoaded(true);
            console.log('✅ Seed database loaded from alternate path');
          })
          .catch(err2 => {
            console.error('❌ Also failed alternate path:', err2);
          });
      });
  }, []);


  // 1. Handle Resize & High-DPI (Retina) Resolution
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const dpr = window.devicePixelRatio || 1;
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;

        if (canvasRef.current) {
          // Set internal drawing resolution (Sharpness)
          canvasRef.current.width = width * dpr;
          canvasRef.current.height = height * dpr;
          // Set visual CSS size
          canvasRef.current.style.width = `${width}px`;
          canvasRef.current.style.height = `${height}px`;
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 2. Main Physics World Setup
  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0) return;

    const engine = engineRef.current;
    engine.gravity.y = PHYSICS.GRAVITY;

    // Set deterministic physics options
    engine.world.gravity.y = PHYSICS.GRAVITY;
    engine.constraintIterations = 10;
    engine.positionIterations = 10;
    engine.velocityIterations = 10;

    Matter.World.clear(engine.world, false);

    // Build Peg Board (16 Rows)
    const pegs: Matter.Body[] = [];
    let bottomRowStartX = 0;

    for (let r = 0; r < ROWS; r++) {
      const rowPegCount = r + 3;
      const rowWidth = (rowPegCount - 1) * PEG_SPACING_X;
      const startX = (WORLD_WIDTH - rowWidth) / 2;
      const y = START_Y + r * PEG_SPACING_Y;

      if (r === ROWS - 1) bottomRowStartX = startX;

      for (let c = 0; c < rowPegCount; c++) {
        pegs.push(Matter.Bodies.circle(startX + c * PEG_SPACING_X, y, PEG_RADIUS, {
          isStatic: true,
          restitution: PHYSICS.PEG_RESTITUTION,
          friction: 0,
          label: 'peg',
          render: { visible: false }
        }));
      }
    }
    Matter.World.add(engine.world, pegs);

    // Build 17 Buckets (Centered under last row gaps)
    // CRITICAL: Bucket positioning must EXACTLY match simulate-plinko.js and generate-plinko-seeds.js!
    const bucketWidth = PEG_SPACING_X; // 48px
    const bucketHeight = 50;

    for (let i = 0; i < 17; i++) {
      // Use bottomRowStartX (from peg calculation) - matches simulate-plinko.js exactly
      const x = bottomRowStartX + (i * PEG_SPACING_X) + (PEG_SPACING_X / 2);
      Matter.World.add(engine.world, Matter.Bodies.rectangle(x, BUCKET_Y, bucketWidth - 6, bucketHeight, {
        isStatic: true,
        isSensor: true,
        label: 'bucket',
        plugin: { index: i },
        render: { visible: false }
      }));
    }
    console.log(`🪣 Buckets created: bottomRowStartX=${bottomRowStartX}, Y=${BUCKET_Y}, width=${bucketWidth - 6}`);

    // Collision Detection — use refs so handler doesn't go stale
    const collisionHandler = (event: Matter.IEventCollision<Matter.Engine>) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const ball = bodyA.label === 'ball' ? bodyA : bodyB.label === 'ball' ? bodyB : null;
        const bucket = bodyA.label === 'bucket' ? bodyA : bodyB.label === 'bucket' ? bodyB : null;
        const peg = bodyA.label === 'peg' ? bodyA : bodyB.label === 'peg' ? bodyB : null;

        // Handle ball-peg collisions (for animation)
        if (ball && peg) {
          const pegId = `${Math.round(peg.position.x)}_${Math.round(peg.position.y)}`;
          animatingPegs.current.add(pegId);
          pegAnimationStartTimes.current.set(pegId, Date.now());
          setTimeout(() => {
            animatingPegs.current.delete(pegId);
            pegAnimationStartTimes.current.delete(pegId);
          }, 600);
        }

        // Handle ball-bucket collisions
        if (ball && bucket && !ballsToRemove.current.has(ball)) {
          const index = bucket.plugin.index;

          const contractData = ball.plugin.contractResult;
          const ballRisk = ball.plugin.risk as RiskLevel;

          const riskKey = ballRisk.toUpperCase() as 'GREEN' | 'YELLOW' | 'RED';
          onScoreRef.current(MULTIPLIERS[riskKey][index], index, contractData ? {
            ...contractData,
            risk: ballRisk
          } : null);

          // Play appropriate sound based on multiplier
          const finalMultiplier = contractData ? contractData.multiplier : MULTIPLIERS[ballRisk][index];
          if (finalMultiplier >= 1) {
            playSoundRef.current('/sounds/positive.wav');
          } else {
            playSoundRef.current('/sounds/negative.wav');
          }

          // Trigger bucket animation
          animatingBucket.current = index;
          animatingBucketStartTime.current = Date.now();
          setTimeout(() => {
            animatingBucket.current = null;
            animatingBucketStartTime.current = null;
          }, 600);

          ballsToRemove.current.add(ball);
        }
      });
    };
    Matter.Events.on(engine, 'collisionStart', collisionHandler);

    // Sub-stepped Game Loop
    const runner = setInterval(() => {
      const subStepDelta = PHYSICS.FIXED_TIME_STEP / PHYSICS.SUB_STEPS;
      for (let i = 0; i < PHYSICS.SUB_STEPS; i++) {
        Matter.Engine.update(engine, subStepDelta);
      }
      renderCanvas();
    }, PHYSICS.FIXED_TIME_STEP);

    // --- High Quality Rendering ---
    const renderCanvas = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !canvasRef.current) return;

      const dpr = window.devicePixelRatio || 1;

      // Calculate Bounding Box of content for Zooming
      const contentWidth = 820;
      const contentHeight = (BUCKET_Y - START_Y) + 140; // Extra space for visible chute

      const scale = Math.min(
        (dimensions.width * 0.92) / contentWidth,
        (dimensions.height * 0.92) / contentHeight
      );

      const worldCenterX = WORLD_WIDTH / 2;
      const worldCenterY = (START_Y + BUCKET_Y) / 2 - 10;

      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.save();

      // Sharpness Scaling
      ctx.scale(dpr, dpr);

      // CENTER CAMERA MATH
      ctx.translate(dimensions.width / 2, dimensions.height / 2);
      ctx.scale(scale, scale);

      ctx.translate(-worldCenterX, -worldCenterY);

      // DRAW BUCKETS
      const buckets = engine.world.bodies.filter(b => b.label === 'bucket');
      buckets.forEach((bucket) => {
        const idx = bucket.plugin.index;
        const riskKey = (selectedRiskLevel || 'YELLOW').toUpperCase() as RiskLevel;
        const multiplier = MULTIPLIERS[riskKey][idx];

        ctx.save();

        // Apply bounce/zoom animation if this bucket is animating
        if (animatingBucket.current === idx && animatingBucketStartTime.current) {
          // Create a smooth single bounce effect with easing
          const elapsed = Date.now() - animatingBucketStartTime.current;
          const progress = Math.min(elapsed / 600, 1); // 0 to 1 over 600ms

          // Smooth ease-out bounce using cubic easing
          const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
          const easedProgress = easeOutCubic(progress);

          // Single smooth bounce: scales up to 1.2 then back to 1.0
          const bounceAmount = Math.sin(easedProgress * Math.PI) * 0.2;
          const scaleFactor = 1 + bounceAmount;

          // Add subtle glow effect
          const glowIntensity = Math.sin(easedProgress * Math.PI); // 0 -> 1 -> 0
          ctx.shadowColor = multiplier >= 10 ? 'rgba(139, 20, 200, 0.8)' :
                           multiplier >= 2 ? 'rgba(6, 182, 212, 0.8)' :
                           'rgba(42, 107, 200, 0.8)';
          ctx.shadowBlur = 20 * glowIntensity;

          ctx.scale(scaleFactor, scaleFactor);
          ctx.translate(bucket.position.x * (1 - scaleFactor) / scaleFactor, bucket.position.y * (1 - scaleFactor) / scaleFactor);
        }

        const bW = 42;
        const bH = 45;

        // Create radial gradient for bucket background
        const gradient = ctx.createRadialGradient(
          bucket.position.x, bucket.position.y - bH/4,
          0,
          bucket.position.x, bucket.position.y,
          Math.max(bW, bH) / 2
        );

        if (multiplier >= 10) {
          // High multiplier - red/cyan gradient
          gradient.addColorStop(0, 'rgba(119, 20, 200, 0.9)');
          gradient.addColorStop(1, 'rgba(114, 11, 158, 0.7)');
        } else if (multiplier >= 2) {
          // Medium multiplier - cyan/blue gradient
          gradient.addColorStop(0, 'rgba(6, 182, 212, 0.8)');
          gradient.addColorStop(1, 'rgba(37, 99, 235, 0.6)');
        } else {
          // Low multiplier - blue gradient
          gradient.addColorStop(0, 'rgba(36, 126, 156, 0.8)');
          gradient.addColorStop(1, 'rgba(6, 182, 212, 0.5)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(bucket.position.x - bW/2, bucket.position.y - bH/2, bW, bH, 6);
        ctx.fill();

        // Add border (more prominent if animating)
        if (animatingBucket.current === idx && animatingBucketStartTime.current) {
          const elapsed = Date.now() - animatingBucketStartTime.current;
          const progress = Math.min(elapsed / 600, 1);
          const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
          const easedProgress = easeOutCubic(progress);
          const borderIntensity = Math.sin(easedProgress * Math.PI);

          ctx.strokeStyle = multiplier >= 10 ? 'rgba(200, 100, 255, 1)' :
                           multiplier >= 2 ? 'rgba(100, 220, 255, 1)' :
                           'rgba(100, 150, 255, 1)';
          ctx.lineWidth = 2 + (borderIntensity * 2); // Grows from 2px to 4px
          ctx.beginPath();
          ctx.roundRect(bucket.position.x - bW/2, bucket.position.y - bH/2, bW, bH, 6);
          ctx.stroke();
        }

        // Reset shadow for text
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 15px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${multiplier}x`, bucket.position.x, bucket.position.y);
        ctx.restore();
      });

      // DRAW SPAWN CHUTE
      ctx.save();
      const chuteWidth = 120; // Wider chute for visibility
      const chuteHeight = 30;
      const chuteY = -10; // Position above the pegs

      // Create gradient for chute background - dark shadows at top, lighter at bottom
      const chuteGradient = ctx.createLinearGradient(
        worldCenterX, chuteY,  // top center
        worldCenterX, chuteY + chuteHeight  // bottom center
      );
      // Match Plinko board background colors with inset effect
      chuteGradient.addColorStop(0, 'rgb(0, 0, 0)'); // Dark top
      chuteGradient.addColorStop(1, 'rgba(40, 40, 40, 0.7)'); // Lighter bottom

      ctx.fillStyle = chuteGradient;
      ctx.fillRect(worldCenterX - chuteWidth/2, chuteY, chuteWidth, chuteHeight);

      // Add inset border to match board styling
      ctx.strokeStyle = 'rgba(25, 27, 29, 0.31)';
      ctx.lineWidth = 1;
      ctx.strokeRect(worldCenterX - chuteWidth/2, chuteY, chuteWidth, chuteHeight);

      
      // Add inset shadow effect to match board
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      ctx.strokeRect(worldCenterX - chuteWidth/2, chuteY, chuteWidth, chuteHeight);
      ctx.shadowBlur = 0;


      ctx.restore();

      // DRAW PEGS
      ctx.fillStyle = "#FFFFFF";
      pegs.forEach(peg => {
        const pegId = `${Math.round(peg.position.x)}_${Math.round(peg.position.y)}`;
        const isAnimating = animatingPegs.current.has(pegId);

        ctx.save();

        // Apply animation effect if peg is being hit
        if (isAnimating) {
          const startTime = pegAnimationStartTimes.current.get(pegId) || Date.now();
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / 600, 1); // 600ms total animation time
          const fadeOut = 1 - (progress * 0.7); // Fade out to 30% intensity

          // Scale effect that fades out
          const scaleFactor = 1 + (0.3 * fadeOut); // From 1.3 down to 1.09
          ctx.scale(scaleFactor, scaleFactor);
          ctx.translate(peg.position.x * (1 - scaleFactor) / scaleFactor, peg.position.y * (1 - scaleFactor) / scaleFactor);

          // Color and glow that fade out
          const intensity = fadeOut;
          ctx.fillStyle = `rgba(255, 255, 255, ${intensity})`; // Yellow tint that fades
          ctx.shadowBlur = 12 * intensity;
          ctx.shadowColor = `rgba(255, 255, 255, ${intensity})`;
        } else {
          ctx.shadowBlur = 4;
          ctx.shadowColor = "rgba(0,0,0,0.5)";
        }

        ctx.beginPath();
        ctx.arc(peg.position.x, peg.position.y, PEG_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // DRAW BALLS
      const balls = engine.world.bodies.filter(b => b.label === 'ball');
      balls.forEach(ball => {
        ctx.save();
        // Create gradient based on risk level
        const gradient = ctx.createRadialGradient(
          ball.position.x - BALL_RADIUS * 0.3, ball.position.y - BALL_RADIUS * 0.3, 0,
          ball.position.x, ball.position.y, BALL_RADIUS
        );

        const riskLevel = ball.plugin.risk as RiskLevel || 'YELLOW';
        if (riskLevel === 'GREEN') {
          gradient.addColorStop(0, '#8CB93C'); // Light green center
          gradient.addColorStop(0.7, '#5A8C23'); // Main green color
          gradient.addColorStop(1, '#3D5A17'); // Dark green edge
        } else if (riskLevel === 'YELLOW') {
          gradient.addColorStop(0, '#60A5FA'); // Light blue center
          gradient.addColorStop(0.7, '#1E90FF'); // Main blue color
          gradient.addColorStop(1, '#1E40AF'); // Dark blue edge
        } else if (riskLevel === 'RED') {
          gradient.addColorStop(0, '#F87171'); // Light red center
          gradient.addColorStop(0.7, '#D32F2F'); // Main red color
          gradient.addColorStop(1, '#9A2020'); // Dark red edge
        }

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 5;
        ctx.shadowColor = "rgba(7, 57, 69, 0.74)";
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      ctx.restore();

      // Clear removed balls
      if (ballsToRemove.current.size > 0) {
        ballsToRemove.current.forEach(b => Matter.World.remove(engine.world, b));
        ballsToRemove.current.clear();
      }
    };

    return () => {
      clearInterval(runner);
      Matter.Events.off(engine, 'collisionStart', collisionHandler);
    };
  }, [dimensions, selectedRiskLevel]);

  // 3. Spawning Balls (Deterministic)
  useEffect(() => {
    if (!lastDrop || !engineRef.current) return;

    // Use a fixed start point relative to world center
    const isContractMode = !!lastDrop.contractResult;

    let spawnX: number;
    let initialVelX: number;

    // DEBUG: Log the state of all conditions
    console.log('🔍 Ball spawn debug:', {
      isContractMode,
      hasSeed: !!lastDrop.contractResult?.seed,
      seedDbLoaded: !!seedDatabaseRef.current,
      contractBucket: lastDrop.contractResult?.bucket,
      contractSeed: lastDrop.contractResult?.seed?.toString().slice(0, 20) + '...'
    });

    if (isContractMode && lastDrop.contractResult.seed && seedDatabaseRef.current) {
      // DETERMINISTIC MODE: Use pre-computed seed from database
      // This ensures the ball lands in the exact bucket the contract specified

      const contractSeed = lastDrop.contractResult.seed;
      const targetBucket = lastDrop.contractResult.bucket; // 0-indexed bucket from contract

      console.log(`🎲 Looking up seed for bucket ${targetBucket}...`);

      // Use contract seed to pick which pre-computed seed to use (deterministic selection)
      // Convert seed to number for modulo (handle BigInt if needed)
      let seedNum: number;
      try {
        seedNum = typeof contractSeed === 'bigint'
          ? Number(contractSeed % 50n)
          : Number(BigInt(contractSeed) % 50n);
      } catch (e) {
        console.error('❌ Failed to convert seed to number:', e);
        seedNum = Math.floor(Math.random() * 50);
      }

      // Look up the pre-computed seedAttempt that lands in this bucket
      // Physics is the same for all risk levels, so we use GREEN (only one in database)
      const bucketSeeds = seedDatabaseRef.current['GREEN']?.[targetBucket.toString()];

      console.log(`📊 Bucket ${targetBucket} has ${bucketSeeds?.length || 0} seeds available`);

      if (bucketSeeds && bucketSeeds.length > 0) {
        const seedIndex = Math.abs(seedNum) % bucketSeeds.length;
        const seedAttempt = bucketSeeds[seedIndex];

        // CRITICAL: Use the exact same seed string format as the generator
        const seedString = `bucket-${targetBucket}-attempt-${seedAttempt}`;
        const rng = seedrandom(seedString);

        // CRITICAL: Use the exact same spawn logic as the generator (50/50 binary, NO center)
        const gapOffset = PEG_SPACING_X / 2; // 24px - spawn in gaps between pegs
        const side = rng() > 0.5 ? 1 : -1; // 50% left, 50% right (matches generator exactly)
        spawnX = (WORLD_WIDTH / 2) + (side * gapOffset) + ((rng() - 0.5) * PHYSICS.SPAWN_RANGE_X);
        initialVelX = (rng() - 0.5) * PHYSICS.INITIAL_V_X_VARIANCE;

        console.log(`🎯 DETERMINISTIC DROP: bucket=${targetBucket}, seedIndex=${seedIndex}, seedAttempt=${seedAttempt}, seedString="${seedString}"`);
        console.log(`📍 Spawn position: x=${spawnX.toFixed(2)}, velX=${initialVelX.toFixed(4)}, side=${side}`);
      } else {
        // Fallback if bucket not in database (shouldn't happen)
        console.warn(`⚠️ No seeds found for bucket ${targetBucket}, using random`);
        const gapOffset = PEG_SPACING_X / 2;
        const side = Math.random() > 0.5 ? 1 : -1;
        spawnX = (WORLD_WIDTH / 2) + (side * gapOffset) + ((Math.random() - 0.5) * PHYSICS.SPAWN_RANGE_X);
        initialVelX = (Math.random() - 0.5) * PHYSICS.INITIAL_V_X_VARIANCE;
      }
    } else {
      // FREE PLAY MODE or seed DB not loaded yet
      if (isContractMode) {
        console.warn(`⚠️ Contract mode but seed DB not ready! seedDbLoaded=${!!seedDatabaseRef.current}`);
      }
      const gapOffset = PEG_SPACING_X / 2; // Spawn in gaps between pegs
      const side = Math.random() > 0.5 ? 1 : -1; // 50% left, 50% right
      spawnX = (WORLD_WIDTH / 2) + (side * gapOffset) + ((Math.random() - 0.5) * PHYSICS.SPAWN_RANGE_X);
      initialVelX = (Math.random() - 0.5) * PHYSICS.INITIAL_V_X_VARIANCE;
      console.log(`🎲 Random spawn: x=${spawnX.toFixed(2)}, velX=${initialVelX.toFixed(4)}`);
    }

    const ball = Matter.Bodies.circle(spawnX, 20, BALL_RADIUS, {
      density: PHYSICS.BALL_DENSITY, // CRITICAL: Must match generator (0.9)!
      restitution: PHYSICS.BALL_RESTITUTION,
      friction: PHYSICS.BALL_FRICTION,
      frictionAir: PHYSICS.BALL_FRICTION_AIR,
      label: 'ball',
      collisionFilter: { group: -1 }, // BALLS DO NOT HIT EACH OTHER
      plugin: {
        color: isContractMode ? "#FFD700" : "#4392F1", // Gold for real bets!
        // ATTACH THE DATA HERE:
        contractResult: lastDrop.contractResult,
        risk: lastDrop.risk
      }
    });

    Matter.Body.setVelocity(ball, {
      x: initialVelX,
      y: PHYSICS.INITIAL_V_Y
    });

    Matter.World.add(engineRef.current.world, ball);

    // Play drop sound
    playSound('/sounds/drop.wav');
  }, [lastDrop]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-transparent">
      <canvas ref={canvasRef} />

      {/* Sound Toggle Button */}
      <button
        onClick={handleSoundToggle}
        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-600/50 transition-all duration-200 backdrop-blur-sm z-10"
        title={internalSoundEnabled ? 'Disable Sound' : 'Enable Sound'}
      >
        {internalSoundEnabled ? (
          <svg className="w-4 h-4 text-cyan-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
        ) : (
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v1.79l2.48 2.25.02-.01zm-6.5 0c0 .83.25 1.59.67 2.24l.53-.53c-.25-.44-.4-.96-.4-1.71 0-.76.15-1.27.4-1.71l-.53-.53c-.42.65-.67 1.41-.67 2.24zm3.5-9.5l-7 7H3v6h4l7 7V2.5z"/>
          </svg>
        )}
      </button>
    </div>
  );
};

export default PlinkoGame;