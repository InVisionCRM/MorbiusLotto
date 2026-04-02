import type { AvatarConfig } from '@/lib/websocket-client';

export type FaceShapeOffsets = {
  eyes: { y: number; x: number };
  nose: { y: number };
  mouth: { y: number };
  ears: { x: number; y: number };
  head: { y: number };
};

export function getFaceShapeOffsets(faceShape: AvatarConfig['faceShape']): FaceShapeOffsets {
  switch (faceShape) {
    // Ears tuned for small shell geometry: less lateral nudge than old 8x6 slabs.
    case 'Round': return { eyes: { y: 1, x: 0 }, nose: { y: 1 }, mouth: { y: 1 }, ears: { x: 0.45, y: 0.65 }, head: { y: 0 } };
    case 'Oval': return { eyes: { y: 1, x: 0 }, nose: { y: 2 }, mouth: { y: 3 }, ears: { x: 0, y: 0.85 }, head: { y: -2 } };
    case 'Heart': return { eyes: { y: -1, x: 1 }, nose: { y: 0 }, mouth: { y: 1 }, ears: { y: -0.65, x: 0.65 }, head: { y: 0 } };
    case 'Diamond': return { eyes: { y: 0, x: -1 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: -0.65, y: 0 }, head: { y: 0 } };
    case 'Triangle': return { eyes: { y: 2, x: -1 }, nose: { y: 2 }, mouth: { y: 2 }, ears: { y: 1.65, x: -0.65 }, head: { y: 0 } };
    case 'Inverted Triangle': return { eyes: { y: -2, x: 1 }, nose: { y: -1 }, mouth: { y: -1 }, ears: { y: -1.65, x: 0.65 }, head: { y: 0 } };
    case 'Long': return { eyes: { y: -1, x: 0 }, nose: { y: 1 }, mouth: { y: 3 }, ears: { y: 0.4, x: 0 }, head: { y: -2 } };
    case 'Wide': return { eyes: { x: 2, y: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: 0.85, y: 0.15 }, head: { y: 2 } };
    case 'Slim': return { eyes: { x: -2, y: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: -0.85, y: 0.15 }, head: { y: 0 } };
    default: return { eyes: { y: 0, x: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: 0, y: 0 }, head: { y: 0 } };
  }
}
