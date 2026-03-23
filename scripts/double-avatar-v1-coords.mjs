#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '../components/poker/avatar/AvatarPreview.tsx');
const lines = fs.readFileSync(file, 'utf8').split('\n');

function d2(n) {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return n;
  const t = v * 2;
  if (Number.isInteger(t)) return String(t);
  return String(t).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function doubleYXInLine(line) {
  let out = line;
  out = out.replace(/\by:\s*\[([^\]]+)\]\s*(as number\[\])?/g, (full, inner, asCast) => {
    const parts = inner.split(',').map((p) => p.trim()).filter(Boolean);
    const nums = parts.map((p) => d2(p)).join(', ');
    return asCast ? `y: [${nums}] ${asCast}` : `y: [${nums}]`;
  });
  out = out.replace(/\bx:\s*\[([^\]]+)\]\s*(as number\[\])?/g, (full, inner, asCast) => {
    const parts = inner.split(',').map((p) => p.trim()).filter(Boolean);
    const nums = parts.map((p) => d2(p)).join(', ');
    return asCast ? `x: [${nums}] ${asCast}` : `x: [${nums}]`;
  });
  out = out.replace(/\by:\s*(-?[\d.]+)(\s*[,}])/g, (_, n, tail) => `y: ${d2(n)}${tail}`);
  out = out.replace(/\bx:\s*(-?[\d.]+)(\s*[,}])/g, (_, n, tail) => `x: ${d2(n)}${tail}`);
  return out;
}

let s = lines.join('\n');

s = s.replace(/avatarMotionOrigin\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g, (_, a, b) => `avatarMotionOrigin(${d2(a)}, ${d2(b)})`);

const qAttrs = ['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'fontSize'];
for (const attr of qAttrs) {
  const re = new RegExp(`\\b${attr}=(["'])([0-9]+(?:\\.[0-9]+)?)\\1`, 'g');
  s = s.replace(re, (_, q, n) => `${attr}=${q}${d2(n)}${q}`);
}

s = s.replace(/strokeWidth=\{([0-9.]+)\}/g, (_, n) => `strokeWidth={${d2(n)}}`);
s = s.replace(/\brx=\{([0-9.]+)\}/g, (_, n) => `rx={${d2(n)}}`);
s = s.replace(/\bry=\{([0-9.]+)\}/g, (_, n) => `ry={${d2(n)}}`);
s = s.replace(/fontSize=\{([0-9.]+)\}/g, (_, n) => `fontSize={${d2(n)}}`);

s = s.replace(/originX\s*=\s*([\d.]+)/g, (_, n) => `originX = ${d2(n)}`);
s = s.replace(/originY\s*=\s*([\d.]+)/g, (_, n) => `originY = ${d2(n)}`);

s = s.replace(
  /\{\s*x:\s*([\d.]+),\s*y:\s*([\d.]+),\s*tx:\s*([\d.]+),\s*ty:\s*([\d.-]+),\s*size:\s*([\d.]+),\s*delay:\s*([\d.]+)\s*\}/g,
  (_, x, y, tx, ty, size, delay) =>
    `{ x: ${d2(x)}, y: ${d2(y)}, tx: ${d2(tx)}, ty: ${d2(ty)}, size: ${d2(size)}, delay: ${delay} }`,
);

s = s.replace(
  /\{\s*dx:\s*([\d.-]+),\s*rise:\s*([\d.-]+),\s*size:\s*([\d.]+),\s*dur:/g,
  (_, dx, rise, size) => `{ dx: ${d2(dx)}, rise: ${d2(rise)}, size: ${d2(size)}, dur:`,
);

s = s.replace(/\brenderEye\(\s*7\s*\)/g, 'renderEye(14)');
s = s.replace(/\brenderEye\(\s*14\s*\)/g, 'renderEye(28)');
s = s.replace(/x === 14/g, 'x === 28');

const L = s.split('\n');
const vi = L.findIndex((l) => l.includes('const eyeVariants = {'));
const vj = L.findIndex((l, idx) => idx > vi && l.includes('const getFaceShapeOffsets = () =>'));
for (let i = vi; i < vj && i >= 0; i++) L[i] = doubleYXInLine(L[i]);

const oi = L.findIndex((l) => l.includes('const getFaceShapeOffsets = () => {'));
const oj = L.findIndex((l, idx) => idx > oi && l.includes('const offsets = getFaceShapeOffsets'));
for (let i = oi; i < oj && i >= 0; i++) {
  if (L[i].includes('return {'))
    L[i] = L[i].replace(/:\s*(-?[\d.]+)(\s*[,}])/g, (_, n, tail) => `: ${d2(n)}${tail}`);
}
s = L.join('\n');

s = s.replace(/animate=\{\{\s*y:\s*\[([^\]]+)\]/g, (_, inner) => {
  const parts = inner.split(',').map((p) => p.trim());
  return `animate={{ y: [${parts.map((p) => d2(p)).join(', ')}]`;
});

s = s.replace(/animate=\{\{[^}]*\by:\s*\[0,\s*-([\d.]+)\]/g, (m) =>
  m.replace(/y:\s*\[0,\s*-([\d.]+)\]/, (_, n) => `y: [0, -${d2(n)}]`),
);

s = s.replace(/animate=\{\{[^}]*\by:\s*\[0,\s*([\d.]+)\]/g, (m) =>
  m.replace(/y:\s*\[0,\s*([\d.]+)\]/, (_, n) => `y: [0, ${d2(n)}]`),
);

s = s.replace(
  /animate=\{\{\s*scaleY:\s*\[1,\s*1\.01,\s*1\],\s*y:\s*\[0,\s*-([\d.]+),\s*0\],\s*rotate:\s*\[0,\s*([\d.]+),\s*-([\d.]+),\s*0\]\s*\}\}/,
  (_, y, r1, r2) =>
    `animate={{ scaleY: [1, 1.01, 1], y: [0, -${d2(y)}, 0], rotate: [0, ${d2(r1)}, -${d2(r2)}, 0] }}`,
);

s = s.replace(/x=\{(\d+)\s*\+\s*i\s*\*\s*(\d+)\}/g, (_, a, b) => `x={${d2(a)} + i * ${d2(b)}}`);

s = s.replace(/initial=\{glassesAnimationKey[^}]*y:\s*-(\d+)/g, (m) =>
  m.replace(/y:\s*-(\d+)/, (_, n) => `y: -${d2(n)}`),
);

s = s.replace(/\n\s*<g transform=\{`scale\(\$\{AVATAR_INNER_SCALE\}\)`\}>\n/, '\n');
s = s.replace(/\n\s*<\/g>\n(\s*)\{\/\* Overlay \*\//, '\n$1{/* Overlay */');

s = s.replace(
  /import \{\s*AVATAR_VIEWBOX,\s*AVATAR_INNER_SCALE,\s*AVATAR_VIEWBOX_W/m,
  'import {\n  AVATAR_VIEWBOX,\n  AVATAR_VIEWBOX_W',
);

fs.writeFileSync(file, s);
console.log('Done');
