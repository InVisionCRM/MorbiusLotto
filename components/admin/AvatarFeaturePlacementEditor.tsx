'use client';

import React, { useMemo, useState } from 'react';
import { AvatarView } from '@/components/avatar';
import { CopyButton } from '@/components/ui/copy-button';
import { FileUpload } from '@/components/ui/file-upload';
import { AVATAR_V1_DEFAULTS, type AvatarConfig } from '@/lib/avatar-payload';
import { PICKER_FACIAL_HAIRS, PICKER_HAIR_STYLES, PICKER_MOUTH_ACCESSORIES } from '@/lib/avatar-editor-options';
import {
  AVATAR_FEATURE_REGISTRY,
  AVATAR_FEATURE_SOURCE_CANVAS,
  sourcePlacementToAvatarGeometry,
  type AvatarFeatureAnchor,
  type AvatarFeatureCategory,
  type AvatarFeatureDefinition,
} from '@/lib/avatar-feature-registry';

const PREVIEW_PX = {
  width: 384,
  height: 448,
} as const;

type ParsedSvg = {
  viewBoxWidth: number;
  viewBoxHeight: number;
  innerMarkup: string;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

function parseSvgInput(input: string): ParsedSvg | null {
  const source = input.trim();
  if (!source) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;
    const vb = (svg.getAttribute('viewBox') ?? '').trim();
    let width = Number(svg.getAttribute('width') ?? '');
    let height = Number(svg.getAttribute('height') ?? '');
    if (vb) {
      const parts = vb.split(/[\s,]+/).map((p) => Number(p));
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        width = parts[2];
        height = parts[3];
      }
    }
    if (!Number.isFinite(width) || width <= 0) width = AVATAR_FEATURE_SOURCE_CANVAS.width;
    if (!Number.isFinite(height) || height <= 0) height = AVATAR_FEATURE_SOURCE_CANVAS.height;
    return {
      viewBoxWidth: width,
      viewBoxHeight: height,
      innerMarkup: svg.innerHTML.trim(),
    };
  } catch {
    return null;
  }
}

