
export const PEG_RADIUS = 3;
export const BALL_RADIUS = 5;
export const ROWS = 15; 
export const BUCKET_HEIGHT = 15;
export const CHUTE_RADIUS = 6;

// Base colors for the UI
export const COLORS = {
  PEG: 'rgb(2, 19, 34)',
  GREEN: 'rgb(22, 102, 6)',
  YELLOW: 'rgb(246, 242, 16)',
  RED: 'rgb(255, 0, 0)',
  BG_START: 'rgb(6, 19, 22)',
  BG_END: 'rgb(0, 191, 165)',
  UI_ACCENT: 'rgb(87, 250, 37)',
  UI_PANEL: 'rgb(5, 50, 57)',
  BALL_GREEN: 'rgb(16, 136, 8)',
  BALL_YELLOW: 'rgb(255, 238, 0)',
  BALL_RED: 'rgb(239, 27, 27)',
};

// --- TUNABLE PHYSICS SETTINGS ---
export const PHYSICS = {
  GRAVITY: 1,               // Strength of downward pull (snappier)
  ENGINE_ITERATIONS: 9,      // Accuracy of simulation
  
  BALL_DENSITY: 0.5,          // Heavier ball
  BALL_RESTITUTION: 1.1,     // Lower bounciness for more realistic thuds
  BALL_FRICTION: 0.5,       // Very low sliding friction
  BALL_FRICTION_STATIC: 0.05, 
  BALL_FRICTION_AIR: 0.05,   // Minimal air resistance
  
  PEG_RESTITUTION: 2,       // Peg bounciness
  PEG_FRICTION: 0,         
  
  SPAWN_RANGE_X: 2,           // Narrower spread since it's "coming out of a hole"
  INITIAL_V_X_VARIANCE: 0.8,  
  INITIAL_V_Y: 0,             // Higher initial push to prevent snagging on the first peg
  
  COLLISION_JITTER: 1.5,    
  SLOP: 0,                  
};

export const MULTIPLIERS = {
  GREEN: [18, 3.2, 1.6, 1.3, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.3, 1.6, 3.2, 18],
  YELLOW: [55, 12, 5.6, 3.2, 1.6, 1, 0.7, 0.2, 0.7, 1, 1.6, 3.2, 5.6, 12, 55],
  RED: [353, 49, 14, 5.3, 2.1, 0.5, 0.2, 0, 0.2, 0.5, 2.1, 5.3, 14, 49, 353],
};
