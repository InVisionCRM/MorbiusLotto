/**
 * Plinko Seed Database Generator
 *
 * Pre-calculates seeds for all bucket/risk combinations using real Matter.js physics.
 * Run this ONCE to generate seedDatabase.json which the frontend will use.
 *
 * This takes several hours to complete (finding 100+ seeds per bucket).
 * Progress is saved incrementally so you can stop/resume.
 *
 * Usage: node contracts/scripts/generate-plinko-seeds.js
 */

import Matter from 'matter-js';
import seedrandom from 'seedrandom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import shared constants (MUST match frontend exactly for determinism!)
import CONSTANTS from '../../lib/plinko-constants-backend.js';

const CollisionLabel = {
  BALL: 'ball',
  PEG: 'peg',
  BUCKET: 'bucket',
};

// Configuration
const SEEDS_PER_BUCKET = 50; // How many seeds to find for each bucket
const MAX_SEED_ATTEMPTS = 500000; // Max attempts before giving up on a bucket
const OUTPUT_FILE = path.join(__dirname, '../../public/seedDatabase.json');

// Simulated board configuration (matches frontend)
const BOARD_CONFIG = {
  boardWidth: CONSTANTS.WORLD_WIDTH,   // 1000px world
  boardHeight: CONSTANTS.WORLD_HEIGHT, // 1000px world
  boardOffsetX: 0,
  startY: 0,
};

// Use fixed spacing (matches live game exactly)
const pegGapX = CONSTANTS.PEG_SPACING_X;
const pegGapY = CONSTANTS.PEG_SPACING_Y;
const scaleFactor = 1.0; // No scaling needed with fixed world size
const scaledPegRadius = CONSTANTS.PEG_RADIUS;
const scaledBallRadius = CONSTANTS.BALL_RADIUS;

// Match the game's ball spawn Y position exactly
BOARD_CONFIG.dropY = 20;

/**
 * Find a single seed that produces the target bucket using real physics simulation
 */