function escapeTemplateLiteral(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function escapeShellArg(raw: string): string {
  return `'${raw.replace(/'/g, `'\\''`)}'`;
}

export default function AvatarFeaturePlacementEditor() {
  const [category, setCategory] = useState<AvatarFeatureCategory>('mouth');
  const [featureId, setFeatureId] = useState('mouth_custom_01');
  const [anchor, setAnchor] = useState<AvatarFeatureAnchor>('center');
  const [x, setX] = useState(200);
  const [y, setY] = useState(360);
  const [scale, setScale] = useState(0.38);
  const [rotation, setRotation] = useState(0);
  const [zIndex, setZIndex] = useState(10);
  const [notes, setNotes] = useState('');
  const [previewMouthAccessory, setPreviewMouthAccessory] = useState<string>('None');
  const [previewFacialHair, setPreviewFacialHair] = useState<string>('None');
  const [previewHairStyle, setPreviewHairStyle] = useState<string>(AVATAR_V1_DEFAULTS.hairStyle);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cliSvgPath, setCliSvgPath] = useState('/Users/kyle/Downloads/facesjs-master/svgs/mouth/mouth2.svg');
  const [svgInput, setSvgInput] = useState(
    '<svg viewBox="0 0 400 600"><path d="M145 355 Q 200 395 255 355" fill="none" stroke="#351e1f" stroke-width="16" stroke-linecap="round"/></svg>',
  );

  const [drag, setDrag] = useState<DragState | null>(null);

  const parsedSvg = useMemo(() => parseSvgInput(svgInput), [svgInput]);

  const draftDefinition = useMemo<AvatarFeatureDefinition | null>(() => {
    if (!parsedSvg) return null;
    return {
      id: featureId.trim() || `${category}_custom`,
      category,
      sourceViewBox: {
        width: parsedSvg.viewBoxWidth,
        height: parsedSvg.viewBoxHeight,
      },
      svgMarkup: parsedSvg.innerMarkup,
      placement: { x, y, scale, rotation, zIndex, anchor },
      notes: notes.trim() || undefined,
    };
  }, [anchor, category, featureId, notes, parsedSvg, rotation, scale, x, y, zIndex]);

  const geometry = useMemo(
    () => (draftDefinition ? sourcePlacementToAvatarGeometry(draftDefinition) : null),
    [draftDefinition],
  );

  const existingInCategory = useMemo(
    () => Object.keys(AVATAR_FEATURE_REGISTRY[category]).sort(),
    [category],
  );

  const generatedJson = useMemo(() => {
    if (!draftDefinition) return '';
    return JSON.stringify(draftDefinition, null, 2);
  }, [draftDefinition]);

  const generatedTs = useMemo(() => {
    if (!draftDefinition) return '';
    const safeMarkup = escapeTemplateLiteral(draftDefinition.svgMarkup);
    const safeNotes = draftDefinition.notes ? escapeTemplateLiteral(draftDefinition.notes) : '';
    const notesLine = draftDefinition.notes ? `,\n  notes: \`${safeNotes}\`` : '';
    return `AVATAR_FEATURE_REGISTRY.${draftDefinition.category}['${draftDefinition.id}'] = {
  id: '${draftDefinition.id}',
  category: '${draftDefinition.category}',
  sourceViewBox: { width: ${draftDefinition.sourceViewBox.width}, height: ${draftDefinition.sourceViewBox.height} },
  svgMarkup: \`${safeMarkup}\`,
  placement: {
    x: ${draftDefinition.placement.x},
    y: ${draftDefinition.placement.y},
    scale: ${draftDefinition.placement.scale},
    rotation: ${draftDefinition.placement.rotation},
    zIndex: ${draftDefinition.placement.zIndex},
    anchor: '${draftDefinition.placement.anchor}',
  }${notesLine}
};`;
  }, [draftDefinition]);

  const generatedCliCommand = useMemo(() => {
    const safePath = cliSvgPath.trim() || '/absolute/path/to/feature.svg';
    const safeId = (featureId.trim() || `${category}_custom`).replace(/\s+/g, '_');
    const notePart = notes.trim() ? ` --notes ${escapeShellArg(notes.trim())}` : '';
    return `npm run avatar:feature:add -- --category ${category} --id ${safeId} --svg ${escapeShellArg(safePath)} --x ${x} --y ${y} --scale ${scale} --rotation ${rotation} --zIndex ${zIndex} --anchor ${anchor}${notePart}`;
  }, [anchor, category, cliSvgPath, featureId, notes, rotation, scale, x, y, zIndex]);

  const previewConfig: AvatarConfig = useMemo(
    () => ({
      ...AVATAR_V1_DEFAULTS,
      mouthAccessory: previewMouthAccessory,
      facialHair: previewFacialHair,
      hairStyle: previewHairStyle,
    }),
    [previewFacialHair, previewHairStyle, previewMouthAccessory],
  );

  const onUploadSvg = async (files: File[]) => {
    setUploadError(null);
    const file = files[files.length - 1];
    if (!file) return;
    const looksLikeSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    if (!looksLikeSvg) {
      setUploadError('Please upload an SVG file.');
      return;
    }
    try {
      const raw = await file.text();
      const parsed = parseSvgInput(raw);
      if (!parsed) {
        setUploadError('Invalid SVG format.');
        return;
      }
      setSvgInput(raw);
      if (!cliSvgPath.trim() || cliSvgPath.includes('/absolute/path/to/feature.svg')) {
        setCliSvgPath(`/Users/kyle/Downloads/${file.name}`);
      }
    } catch {
      setUploadError('Failed to read SVG file.');
    }
  };

  const onPointerDownFeature = (e: React.PointerEvent<SVGGElement>) => {
    if (!draftDefinition) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: x,
      startY: y,
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMoveCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    const dxSource = (dxPx / PREVIEW_PX.width) * AVATAR_FEATURE_SOURCE_CANVAS.width;
    const dySource = (dyPx / PREVIEW_PX.height) * AVATAR_FEATURE_SOURCE_CANVAS.height;
    setX(Math.round((drag.startX + dxSource) * 10) / 10);
    setY(Math.round((drag.startY + dySource) * 10) / 10);
  };

  const onPointerUpCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
  };

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-[rgb(16,26,35)] to-[rgb(35,36,41)] shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.5)] p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Avatar Feature Placement Editor</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Source space is 400x600. Drag in preview, then copy generated registry code.
          </p>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-cyan-300/80">
          Mouth -&gt; Nose -&gt; Hair
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5">
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden bg-zinc-950 ring-1 ring-cyan-500/20">
            <div style={{ width: PREVIEW_PX.width, height: PREVIEW_PX.height }} className="relative">
              <AvatarView
                config={previewConfig}
                compact={false}
                trackMouse={false}
                roamEyes={false}
                disableAmbientMotion
                hideBaseMouth={category === 'mouth'}
                hideBaseNose={category === 'nose'}
                hideBaseHair={category === 'hair'}
                className="w-full h-full"
              />
              <svg
                viewBox="0 0 48 56"
                className="absolute inset-0 w-full h-full"
                onPointerMove={onPointerMoveCanvas}
                onPointerUp={onPointerUpCanvas}
              >
                {draftDefinition && geometry ? (
                  <g
                    onPointerDown={onPointerDownFeature}
                    style={{ cursor: drag ? 'grabbing' : 'grab' }}
                    transform={`rotate(${geometry.rotation} ${geometry.pivotX} ${geometry.pivotY})`}
                  >
                    <rect
                      x={geometry.x}
                      y={geometry.y}
                      width={geometry.width}
                      height={geometry.height}
                      fill="rgba(34,211,238,0.08)"
                      stroke="rgba(34,211,238,0.7)"
                      strokeDasharray="0.8 0.6"
                      strokeWidth={0.12}
                    />
                    <svg
                      x={geometry.x}
                      y={geometry.y}
                      width={geometry.width}
                      height={geometry.height}
                      viewBox={`0 0 ${draftDefinition.sourceViewBox.width} ${draftDefinition.sourceViewBox.height}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <g dangerouslySetInnerHTML={{ __html: draftDefinition.svgMarkup }} />
                    </svg>
                  </g>
                ) : null}
              </svg>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Drag the cyan box to position. Use scale/rotation inputs for resizing and angle.
          </p>
        </div>

        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Preview mouth prop</span>
              <select
                value={previewMouthAccessory}
                onChange={(e) => setPreviewMouthAccessory(e.target.value)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              >
                {PICKER_MOUTH_ACCESSORIES.filter((value) => value === 'None' || value === 'Cigar' || value === 'Cigarette' || value === 'Pipe').map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Preview facial hair</span>
              <select
                value={previewFacialHair}
                onChange={(e) => setPreviewFacialHair(e.target.value)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              >
                {PICKER_FACIAL_HAIRS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Preview hair style</span>
              <select
                value={previewHairStyle}
                onChange={(e) => setPreviewHairStyle(e.target.value)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              >
                {PICKER_HAIR_STYLES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AvatarFeatureCategory)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              >
                <option value="mouth">Mouth</option>
                <option value="nose">Nose</option>
                <option value="hair">Hair</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Feature ID</span>
              <input
                value={featureId}
                onChange={(e) => setFeatureId(e.target.value)}
                placeholder={`${category}_custom_01`}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Anchor</span>
              <select
                value={anchor}
                onChange={(e) => setAnchor(e.target.value as AvatarFeatureAnchor)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              >
                <option value="center">center</option>
                <option value="top-left">top-left</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">zIndex</span>
              <input
                type="number"
                value={zIndex}
                onChange={(e) => setZIndex(Number(e.target.value) || 0)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">x (source)</span>
              <input
                type="number"
                value={x}
                onChange={(e) => setX(Number(e.target.value) || 0)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">y (source)</span>
              <input
                type="number"
                value={y}
                onChange={(e) => setY(Number(e.target.value) || 0)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Scale</span>
              <input
                type="number"
                step="0.01"
                value={scale}
                onChange={(e) => setScale(Math.max(0.01, Number(e.target.value) || 0.01))}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Rotation (deg)</span>
              <input
                type="number"
                step="0.1"
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value) || 0)}
                className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">SVG upload</span>
            <FileUpload onChange={(files) => { void onUploadSvg(files); }} />
            {uploadError ? <span className="text-[11px] text-rose-300">{uploadError}</span> : null}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">CLI SVG path</span>
            <input
              value={cliSvgPath}
              onChange={(e) => setCliSvgPath(e.target.value)}
              placeholder="/absolute/path/to/feature.svg"
              className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/40 font-mono"
            />
            <span className="text-[10px] text-zinc-500">Use a real file path (supports `~/...` too).</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">SVG source</span>
            <textarea
              value={svgInput}
              onChange={(e) => setSvgInput(e.target.value)}
              className="w-full h-32 resize-y bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-cyan-500/40"
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Notes (optional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
            />
          </label>

          <div className="rounded-lg border border-zinc-700/70 bg-zinc-900/70 p-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">
              Existing Registry IDs ({category})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {existingInCategory.length ? (
                existingInCategory.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFeatureId(id)}
                    className="px-2 py-1 rounded-md bg-zinc-800 text-zinc-300 text-[11px] border border-zinc-700 hover:border-cyan-500/40 hover:text-cyan-200"
                  >
                    {id}
                  </button>
                ))
              ) : (
                <span className="text-xs text-zinc-500">No saved entries yet.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-5">
        <div className="min-w-0 rounded-lg border border-zinc-700/80 bg-zinc-950/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-300 font-medium">Registry JSON</span>
            <CopyButton content={generatedJson} className="h-7 px-2 text-xs" />
          </div>
          <pre className="text-[11px] text-cyan-100/90 overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {generatedJson || 'Paste SVG to generate JSON.'}
          </pre>
        </div>
        <div className="min-w-0 rounded-lg border border-zinc-700/80 bg-zinc-950/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-300 font-medium">CLI Add Command</span>
            <CopyButton content={generatedCliCommand} className="h-7 px-2 text-xs" />
          </div>
          <pre className="text-[11px] text-sky-100/90 overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto mb-3">
            {generatedCliCommand}
          </pre>
        </div>
        <div className="min-w-0 rounded-lg border border-zinc-700/80 bg-zinc-950/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-300 font-medium">TypeScript Snippet</span>
            <CopyButton content={generatedTs} className="h-7 px-2 text-xs" />
          </div>
          <pre className="text-[11px] text-emerald-100/90 overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {generatedTs || 'Paste SVG to generate TS snippet.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
