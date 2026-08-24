/**
 * table-layers.ts — a table built from parts instead of painted as one picture.
 *
 * Until now a table's art was a single field: `table.image`, one bitmap
 * cover-fitted across the whole board. That's fine for a picture somebody drew,
 * but it means every variation is a new picture — you can't restain the rail or
 * change the felt without commissioning art.
 *
 * A composed table is a stack of layers instead. Each layer names a KIND, and
 * the renderer knows how to draw each kind from a handful of numbers and
 * colours. Swapping the felt or the rail is one field, and nothing has to be
 * drawn. Layers with an `image` still work, so a bitmap is just one more kind
 * of layer rather than the only option.
 *
 * `table.image` is untouched and still wins when no layers are present, so
 * every table saved before this existed renders exactly as it did.
 *
 * Coordinates: layers are drawn in the same box the old single image occupied,
 * so seat and card coordinates are unaffected. The room's `tiltDeg` leans the
 * TABLE BODY only — the play surface stays flat against the screen, because
 * tilting it would move every seat out from under its cards.
 */

/** Where a layer sits in the stack; the renderer draws in this order. */
export type TableLayerKind =
  | 'scene'     // the room behind the table
  | 'surface'   // the felt itself
  | 'grain'     // cloth texture over the felt
  | 'markings'  // printed arcs, legends and betting spots
  | 'rail'      // the padded surround
  | 'seam'      // stitching that follows the rail
  | 'trim'      // the hard line where rail meets felt
  | 'sticker'   // a decal placed on the cloth
  | 'image'     // an arbitrary bitmap, e.g. an uploaded backdrop
  | 'lighting'; // the pass that seats everything in one light

export interface TableLayerBase {
  kind: TableLayerKind;
  /** Off by default nowhere — a layer is drawn unless this is explicitly false. */
  enabled?: boolean;
  /** 0–1. Applied on top of whatever the kind draws. */
  opacity?: number;
  /** Any CSS blend mode; the renderer passes it straight through. */
  blend?: string;
}

export interface SceneLayer extends TableLayerBase {
  kind: 'scene';
  /** Back wall, floor-to-ceiling. */
  from: string;
  to: string;
  /** Warm/cool points of light behind the table, as x%/y%/size/colour. */
  bokeh?: { x: number; y: number; r: number; color: string }[];
  /** Draws a hanging fitting and the cone of light under it. */
  lamp?: boolean;
}

export interface SurfaceLayer extends TableLayerBase {
  kind: 'surface';
  /** Centre and edge of the felt's radial shading. */
  from: string;
  to: string;
  /** Deepest tone at the very edge; omit to use `to`. */
  edge?: string;
}

export interface GrainLayer extends TableLayerBase {
  kind: 'grain';
  /** Higher is finer. Feeds feTurbulence's baseFrequency. */
  scale?: number;
}

export interface MarkingsLayer extends TableLayerBase {
  kind: 'markings';
  color: string;
  /** Printed above the betting spots. */
  legend?: string;
  subLegend?: string;
  /** Betting spots, as percentages of the felt. */
  spots?: { x: number; y: number }[];
  arc?: boolean;
}

export interface RailLayer extends TableLayerBase {
  kind: 'rail';
  from: string;
  to: string;
  /** Rail thickness as a percentage of the table's width. */
  width?: number;
  /** Sheen along the inner edge, where the light catches the padding. */
  sheen?: string;
}

export interface SeamLayer extends TableLayerBase {
  kind: 'seam';
  color: string;
  dashed?: boolean;
}

export interface TrimLayer extends TableLayerBase {
  kind: 'trim';
  color: string;
  /** Thickness in px; trim is a hard line, so it doesn't scale with the table. */
  thickness?: number;
  glow?: boolean;
}

/**
 * A decal on the cloth — the layer the vision board called out as the one
 * users would actually add themselves.
 *
 * Text and image are ONE kind rather than two, because everything that makes a
 * sticker a sticker — where it sits, how far it's turned, how big it is — is
 * shared, and only the content differs. `text` and `src` are mutually
 * exclusive; the renderer draws whichever is present and skips a layer with
 * neither.
 *
 * Position is a percentage of the FELT, not of the whole board, so a decal
 * stays put on the cloth when the rail thickness changes. Stickers are drawn
 * after the trim and before the lighting, so the same overhead light falls
 * across them — a decal lit differently from the felt it's stuck to reads as a
 * sprite floating above the table.
 */
