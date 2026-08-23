'use client';

/**
 * ComposedTable — draws a table from its layer stack.
 *
 * Sits exactly where the single `<Image>` used to: absolutely filling the
 * board's box at z-index 0, with seats and cards positioned above it in the
 * layout's own coordinate space. Nothing above this layer knows or cares that
 * the board is now built rather than painted.
 *
 * The table body is a SHAPE whose background is the rail, with the felt inset
 * inside it. Not a `border`: border-width rejects percentages outright and a
 * border cannot take a gradient, so a rail expressed that way silently renders
 * nothing. Every detail ring (seam, trim) shares the shape's radius family, so
 * it follows the curve instead of cutting a straight line across the box.
 */

import React from 'react';
import type {
  TableLayer, SceneLayer, SurfaceLayer, GrainLayer, MarkingsLayer,
  RailLayer, SeamLayer, TrimLayer, StickerLayer, ImageLayer, LightingLayer,
} from '@/lib/table-layers';
import { TABLE_RADIUS, TABLE_RADIUS_INNER } from '@/lib/table-layers';
import { useBlackjackTableLayout } from '@/components/BLACKJACK/BlackjackTableLayoutContext';

/* Cloth texture. SVG turbulence is the one thing flat gradients can't fake,
   and inlining it keeps the whole table free of network requests. */
const GRAIN_URL = (scale: number) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>` +
  `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${scale}' numOctaves='3'/></filter>` +
  `<rect width='140' height='140' filter='url(%23n)' opacity='0.55'/></svg>")`;

function layerStyle(l: TableLayer): React.CSSProperties {
  return {
    ...(l.opacity != null ? { opacity: l.opacity } : null),
    ...(l.blend ? { mixBlendMode: l.blend as React.CSSProperties['mixBlendMode'] } : null),
  };
}

/** The room, drawn behind the table body. */
function Scene({ l }: { l: SceneLayer }) {
  const bokeh = (l.bokeh ?? [])
    .map((b) => `radial-gradient(circle ${b.r}px at ${b.x}% ${b.y}%, ${b.color}, transparent 63%)`)
    .join(',');
  return (
    <div className="absolute inset-0" style={{ ...layerStyle(l), background: `linear-gradient(180deg, ${l.from} 0%, ${l.to} 100%)` }}>
      {bokeh && <div className="absolute inset-0" style={{ background: bokeh, filter: 'blur(2.5px)' }} />}
      <div className="absolute inset-x-0 top-0 h-[38%]" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.72), transparent)' }} />
      {l.lamp && (
        <>
          {/* Heavily blurred: a hard-edged clip-path wedge reads as a grey
              triangle pasted over the room rather than as light. */}
          <div
            className="absolute"
            style={{
              left: '50%', top: '-6%', width: '64%', height: '66%', transform: 'translateX(-50%)',
              background: 'linear-gradient(180deg, rgba(255,242,206,.13), rgba(255,242,206,.04) 46%, transparent 82%)',
              clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)',
              filter: 'blur(22px)', mixBlendMode: 'screen',
            }}
          />
          {/* The fitting itself, so the light has a visible source. */}
          <div
            className="absolute"
            style={{
              left: '50%', top: '2%', width: '15%', height: '3.4%', transform: 'translateX(-50%)',
              borderRadius: '0 0 50% 50% / 0 0 100% 100%',
              background: 'linear-gradient(180deg,#2a2f38,#12161c)',
              boxShadow: '0 5px 18px rgba(255,238,190,.5)',
            }}
          />
        </>
      )}
    </div>
  );
}

export interface ComposedTableProps {
  layers: TableLayer[];
  className?: string;
  style?: React.CSSProperties;
}

/**
 * One decal on the cloth.
 *
 * Both variants share the placement transform, so a lettered decal and an
 * uploaded one sit and turn identically — the only difference is what gets
 * drawn inside. `translate(-50%,-50%)` runs BEFORE the rotation so a sticker
 * turns about its own centre rather than swinging around the felt's corner.
 */
