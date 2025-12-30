export type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

export interface GameState {
  balance: number;
  ballCount: number;
}

export enum CollisionLabel {
  BALL = 'BALL',
  PEG = 'PEG',
  BUCKET = 'BUCKET'
}

export interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}
