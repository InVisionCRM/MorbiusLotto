/**
 * Shared avatar SVG / voxel canvas: **48×56** logical pixels everywhere.
 *
 * **v1 (`AvatarPreview`)** authors directly in this 48×56 grid (1 SVG unit = 1 viewBox unit).
 */

export const AVATAR_VIEWBOX_W = 48;
export const AVATAR_VIEWBOX_H = 56;

/** v1 procedural rects use this range (same as viewBox; no extra scale transform). */
export const AVATAR_V1_INNER_W = 48;
export const AVATAR_V1_INNER_H = 56;
export const AVATAR_V1_INNER_SCALE = 1;

/** @deprecated use AVATAR_V1_INNER_* */
export const AVATAR_INNER_W = AVATAR_V1_INNER_W;
/** @deprecated use AVATAR_V1_INNER_* */
export const AVATAR_INNER_H = AVATAR_V1_INNER_H;
/** @deprecated use AVATAR_V1_INNER_SCALE */
export const AVATAR_INNER_SCALE = AVATAR_V1_INNER_SCALE;

export const AVATAR_VIEWBOX = `0 0 ${AVATAR_VIEWBOX_W} ${AVATAR_VIEWBOX_H}` as const;

export const AVATAR_ASPECT_RATIO = `${AVATAR_VIEWBOX_W} / ${AVATAR_VIEWBOX_H}` as const;

/** Framer Motion transform-origin for v1 (inner coords = viewBox px). */
export function avatarMotionOrigin(innerX: number, innerY: number): string {
  return `${innerX * AVATAR_V1_INNER_SCALE}px ${innerY * AVATAR_V1_INNER_SCALE}px`;
}
