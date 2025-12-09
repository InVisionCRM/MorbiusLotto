export interface BallData {
  id: number;
  label: string;
  colorType: 'white' | 'red';
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // Rotation angle for text
  vAngle: number; // Angular velocity
  state: 'idle' | 'mixing' | 'sucked' | 'drawn';
}

export interface DrawResult {
  whiteBalls: number[];
  timestamp: number;
}

export enum DrawState {
  IDLE = 'IDLE',
  GENERATING_AI = 'GENERATING_AI',
  MIXING = 'MIXING',
  DRAWING = 'DRAWING',
  COMPLETED = 'COMPLETED',
}

export interface MachineConfig {
  ballCount: number; // 30 balls
  drawCount: number; // 6 numbers
}

