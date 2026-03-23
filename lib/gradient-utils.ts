/**
 * Gradient utilities shared between AvatarPreview (v1 SVG), AvatarControls, GradientBuilder, and AdminCosmeticsTab.
 *
 * Gradient values are stored as compact JSON strings (no spaces, stable key order).
 * Always use serializeGradient() to produce the string — never JSON.stringify directly —
 * so that exact-match DB lookups remain consistent.
 */

export interface GradientStop {
  color: string;   // hex, e.g. "#ff6b6b"
  offset: number;  // 0–1
  opacity: number; // 0–1
}

export interface GradientDef {
  type: 'linearGradient';
  angle: number;        // degrees, CSS convention: 0 = bottom→top, 90 = left→right
  stops: GradientStop[];
}

/** Canonical serialization — always same key order, no spaces. */
export function serializeGradient(def: GradientDef): string {
  return JSON.stringify({
    type: def.type,
    angle: def.angle,
    stops: def.stops.map(s => ({ color: s.color, offset: s.offset, opacity: s.opacity })),
  });
}

/** Returns null if the value is not a valid gradient JSON string. */
export function parseGradient(value: string): GradientDef | null {
  if (!value.startsWith('{')) return null;
  try {
    const obj = JSON.parse(value);
    if (
      obj.type === 'linearGradient' &&
      typeof obj.angle === 'number' &&
      Array.isArray(obj.stops) &&
      obj.stops.length >= 1
    ) {
      return obj as GradientDef;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/**
 * CSS `linear-gradient(...)` string for previews (admin catalog cards, etc.).
 * Stop opacity is applied via 8-digit hex when the stop color is `#RRGGBB`.
 */
export function gradientDefToCssLinearBackground(def: GradientDef): string {
  const parts = def.stops.map((s) => {
    let c = s.color.trim();
    const op = Math.min(1, Math.max(0, s.opacity));
    if (c.startsWith('#') && c.length === 7 && op < 1) {
      const a = Math.round(op * 255)
        .toString(16)
        .padStart(2, '0');
      c = `${c}${a}`;
    }
    return `${c} ${Math.round(s.offset * 100)}%`;
  });
  return `linear-gradient(${def.angle}deg, ${parts.join(', ')})`;
}

/**
 * Convert a CSS-convention angle (degrees) to SVG linearGradient x1/y1/x2/y2.
 * CSS 0° = bottom→top, 90° = left→right (clockwise from top).
 * SVG uses a coordinate space where 0,0 is top-left.
 */
export function angleToSvgCoords(angle: number): {
  x1: string; y1: string; x2: string; y2: string;
} {
  // Convert CSS gradient angle to math angle (CCW from east)
  const rad = ((90 - angle) * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = -Math.sin(rad); // SVG y-axis is inverted

  // Map [-1,1] to percentage endpoints
  const x1 = x >= 0 ? '0%' : `${Math.round(-x * 100)}%`;
  const x2 = x >= 0 ? `${Math.round(x * 100)}%` : '0%';
  const y1 = y >= 0 ? '0%' : `${Math.round(-y * 100)}%`;
  const y2 = y >= 0 ? `${Math.round(y * 100)}%` : '0%';

  return { x1, y1, x2, y2 };
}

/**
 * Resolve a color field value into a fill string and optional gradient definition.
 * - Plain hex / url(#pattern) → fill is the value as-is, gradientDef is null
 * - Gradient JSON → fill is `url(#${id})`, gradientDef is the parsed object
 */
export function resolveColorValue(
  value: string,
  id: string,
): { fill: string; gradientDef: GradientDef | null } {
  const gradientDef = parseGradient(value);
  if (gradientDef) {
    return { fill: `url(#${id})`, gradientDef };
  }
  return { fill: value, gradientDef: null };
}

/** A sensible two-stop default gradient to start with. */
export const DEFAULT_GRADIENT: GradientDef = {
  type: 'linearGradient',
  angle: 135,
  stops: [
    { color: '#6366f1', offset: 0, opacity: 1 },
    { color: '#ec4899', offset: 1, opacity: 1 },
  ],
};