function findSeedForBucket(targetBucket, riskLevel, startAttempt = 0) {
  for (let seedAttempt = startAttempt; seedAttempt < MAX_SEED_ATTEMPTS; seedAttempt++) {
    const rng = seedrandom(`bucket-${targetBucket}-attempt-${seedAttempt}`);

    // Create headless physics engine
    const testEngine = Matter.Engine.create({
      gravity: { x: 0, y: CONSTANTS.PHYSICS.GRAVITY },
      positionIterations: CONSTANTS.PHYSICS.ENGINE_ITERATIONS,
      velocityIterations: CONSTANTS.PHYSICS.ENGINE_ITERATIONS,
    });

    // Add world bounds to prevent balls from falling outside
    const bounds = [
      Matter.Bodies.rectangle(CONSTANTS.WORLD_WIDTH / 2, -10, CONSTANTS.WORLD_WIDTH, 20, { isStatic: true }), // Top
      Matter.Bodies.rectangle(-10, CONSTANTS.WORLD_HEIGHT / 2, 20, CONSTANTS.WORLD_HEIGHT, { isStatic: true }), // Left
      Matter.Bodies.rectangle(CONSTANTS.WORLD_WIDTH + 10, CONSTANTS.WORLD_HEIGHT / 2, 20, CONSTANTS.WORLD_HEIGHT, { isStatic: true }), // Right
      Matter.Bodies.rectangle(CONSTANTS.WORLD_WIDTH / 2, CONSTANTS.WORLD_HEIGHT + 10, CONSTANTS.WORLD_WIDTH, 20, { isStatic: true }), // Bottom
    ];
    Matter.World.add(testEngine.world, bounds);

    // Build peg structure with absolute geometry
    const pegs = [];
    for (let r = 0; r < CONSTANTS.ROWS; r++) {
      const rowPegCount = r + 3; // Row 0: 3 pegs, Row 15: 18 pegs
      const rowWidth = (rowPegCount - 1) * CONSTANTS.PEG_SPACING_X;
      const startX = (CONSTANTS.WORLD_WIDTH - rowWidth) / 2; // Center in 800px world
      const rowY = CONSTANTS.START_Y + (r * CONSTANTS.PEG_SPACING_Y);

      for (let c = 0; c < rowPegCount; c++) {
        const x = startX + c * pegGapX;
        pegs.push(Matter.Bodies.circle(x, rowY, scaledPegRadius, {
          isStatic: true,
          restitution: CONSTANTS.PHYSICS.PEG_RESTITUTION,
          friction: 0,
          label: CollisionLabel.PEG,
        }));
      }
    }
    Matter.World.add(testEngine.world, pegs);

    // Create bucket sensors with fixed spacing (MUST match simulate-plinko.js exactly)
    const bucketCount = 17;  // 17 buckets for 16-row board
    const bucketWidth = pegGapX;
    const tierHeight = 50; // Bucket height (matches frontend)

    // Calculate bottomRowStartX the same way as simulate-plinko.js
    let bottomRowStartX = 0;
    for (let r = 0; r < CONSTANTS.ROWS; r++) {
      const rowPegCount = r + 3;
      const rowWidth = (rowPegCount - 1) * CONSTANTS.PEG_SPACING_X;
      const startX = (CONSTANTS.WORLD_WIDTH - rowWidth) / 2;
      if (r === CONSTANTS.ROWS - 1) bottomRowStartX = startX;
    }

    for (let i = 0; i < bucketCount; i++) {
      // Match simulate-plinko.js bucket positioning exactly
      const x = bottomRowStartX + (i * CONSTANTS.PEG_SPACING_X) + (CONSTANTS.PEG_SPACING_X / 2);
      const sensor = Matter.Bodies.rectangle(x, CONSTANTS.BUCKET_Y, bucketWidth - 6, tierHeight, {
        isStatic: true,
        isSensor: true,
        label: CollisionLabel.BUCKET,
        plugin: { index: i },
      });
      Matter.World.add(testEngine.world, sensor);
    }

    // Create ball with seeded random values
    // --- THE FIX: GAP SPAWNING ---
    // Instead of spawning at 500 (on a peg), we spawn at 476 or 524 (the gaps)
    const gapOffset = CONSTANTS.PEG_SPACING_X / 2; // 24px
    const side = rng() > 0.5 ? 1 : -1;
    const spawnX = (CONSTANTS.WORLD_WIDTH / 2) + (side * gapOffset) + ((rng() - 0.5) * CONSTANTS.PHYSICS.SPAWN_RANGE_X);
    const initialVelX = (rng() - 0.5) * CONSTANTS.PHYSICS.INITIAL_V_X_VARIANCE;

    const testBall = Matter.Bodies.circle(spawnX, 20, scaledBallRadius, {
      density: CONSTANTS.PHYSICS.BALL_DENSITY,
      restitution: CONSTANTS.PHYSICS.BALL_RESTITUTION,
      friction: CONSTANTS.PHYSICS.BALL_FRICTION,
      frictionAir: CONSTANTS.PHYSICS.BALL_FRICTION_AIR,
      label: CollisionLabel.BALL,
      collisionFilter: { group: -1 }, // BALLS DO NOT HIT EACH OTHER
    });

    Matter.Body.setVelocity(testBall, { x: initialVelX, y: CONSTANTS.PHYSICS.INITIAL_V_Y });
    Matter.World.add(testEngine.world, testBall);

    // Run simulation and detect bucket collision
    let landedBucket = null;
    let simulationSteps = 0;
    const maxSteps = 500;

    Matter.Events.on(testEngine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const ball = bodyA.label === CollisionLabel.BALL ? bodyA :
                    (bodyB.label === CollisionLabel.BALL ? bodyB : null);
        const bucket = bodyA.label === CollisionLabel.BUCKET ? bodyA :
                      (bodyB.label === CollisionLabel.BUCKET ? bodyB : null);

        // Match simulate-plinko.js - no risk level check needed
        if (ball && bucket && landedBucket === null) {
          landedBucket = bucket.plugin.index;
        }
      });
    });

    // Simulate physics steps with sub-stepping (matches game exactly)
    const fixedTimeStep = CONSTANTS.PHYSICS.FIXED_TIME_STEP;
    const subSteps = CONSTANTS.PHYSICS.SUB_STEPS;

    while (landedBucket === null && simulationSteps < maxSteps) {
      // Run the engine multiple times at 1/subSteps speed per frame (matches game)
      for (let i = 0; i < subSteps; i++) {
        Matter.Engine.update(testEngine, fixedTimeStep / subSteps);
      }
      simulationSteps++;
    }

    // Clean up
    Matter.Engine.clear(testEngine);

    // Check if this seed produced the target bucket
    if (landedBucket === targetBucket) {
      return seedAttempt;
    }
  }

  return null; // Could not find seed
}

