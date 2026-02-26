// Shared PLINKO constants used by both frontend and backend
// This ensures perfect synchronization between simulation and seed generation

export interface PlinkoPhysics {
  GRAVITY: number;
  ENGINE_ITERATIONS: number;
  SUB_STEPS: number;
  BALL_DENSITY: number;
  BALL_RESTITUTION: number;
  BALL_FRICTION: number;
  BALL_FRICTION_AIR: number;
  PEG_RESTITUTION: number;
  PEG_FRICTION: number;
  FIXED_TIME_STEP: number;
  SPAWN_RANGE_X: number;
  INITIAL_V_X_VARIANCE: number;
  INITIAL_V_Y: number;
}

export interface PlinkoMultipliers {
  GREEN: number[];
  YELLOW: number[];
  RED: number[];
}

export interface PlinkoBoardDimensions {
  REFERENCE_HEIGHT: number;
  TARGET_ASPECT_RATIO: number;
  CONTAINER_WIDTH_PERCENT: number;
  CONTAINER_HEIGHT_PERCENT: number;
  MIN_SIZE: number;
  MAX_WIDTH: number;
  MAX_HEIGHT: number;
  MIN_VERTICAL_OFFSET: number;
  BUCKET_HEIGHT: number;
}

export interface PlinkoConstants {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  ROWS: number;
  PEG_SPACING_X: number;
  PEG_SPACING_Y: number;
  START_Y: number;
  BUCKET_Y: number;
  PEG_RADIUS: number;
  BALL_RADIUS: number;
  PHYSICS: PlinkoPhysics;
  MULTIPLIERS: PlinkoMultipliers;
  RISK_LEVEL: { LOW: number; MEDIUM: number; HIGH: number };
  RISK_LEVEL_MAP: { green: number; yellow: number; red: number };
  RISK_NAMES: string[];
  BOARD_DIMENSIONS: PlinkoBoardDimensions;
}

const PLINKO_CONSTANTS: PlinkoConstants = {
  // World dimensions
  WORLD_WIDTH: 1000,
  WORLD_HEIGHT: 1000,
  ROWS: 16,

  // Spacing and positioning
  PEG_SPACING_X: 48,
  PEG_SPACING_Y: 48,
  START_Y: 60,
  BUCKET_Y: 820,

  // Object sizes
  PEG_RADIUS: 6,
  BALL_RADIUS: 15,

  // Physics parameters (CRITICAL - must match exactly across all files)
  PHYSICS: {
    GRAVITY: 1.6,
    ENGINE_ITERATIONS: 10,
    SUB_STEPS: 4, // CRITICAL for determinism
    BALL_DENSITY: 0.9,
    BALL_RESTITUTION: 0.6,
    BALL_FRICTION: 0.005,
    BALL_FRICTION_AIR: 0.03,
    PEG_RESTITUTION: 0.5,
    PEG_FRICTION: 0,
    FIXED_TIME_STEP: 16.666,
    SPAWN_RANGE_X: 5,
    INITIAL_V_X_VARIANCE: 0.05,
    INITIAL_V_Y: 1,
  },

  // Multipliers for each risk level (matches contract exactly)
  // Contract stores in basis points (100 = 1x), frontend uses decimals
  MULTIPLIERS: {
    GREEN: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.4, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    YELLOW: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.2, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    RED: [200, 120, 25, 10, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 10, 25, 120, 200],
  },

  // Risk level mappings
  RISK_LEVEL: { LOW: 0, MEDIUM: 1, HIGH: 2 },
  RISK_LEVEL_MAP: { green: 0, yellow: 1, red: 2 },
  RISK_NAMES: ['GREEN', 'YELLOW', 'RED'],

  // Backend-specific constants for seed generation
  BOARD_DIMENSIONS: {
    REFERENCE_HEIGHT: 1000,
    TARGET_ASPECT_RATIO: 0.8,
    CONTAINER_WIDTH_PERCENT: 0.85,
    CONTAINER_HEIGHT_PERCENT: 0.90,
    MIN_SIZE: 200,
    MAX_WIDTH: 1000,
    MAX_HEIGHT: 1000,
    MIN_VERTICAL_OFFSET: 10,
    BUCKET_HEIGHT: 50,
  },
};

export default PLINKO_CONSTANTS;