export interface StickerLayer extends TableLayerBase {
  kind: 'sticker';
  /** Percentage of the felt, measured to the sticker's centre. */
  x: number;
  y: number;
  /** Degrees. A decal applied by hand is never quite straight. */
  rotate?: number;
  /**
   * Text decals: font size in cqw, so it tracks the table rather than the
   * viewport. Image decals: width as a percentage of the felt.
   */
  size?: number;
  /** A lettered decal — the board's "★ MORB" / "HIGH ROLLER" / "369". */
  text?: string;
  /** An uploaded decal. Set together with `stickerId` when it came from the library. */
  src?: string;
  /**
   * The library row this came from, when it did. Kept so a table can be
   * re-checked against moderation later: a decal whose sticker was since
   * rejected can be found without diffing image bytes.
   */
  stickerId?: string;
  color?: string;
  /** Neon treatment from direction 03 — a glow in the sticker's own colour. */
  glow?: boolean;
}

export interface ImageLayer extends TableLayerBase {
  kind: 'image';
  src: string;
  /** Defaults to cover, matching how `table.image` has always been drawn. */
  fit?: 'cover' | 'contain';
}

export interface LightingLayer extends TableLayerBase {
  kind: 'lighting';
  /** Overhead pool of light: colour and how far it reaches. */
  key?: string;
  keySpread?: number;
  /** Darkening toward the edges. */
  vignette?: number;
}

export type TableLayer =
  | SceneLayer | SurfaceLayer | GrainLayer | MarkingsLayer
  | RailLayer | SeamLayer | TrimLayer | StickerLayer | ImageLayer | LightingLayer;

/**
 * The shape of the table body. A blackjack table is a "D": nearly straight
 * along the dealer's edge, deeply round where the players sit. Expressed as a
 * border-radius so every ring drawn against it follows the same curve.
 */
export const TABLE_RADIUS = '7% 7% 46% 46% / 5% 5% 62% 62%';
export const TABLE_RADIUS_INNER = '5% 5% 45% 45% / 5% 5% 61% 61%';

/** Stock five-seat betting spots, as percentages of the felt. */
export const STOCK_SPOTS = [
  { x: 17, y: 64 }, { x: 33, y: 72 }, { x: 50, y: 75 }, { x: 67, y: 72 }, { x: 83, y: 64 },
];

/**
 * "Table in a room" — the composition picked off the vision board.
 *
 * Note what this does NOT do: it doesn't tilt the play surface. The board sits
 * in a room and the rail catches the lamp, but the felt stays flat to the
 * screen so every existing seat coordinate still lands where it did.
 */
export const ROOM_COMPOSITION: TableLayer[] = [
  {
    kind: 'scene',
    from: '#0b1016',
    to: '#070b10',
    lamp: true,
    bokeh: [
      { x: 9, y: 20, r: 7, color: 'rgba(255,196,120,.85)' },
      { x: 22, y: 13, r: 10, color: 'rgba(255,196,120,.6)' },
      { x: 34, y: 24, r: 8, color: 'rgba(255,220,160,.4)' },
      { x: 78, y: 15, r: 9, color: 'rgba(120,200,255,.55)' },
      { x: 91, y: 25, r: 12, color: 'rgba(255,160,200,.48)' },
      { x: 66, y: 27, r: 6, color: 'rgba(180,220,255,.32)' },
    ],
  },
  { kind: 'rail', from: '#5a3a22', to: '#140c06', width: 4.4, sheen: 'rgba(255,222,175,.2)' },
  { kind: 'seam', color: 'rgba(226,200,150,.48)', dashed: true },
  { kind: 'surface', from: '#1d6b3f', to: '#0d3f24', edge: '#072816' },
  { kind: 'grain', opacity: 0.5, blend: 'overlay' },
  {
    kind: 'markings',
    color: 'rgba(255,255,255,.34)',
    legend: 'BLACKJACK PAYS 3 TO 2',
    subLegend: "DEALER MUST DRAW TO 16 AND STAND ON ALL 17'S",
    arc: true,
    spots: STOCK_SPOTS,
  },
  { kind: 'trim', color: 'rgba(214,178,96,.72)', thickness: 2 },
  { kind: 'lighting', key: 'rgba(255,244,214,.26)', keySpread: 46, vignette: 0.55 },
];

/** Named compositions the studio can offer as a starting point. */
export const TABLE_COMPOSITIONS: { id: string; label: string; hint: string; layers: TableLayer[] }[] = [
  {
    id: 'room',
    label: 'Table in a room',
    hint: 'Felt, leather rail and trim, sitting under a lamp in a dark room',
    layers: ROOM_COMPOSITION,
  },
];

export function compositionById(id: string) {
  return TABLE_COMPOSITIONS.find((c) => c.id === id) ?? null;
}
