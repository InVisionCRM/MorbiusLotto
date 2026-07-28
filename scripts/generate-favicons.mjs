/**
 * generate-favicons.mjs — rebuild the browser-tab icon set from the master logo.
 *
 * Why this exists: the original favicon was a 512px logo on an OPAQUE PURE-BLACK
 * square, with the shield filling only ~63% of the frame. Scaled to a 16px tab
 * icon that reads as an empty black square on a dark browser tab — the icon
 * looked missing. This script fixes both causes:
 *
 *   1. Removes the black background (edge-connected flood fill, so the shield's
 *      own dark interior — 52% of its pixels — is preserved) → real transparency.
 *   2. Crops to the artwork and re-pads to a small, even margin → the mark fills
 *      the frame and stays legible at 16px.
 *
 * Deliberately NOT regenerated: web-app-manifest-192/512. Those are declared
 * `purpose: "maskable"` in site.webmanifest, where Android crops to a circle —
 * their generous padding is the required safe zone, so tight-cropping them would
 * clip the logo. They stay as-is.
 *
 * Apple touch icon keeps an opaque brand-coloured background, because iOS
 * composites transparency to black on the home screen.
 *
 * Usage: node scripts/generate-favicons.mjs
 */

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const SRC = 'public/icons/web-app-manifest-512x512.png';
/** Background luminance at/below this counts as removable backdrop. */
const BG_LUM = 14;
/** Margin around the artwork in the output, as a fraction of the canvas. */
const MARGIN = 0.06;
/** Brand background for the (opaque) Apple touch icon — matches themeColor. */
const APPLE_BG = { r: 2, g: 6, b: 23, alpha: 1 };

/** Flood fill from the border to alpha-out only background-connected pixels. */
async function cutout(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  const isBg = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (isBg[p]) return;
    if (lum(p * C) > BG_LUM) return;
    isBg[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p / W) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  // Apply transparency + find the artwork's bounding box.
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isBg[p]) {
        data[p * C + 3] = 0;
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cut = sharp(data, { raw: { width: W, height: H, channels: C } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  return { buf: await cut.png().toBuffer(), box: { minX, minY, maxX, maxY, W, H } };
}

/** Square canvas, artwork centred with an even margin, transparent surround. */
async function square(art, size, background = { r: 0, g: 0, b: 0, alpha: 0 }) {
  const inner = Math.max(1, Math.round(size * (1 - 2 * MARGIN)));
  const scaled = await sharp(art)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Pack PNG frames into a multi-size .ico (PNG-in-ICO; all modern browsers). */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = 6 + frames.length * 16;
  const dir = [];
  for (const f of frames) {
    const e = Buffer.alloc(16);
    e.writeUInt8(f.size >= 256 ? 0 : f.size, 0);
    e.writeUInt8(f.size >= 256 ? 0 : f.size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(f.data.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += f.data.length;
  }
  return Buffer.concat([header, ...dir, ...frames.map((f) => f.data)]);
}

const { buf: art, box } = await cutout(SRC);
console.log(
  `artwork bbox ${box.maxX - box.minX + 1}x${box.maxY - box.minY + 1} ` +
  `(was ${box.W}x${box.H}) — trimmed ${box.minX}px left / ${box.minY}px top`,
);

// Transparent favicons at every size a browser might ask for.
const PNG_SIZES = [16, 32, 48, 96, 192];
const made = {};
for (const s of PNG_SIZES) made[s] = await square(art, s);

writeFileSync('public/icons/favicon-16x16.png', made[16]);
writeFileSync('public/icons/favicon-32x32.png', made[32]);
writeFileSync('public/icons/favicon-96x96.png', made[96]);

// Multi-size .ico — 16/32/48 is what browsers actually pick from for a tab.
const ico = buildIco([
  { size: 16, data: made[16] },
  { size: 32, data: made[32] },
  { size: 48, data: made[48] },
]);
for (const p of ['app/favicon.ico', 'public/favicon.ico', 'public/icons/favicon.ico']) {
  writeFileSync(p, ico);
}

// Apple touch icon: opaque brand background (iOS flattens alpha to black).
writeFileSync('public/icons/apple-touch-icon.png', await square(art, 180, APPLE_BG));

console.log('wrote favicon-16/32/96, favicon.ico (16+32+48) x3, apple-touch-icon');
console.log('left untouched: web-app-manifest-192/512 (maskable safe zone)');