function Sticker({ l }: { l: StickerLayer }) {
  const color = l.color ?? '#fde047';
  const common: React.CSSProperties = {
    left: `${l.x}%`,
    top: `${l.y}%`,
    transform: `translate(-50%, -50%) rotate(${l.rotate ?? 0}deg)`,
    ...layerStyle(l),
  };

  if (l.src) {
    return (
      /* Plain <img>: a decal can be a data: URI straight from an upload, or
         served from wherever the library stores it, and next/image rejects
         every hostname that isn't in next.config's allowlist. */
      <img
        src={l.src}
        alt=""
        className="absolute pointer-events-none select-none"
        style={{
          ...common,
          width: `${l.size ?? 14}%`,
          ...(l.glow ? { filter: `drop-shadow(0 0 7px ${color})` } : null),
        }}
      />
    );
  }

  if (!l.text) return null;

  return (
    <div
      className="absolute pointer-events-none select-none whitespace-nowrap font-bold"
      style={{
        ...common,
        color,
        fontSize: `clamp(8px, ${l.size ?? 2}cqw, 34px)`,
        letterSpacing: '.06em',
        ...(l.glow ? { textShadow: `0 0 12px ${color}` } : null),
      }}
    >
      {l.text}
    </div>
  );
}

export default function ComposedTable({ layers, className, style }: ComposedTableProps) {
  const layout = useBlackjackTableLayout();
  const on = layers.filter((l) => l.enabled !== false);
  const scene = on.find((l): l is SceneLayer => l.kind === 'scene');
  const rail = on.find((l): l is RailLayer => l.kind === 'rail');
  const seam = on.find((l): l is SeamLayer => l.kind === 'seam');
  const trim = on.find((l): l is TrimLayer => l.kind === 'trim');
  const surface = on.find((l): l is SurfaceLayer => l.kind === 'surface');
  const grain = on.find((l): l is GrainLayer => l.kind === 'grain');
  const marks = on.find((l): l is MarkingsLayer => l.kind === 'markings');
  const light = on.find((l): l is LightingLayer => l.kind === 'lighting');
  const images = on.filter((l): l is ImageLayer => l.kind === 'image');
  /* Every sticker is drawn, not just the first — unlike the felt or the rail,
     of which a table has exactly one. */
  const stickers = on.filter((l): l is StickerLayer => l.kind === 'sticker');

  /* Rail thickness. Percentage insets resolve against width horizontally and
     height vertically, so the pair is pre-compensated by the table's aspect —
     one value would give a rail half again as thick down the sides. */
  const railW = rail?.width ?? 4.4;
  const railV = railW * 1.5;
  const inset = `${railV}% ${railW}%`;

  /* Seat rings, in canvas percentages. `floorY` is the bottom of the name tag,
     so the ring is lifted above it to sit where the cards actually land. */
  const seatSpots = React.useMemo(() => {
    const { width, height } = layout.canvas;
    if (!width || !height) return [];
    return layout.seats.map((st) => ({
      x: (st.cx / width) * 100,
      y: ((st.floorY - height * 0.085) / height) * 100,
    }));
  }, [layout]);
  const spotSize = 7.5;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className ?? ''}`} style={style} aria-hidden>
      {scene && <Scene l={scene} />}

      {images.map((l, i) => (
        <div
          key={`img-${i}`}
          className="absolute inset-0"
          style={{
            ...layerStyle(l),
            backgroundImage: `url(${l.src})`,
            backgroundSize: l.fit ?? 'cover',
            backgroundPosition: 'center',
          }}
        />
      ))}

      {/* ── the table body ──────────────────────────────────────────────── */}
      <div className="absolute inset-0 grid place-items-end" style={{ padding: '6% 4% 0' }}>
        <div
          className="relative w-full"
          style={{
            aspectRatio: '16 / 10.6',
            marginBottom: '-7%',
            borderRadius: TABLE_RADIUS,
            background: rail
              ? `linear-gradient(180deg, ${rail.from}, ${rail.to} 70%)`
              : 'linear-gradient(180deg,#3a2415,#160d07)',
            boxShadow: `${rail?.sheen ? `inset 0 3px 10px ${rail.sheen}, ` : ''}0 26px 54px rgba(0,0,0,.7)`,
            ...(rail ? layerStyle(rail) : null),
          }}
        >
          {seam && (
            <div
              className="absolute pointer-events-none"
              style={{
                inset: `${railV * 0.47}% ${railW * 0.47}%`,
                borderRadius: TABLE_RADIUS_INNER,
                border: `1.5px ${seam.dashed ? 'dashed' : 'solid'} ${seam.color}`,
                ...layerStyle(seam),
              }}
            />
          )}
          {trim && (
            <div
              className="absolute pointer-events-none"
              style={{
                inset,
                borderRadius: TABLE_RADIUS_INNER,
                border: `${trim.thickness ?? 2}px solid ${trim.color}`,
                ...(trim.glow ? { filter: `drop-shadow(0 0 5px ${trim.color})` } : null),
                ...layerStyle(trim),
              }}
            />
          )}

          {/* the felt, clipped to the table's inner curve */}
          <div
            className="absolute overflow-hidden"
            style={{
              inset,
              borderRadius: TABLE_RADIUS_INNER,
              background: surface
                ? `radial-gradient(ellipse 78% 74% at 50% 26%, ${surface.from}, ${surface.to} 66%, ${surface.edge ?? surface.to})`
                : 'radial-gradient(ellipse 78% 74% at 50% 26%,#1d6b3f,#0d3f24 66%,#072816)',
              boxShadow: 'inset 0 6px 16px rgba(0,0,0,.55)',
              ...(surface ? layerStyle(surface) : null),
            }}
          >
            {grain && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: GRAIN_URL(grain.scale ?? 0.9),
                  opacity: grain.opacity ?? 0.5,
                  mixBlendMode: (grain.blend ?? 'overlay') as React.CSSProperties['mixBlendMode'],
                }}
              />
            )}

            {marks && (
              <div className="absolute inset-0 pointer-events-none" style={layerStyle(marks)}>
                {marks.arc && (
                  <div
                    className="absolute"
                    style={{
                      left: '9%', right: '9%', top: '18%', height: '44%',
                      borderRadius: '50% / 100% 100% 0 0',
                      border: `2px solid ${marks.color}`, borderBottom: 'none',
                    }}
                  />
                )}
                {marks.legend && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-semibold"
                    style={{ top: '23%', fontSize: 'clamp(7px, 1.1cqw, 11px)', letterSpacing: '.26em', color: marks.color }}
                  >
                    {marks.legend}
                  </div>
                )}
                {marks.subLegend && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-semibold"
                    style={{ top: '30%', fontSize: 'clamp(6px, .9cqw, 9px)', letterSpacing: '.18em', color: marks.color, opacity: 0.62 }}
                  >
                    {marks.subLegend}
                  </div>
                )}
              </div>
            )}

            {/* Stickers ride on the cloth: after the markings so a decal can
                cover a printed legend, and before the lighting so the same
                overhead pool falls across them. Clipped by the felt's own
                overflow-hidden, so a decal dragged off the edge is cut by the
                table's curve instead of floating over the rail. */}
            {stickers.map((l, i) => (
              <Sticker key={`sticker-${i}`} l={l} />
            ))}

            {light && (
              <>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse ${light.keySpread ?? 46}% ${(light.keySpread ?? 46) * 0.9}% at 50% 10%, ${light.key ?? 'rgba(255,244,214,.26)'}, transparent 66%)`,
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse 116% 100% at 50% 32%, transparent 46%, rgba(0,0,0,${light.vignette ?? 0.55}) 100%)`,
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Betting spots are drawn in the OUTER box, in the same canvas space the
          seats and cards use — a ring printed inside the felt's own percentage
          space would drift away from the cards the moment a seat is moved.
          They're derived from the layout's seats rather than configured, so a
          composed table can never print a spot where nobody sits. */}
      {marks && seatSpots.length > 0 && (
        <div className="absolute inset-0 pointer-events-none" style={layerStyle(marks)}>
          {seatSpots.map((s, i) => (
            <div
              key={`spot-${i}`}
              className="absolute rounded-full"
              style={{
                left: `${s.x}%`, top: `${s.y}%`,
                width: `${spotSize}%`, aspectRatio: '1',
                transform: 'translate(-50%, -50%)',
                border: `2px solid ${marks.color}`,
                opacity: 0.55,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
