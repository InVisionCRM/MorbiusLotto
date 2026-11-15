/**
 * ChronoDefs — shared SVG defs for the Chronograph homepage, rendered once.
 *
 * Tone filters (referenced from CSS as `filter:url(#h2fx-…)`) remap the
 * colourful game art onto the shared palette: brushed steel, gold, cyan,
 * violet, a high-contrast ink, and a cyan→gold "dusk" tritone. The first three
 * are the option-11 mockup's #st / #gd / #cyn matrices verbatim.
 * `h2-gg` is the gauge arc gradient (cyan → gold).
 */

const GRAY = '.33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 1 0';

function Tone({ id, r, g, b }: { id: string; r: string; g: string; b: string }) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values={GRAY} />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={r} />
        <feFuncG type="table" tableValues={g} />
        <feFuncB type="table" tableValues={b} />
      </feComponentTransfer>
    </filter>
  );
}

export function ChronoDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" focusable="false">
      <defs>
        <Tone id="h2fx-st" r="0.027 0.290 0.906" g="0.031 0.322 0.922" b="0.051 0.400 0.953" />
        <Tone id="h2fx-gd" r="0.027 0.478 0.961" g="0.031 0.365 0.863" b="0.051 0.133 0.604" />
        <Tone id="h2fx-cy" r="0.020 0.114 0.851" g="0.031 0.392 0.984" b="0.051 0.459 1.000" />
        <Tone id="h2fx-vi" r="0.027 0.300 0.860" g="0.031 0.200 0.800" b="0.051 0.520 0.990" />
        <Tone id="h2fx-ink" r="0.010 0.040 0.300 0.960" g="0.012 0.050 0.320 0.970" b="0.020 0.070 0.380 0.990" />
        <Tone id="h2fx-dusk" r="0.020 0.090 0.420 0.960" g="0.030 0.300 0.440 0.840" b="0.060 0.420 0.480 0.470" />
        <linearGradient id="h2-gg" x1="0" x2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#e9c46a" />
        </linearGradient>
      </defs>
    </svg>
  );
}
