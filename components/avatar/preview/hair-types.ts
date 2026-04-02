import type React from 'react';

export type HairShadeFn = (mix: number, opacity: number) => string;
export type HairSideShadeRenderer = (
  x: number,
  y: number,
  w: number,
  h: number,
) => React.ReactNode;
export type HairCapHighlightRenderer = (
  x: number,
  w: number,
  y?: number,
) => React.ReactNode;
export type HairTwinLocksRenderer = (
  locks: [number, number, number, number][],
  rxScale?: number,
) => React.ReactNode;
