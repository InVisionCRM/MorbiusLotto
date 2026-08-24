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
 *
 * The WHOLE table is visible. An earlier pass sat the body against the bottom
 * of the frame with a negative margin, which cut the front edge — and with it
 * the near betting circles — off the board entirely. A table you can't see the
 * front of doesn't read as a table.
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
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
  `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${scale}' numOctaves='4'/></filter>` +
  `<rect width='160' height='160' filter='url(%23n)' opacity='0.6'/></svg>")`;

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
      {bokeh && <div className="absolute inset-0" style={{ background: bokeh, filter: 'blur(3px)' }} />}
      <div className="absolute inset-x-0 top-0 h-[34%]" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.7), transparent)' }} />
      {l.lamp && (
        <>
          {/* The cone is a soft vertical wash, NOT a clipped wedge. A hard-edged
              polygon reads as a grey triangle pasted over the room; light in a
              dark room has no edge you can point at. */}
          <div
            className="absolute"
            style={{
              left: '50%', top: '0%', width: '78%', height: '52%', transform: 'translateX(-50%)',
              background:
                'radial-gradient(ellipse 50% 100% at 50% 0%, rgba(255,238,198,.16), rgba(255,232,180,.05) 45%, transparent 78%)',
              filter: 'blur(18px)', mixBlendMode: 'screen',
            }}
          />
          {/* The fitting, and the hot spot inside it, so the light has a source. */}
          <div
            className="absolute"
            style={{
              left: '50%', top: '1.5%', width: '13%', height: '3%', transform: 'translateX(-50%)',
              borderRadius: '0 0 50% 50% / 0 0 100% 100%',
              background: 'linear-gradient(180deg,#31363f,#0e1116)',
              boxShadow: '0 2px 6px rgba(0,0,0,.6)',
            }}
          />
          <div
            className="absolute"
            style={{
              left: '50%', top: '3.6%', width: '8%', height: '1.4%', transform: 'translateX(-50%)',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at 50% 50%, rgba(255,244,214,.95), rgba(255,216,150,.5) 60%, transparent 100%)',
              filter: 'blur(3px)',
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

      {/* ── the table body ──────────────────────────────────────────────────
          Centred with room on every side. The front edge of a blackjack table
          is its most recognisable feature; cropping it is what made the first
          pass read as a green rectangle rather than as a table. */}
      <div className="absolute inset-0 grid place-items-center" style={{ padding: '7% 3.5% 5%' }}>
        <div
          className="relative w-full"
          style={{
            aspectRatio: '16 / 10.6',
            maxHeight: '100%',
            borderRadius: TABLE_RADIUS,
            /* The rail's cross-section: a padded roll is lightest just inside
               its crest and falls away to both edges, so a single two-stop
               gradient always reads as flat plastic. */
            background: rail
              ? `linear-gradient(176deg, ${rail.to} 0%, ${rail.from} 18%, ${rail.from} 42%, ${rail.to} 88%)`
              : 'linear-gradient(176deg,#160d07 0%,#3a2415 18%,#3a2415 42%,#160d07 88%)',
            boxShadow: [
              // the table sitting in the room
              '0 34px 60px rgba(0,0,0,.72)',
              '0 8px 18px rgba(0,0,0,.5)',
              // the crest catching the lamp
              `inset 0 2px 1px ${rail?.sheen ?? 'rgba(255,222,175,.28)'}`,
              // the outer edge rolling away into shadow
              'inset 0 -10px 16px rgba(0,0,0,.5)',
            ].join(','),
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
                /* thread sits in a groove — without the dark side it reads as a
                   dotted CSS border drawn on top of the rail */
                filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.55))',
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
                boxShadow: `0 0 0 1px rgba(0,0,0,.45)`,
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
                ? [
                    // the crease where the cloth tucks under the rail
                    'radial-gradient(ellipse 118% 108% at 50% 30%, transparent 62%, rgba(0,0,0,.5) 100%)',
                    // a warm spill from the lamp, off-centre so it isn't a bullseye
                    `radial-gradient(ellipse 54% 44% at 48% 12%, rgba(255,240,200,.1), transparent 70%)`,
                    `radial-gradient(ellipse 92% 86% at 50% 18%, ${surface.from}, ${surface.to} 58%, ${surface.edge ?? surface.to} 100%)`,
                  ].join(',')
                : [
                    'radial-gradient(ellipse 118% 108% at 50% 30%, transparent 62%, rgba(0,0,0,.5) 100%)',
                    'radial-gradient(ellipse 54% 44% at 48% 12%, rgba(255,240,200,.1), transparent 70%)',
                    'radial-gradient(ellipse 92% 86% at 50% 18%,#1d6b3f,#0d3f24 58%,#072816 100%)',
                  ].join(','),
              /* the rail casting onto the cloth — the single strongest cue that
                 the felt sits DOWN inside the table rather than on top of it */
              boxShadow: 'inset 0 10px 22px rgba(0,0,0,.62), inset 0 -6px 18px rgba(0,0,0,.45)',
              ...(surface ? layerStyle(surface) : null),
            }}
          >
            {grain && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: GRAIN_URL(grain.scale ?? 0.85),
                  backgroundSize: '150px 150px',
                  opacity: grain.opacity ?? 0.5,
                  mixBlendMode: (grain.blend ?? 'overlay') as React.CSSProperties['mixBlendMode'],
                }}
              />
            )}

            {/* The nap. Baize is brushed, so it takes the light unevenly in
                broad soft bands — without this the felt is a single flat
                wash no matter how many gradient stops it has. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'repeating-linear-gradient(97deg, rgba(255,255,255,.016) 0 9px, rgba(0,0,0,.018) 9px 19px),' +
                  'repeating-linear-gradient(13deg, rgba(255,255,255,.01) 0 14px, rgba(0,0,0,.012) 14px 27px)',
                mixBlendMode: 'overlay',
              }}
            />

            {marks && (
              <div className="absolute inset-0 pointer-events-none" style={layerStyle(marks)}>
                {marks.legend && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-semibold"
                    style={{ top: '17%', fontSize: 'clamp(7px, 1.1cqw, 12px)', letterSpacing: '.26em', color: marks.color }}
                  >
                    {marks.legend}
                  </div>
                )}
                {marks.subLegend && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-semibold"
                    style={{ top: '24.5%', fontSize: 'clamp(6px, .9cqw, 10px)', letterSpacing: '.18em', color: marks.color, opacity: 0.62 }}
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
                    background: `radial-gradient(ellipse ${light.keySpread ?? 46}% ${(light.keySpread ?? 46) * 0.9}% at 50% 8%, ${light.key ?? 'rgba(255,244,214,.26)'}, transparent 70%)`,
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse 108% 96% at 50% 26%, transparent 40%, rgba(0,0,0,${light.vignette ?? 0.55}) 100%)`,
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Betting spots and the insurance line are drawn in the OUTER box, in the
          same canvas space the seats and cards use — a marking printed inside
          the felt's own percentage space would drift away from the cards the
          moment a seat is moved. They're derived from the layout's seats rather
          than configured, so a composed table can never print a spot where
          nobody sits. */}
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
                boxShadow: `inset 0 0 14px rgba(0,0,0,.28)`,
                opacity: 0.55,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