/**
 * Load existing progress from file if it exists
 */
function loadProgress() {
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      console.log('📂 Loaded existing progress from', OUTPUT_FILE);

      // Ensure the database has the correct structure
      if (!data.GREEN) {
        data.GREEN = {};
      }

      // Initialize bucket arrays if they don't exist
      for (let bucket = 0; bucket < 17; bucket++) {
        if (!data.GREEN[bucket]) {
          data.GREEN[bucket] = [];
        }
      }

      return data;
    } catch (err) {
      console.warn('⚠️  Could not load existing file, starting fresh:', err.message);
    }
  }
  return { GREEN: {} };
}

/**
 * Save progress to file
 */
function saveProgress(database) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(database, null, 2));
  console.log('💾 Progress saved to', OUTPUT_FILE);
}

/**
 * Main generation function
 */
async function generateSeedDatabase() {
  console.log('🎰 Plinko Seed Database Generator');
  console.log('=================================\n');
  console.log(`Target: ${SEEDS_PER_BUCKET} seeds per bucket`);
  console.log(`Total combinations: 17 buckets × 1 risk level = 17`);
  console.log(`Total seeds to find: ${SEEDS_PER_BUCKET * 17 * 1} = ${SEEDS_PER_BUCKET * 17}`);
  console.log(`Output: ${OUTPUT_FILE}\n`);
  console.log('⚠️  This will take several hours. Progress is saved incrementally.\n');

  const database = loadProgress();
  console.log('Database structure after loading:', JSON.stringify(database, null, 2));

  const riskLevels = ['GREEN'];

  let totalFound = 0;
  let totalTarget = SEEDS_PER_BUCKET * 17 * 1;

  for (const risk of riskLevels) {
    console.log(`\n🎯 Processing ${risk} risk level...`);

    for (let bucket = 0; bucket < 17; bucket++) {
      // Initialize bucket array if it doesn't exist
      if (!database[risk][bucket]) {
        database[risk][bucket] = [];
      }

      const existing = database[risk][bucket].length;
      const needed = SEEDS_PER_BUCKET - existing;

      if (needed <= 0) {
        console.log(`  ✅ Bucket ${bucket}: Already complete (${existing}/${SEEDS_PER_BUCKET})`);
        totalFound += existing;
        continue;
      }

      console.log(`  🔍 Bucket ${bucket}: Finding ${needed} more seeds (${existing} existing)...`);

      let found = 0;
      let lastAttempt = 0;

      while (found < needed) {
        const seed = findSeedForBucket(bucket, risk, lastAttempt);

        if (seed === null) {
          console.log(`    ⚠️  Could not find more seeds for bucket ${bucket} after ${MAX_SEED_ATTEMPTS} attempts`);
          break;
        }

        database[risk][bucket].push(seed);
        found++;
        totalFound++;
        lastAttempt = seed + 1;

        // Progress update every 10 seeds
        if (found % 10 === 0) {
          const progress = ((totalFound / totalTarget) * 100).toFixed(1);
          console.log(`    Found ${existing + found}/${SEEDS_PER_BUCKET} (${progress}% overall)`);
          saveProgress(database); // Save incrementally
        }
      }

      console.log(`  ✅ Bucket ${bucket}: Complete (${database[risk][bucket].length}/${SEEDS_PER_BUCKET})`);
      saveProgress(database); // Save after each bucket
    }
  }

  // Final save
  saveProgress(database);

  console.log('\n✨ Seed database generation complete!');
  console.log(`📊 Total seeds found: ${totalFound}/${totalTarget}`);
  console.log(`📁 Database saved to: ${OUTPUT_FILE}`);
  console.log('\n🎮 Frontend can now use this database for instant seed lookup!');
}

// Run the generator
generateSeedDatabase().catch((err) => {
  console.error('❌ Error generating seed database:', err);
  process.exit(1);
});
