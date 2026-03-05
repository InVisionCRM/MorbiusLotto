import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import Matter from 'matter-js';
import seedrandom from 'seedrandom';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 1000;
const ROWS = 16;
const PEG_SPACING_X = 48;
const PEG_SPACING_Y = 48;
const START_Y = 60;
const BUCKET_Y = 820; // Fixed bucket position
const PEG_RADIUS = 6;
const BALL_RADIUS = 15;

const PHYSICS = {
    GRAVITY: 1.6,
    ENGINE_ITERATIONS: 10,
    SUB_STEPS: 4,
    BALL_DENSITY: 0.9,
    BALL_RESTITUTION: 0.6,
    BALL_FRICTION: 0.005,
    BALL_FRICTION_AIR: 0.03,      // TUNED: Lowered to help edge hits
    PEG_RESTITUTION: 0.5,
    PEG_FRICTION: 0,
    FIXED_TIME_STEP: 16.666,
    SPAWN_RANGE_X: 5,             // TUNED: Wider start
    INITIAL_V_X_VARIANCE: 0.05,    // TUNED: More horizontal kick
    INITIAL_V_Y: 1,
};

export const MULTIPLIERS = {
    GREEN: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    YELLOW: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    RED: [1000, 120, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 120, 1000],
  };

if (!isMainThread) {
    const { riskLevel, dropsToRun, workerId } = workerData;
    const mults = MULTIPLIERS[riskLevel];
    const results = new Array(17).fill(0);
    let totalPayout = 0;

    const engine = Matter.Engine.create();
    engine.gravity.y = PHYSICS.GRAVITY;
    engine.positionIterations = PHYSICS.ENGINE_ITERATIONS;
    engine.velocityIterations = PHYSICS.ENGINE_ITERATIONS;

    let bottomRowStartX = 0;
    for (let r = 0; r < ROWS; r++) {
        const rowPegCount = r + 3;
        const rowWidth = (rowPegCount - 1) * PEG_SPACING_X;
        const startX = (WORLD_WIDTH - rowWidth) / 2;
        if (r === ROWS - 1) bottomRowStartX = startX;
        for (let c = 0; c < rowPegCount; c++) {
            Matter.World.add(engine.world, Matter.Bodies.circle(startX + c * PEG_SPACING_X, START_Y + r * PEG_SPACING_Y, PEG_RADIUS, {
                isStatic: true,
                restitution: PHYSICS.PEG_RESTITUTION,
                friction: 0
            }));
        }
    }

    // Create bucket collision bodies (same as main game)
    const bucketWidth = PEG_SPACING_X;
    for (let i = 0; i < 17; i++) {
        const x = bottomRowStartX + (i * PEG_SPACING_X) + (PEG_SPACING_X / 2);
        Matter.World.add(engine.world, Matter.Bodies.rectangle(x, BUCKET_Y, bucketWidth - 6, 50, {
            isStatic: true,
            isSensor: true,
            label: 'bucket',
            plugin: { index: i }
        }));
    }

    const bucketXCoords = Array.from({length: 17}, (_, i) => bottomRowStartX + (i * PEG_SPACING_X) + (PEG_SPACING_X / 2));

    // Track bucket hits via collision detection
    const processedBalls = new Set();
    Matter.Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;
            const ball = bodyA.label === 'ball' ? bodyA : (bodyB.label === 'ball' ? bodyB : null);
            const bucket = bodyA.label === 'bucket' ? bodyA : (bodyB.label === 'bucket' ? bodyB : null);

            if (ball && bucket && !processedBalls.has(ball.id)) {
                const bucketIndex = bucket.plugin.index;
                results[bucketIndex]++;
                totalPayout += mults[bucketIndex];
                processedBalls.add(ball.id);
            }
        });
    });

    const UPDATE_INTERVAL = 100; // Send update every 100 drops

    for (let i = 0; i < dropsToRun; i++) {
        const rng = seedrandom(`audit-${riskLevel}-${workerId}-${i}`);

        // --- THE FIX: GAP SPAWNING ---
        // Instead of spawning at 500 (on a peg), we spawn at 476 or 524 (the gaps)
        const gapOffset = PEG_SPACING_X / 2; // 24px
        const side = rng() > 0.5 ? 1 : -1;
        const spawnX = (WORLD_WIDTH / 2) + (side * gapOffset) + ((rng() - 0.5) * PHYSICS.SPAWN_RANGE_X);

        const ball = Matter.Bodies.circle(spawnX, 20, BALL_RADIUS, {
            density: PHYSICS.BALL_DENSITY,
            restitution: PHYSICS.BALL_RESTITUTION,
            frictionAir: PHYSICS.BALL_FRICTION_AIR,
            friction: PHYSICS.BALL_FRICTION,
            collisionFilter: { group: -1 },
            label: 'ball'
        });

        Matter.Body.setVelocity(ball, {
            x: (rng() - 0.5) * PHYSICS.INITIAL_V_X_VARIANCE,
            y: PHYSICS.INITIAL_V_Y
        });

        Matter.World.add(engine.world, ball);

        // Let physics run until ball hits bucket or falls below bucket level
        const subStepDelta = PHYSICS.FIXED_TIME_STEP / PHYSICS.SUB_STEPS;
        let safety = 0;
        let ballHitBucket = false;

        while (ball.position.y < BUCKET_Y + 100 && safety < 2000 && !ballHitBucket) {
            for (let s = 0; s < PHYSICS.SUB_STEPS; s++) {
                Matter.Engine.update(engine, subStepDelta);
                // Check if ball has been processed (hit a bucket)
                if (processedBalls.has(ball.id)) {
                    ballHitBucket = true;
                    break;
                }
            }
            safety++;
        }

        // If ball didn't hit any bucket, it counts as a miss (0 payout)
        if (!ballHitBucket) {
            // Ball missed all buckets - this is a loss (0 payout)
            totalPayout += 0; // No winnings for missed balls
        }

        Matter.World.remove(engine.world, ball);

        // Send periodic updates
        if ((i + 1) % UPDATE_INTERVAL === 0 || i === dropsToRun - 1) {
            parentPort.postMessage({
                results: [...results],
                totalPayout,
                dropsCompleted: i + 1,
                isComplete: i === dropsToRun - 1
            });
        }
    }

    // Cleanup collision listeners
    Matter.Events.off(engine, 'collisionStart');
}

if (isMainThread) {
    async function runFullAudit() {
        const TOTAL_DROPS = 100000;
        const NUM_CORES = os.cpus().length;
        const risks = ['GREEN', 'YELLOW', 'RED'];

        console.log(`\nPLINKO AUDIT - ${TOTAL_DROPS.toLocaleString()} drops per tier, ${NUM_CORES} workers\n`);

        for (const risk of risks) {
            console.log(`\n[${risk}] Starting...`);
            const startTime = Date.now();
            const dropsPerWorker = Math.floor(TOTAL_DROPS / NUM_CORES);
            const workerStates = new Array(NUM_CORES).fill(null).map(() => ({
                results: new Array(17).fill(0),
                totalWon: 0,
                dropsCompleted: 0
            }));

            const workers = [];
            for (let i = 0; i < NUM_CORES; i++) {
                const workerId = i;
                const worker = new Worker(__filename, {
                    workerData: { riskLevel: risk, dropsToRun: dropsPerWorker, workerId }
                });

                worker.on('message', (msg) => {
                    workerStates[workerId] = {
                        results: msg.results,
                        totalWon: msg.totalPayout,
                        dropsCompleted: msg.dropsCompleted
                    };

                    const aggregated = { results: new Array(17).fill(0), totalWon: 0 };
                    let totalDropsCompleted = 0;

                    workerStates.forEach(state => {
                        state.results.forEach((count, idx) => aggregated.results[idx] += count);
                        aggregated.totalWon += state.totalWon;
                        totalDropsCompleted += state.dropsCompleted;
                    });

                    const rtp = totalDropsCompleted > 0 ? (aggregated.totalWon / totalDropsCompleted) * 100 : 0;
                    const progress = (totalDropsCompleted / TOTAL_DROPS) * 100;

                    process.stdout.write(`\r[${risk}] ${progress.toFixed(1)}% | ${totalDropsCompleted.toLocaleString()}/${TOTAL_DROPS.toLocaleString()} | RTP: ${rtp.toFixed(2)}% | Buckets: ${aggregated.results.join(',')}`);
                });

                workers.push(new Promise((resolve) => {
                    worker.on('message', (msg) => {
                        if (msg.isComplete) {
                            resolve(msg);
                        }
                    });
                }));
            }

            const finalResults = await Promise.all(workers);

            const finalAggregated = { results: new Array(17).fill(0), totalWon: 0 };
            finalResults.forEach(res => {
                res.results.forEach((count, idx) => finalAggregated.results[idx] += count);
                finalAggregated.totalWon += res.totalPayout;
            });

            const elapsed = Date.now() - startTime;
            const rtp = (finalAggregated.totalWon / TOTAL_DROPS) * 100;

            console.log(`\n[${risk}] Complete in ${(elapsed / 1000).toFixed(2)}s | RTP: ${rtp.toFixed(2)}% | House Edge: ${(100 - rtp).toFixed(2)}%`);
            console.log(`Bucket hits: ${finalAggregated.results.join(', ')}`);
        }

        console.log(`\nAll simulations complete!\n`);
    }
    runFullAudit();
}