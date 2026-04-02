import { AVATAR_VIEWBOX_H, AVATAR_VIEWBOX_W } from './avatar-viewbox';
import { GENERATED_AVATAR_FEATURES } from './avatar-feature-registry.generated';

export type AvatarFeatureCategory = 'mouth' | 'nose' | 'hair';
export type AvatarFeatureAnchor = 'center' | 'top-left';

export type AvatarFeaturePlacement = {
  /** Source-canvas coordinates (400x600 basis by default). */
  x: number;
  y: number;
  /** Uniform scale in source space. */
  scale: number;
  /** Rotation degrees around anchor pivot. */
  rotation: number;
  /** Draw order hint for external tooling. */
  zIndex: number;
  /** Placement anchor for x/y. */
  anchor: AvatarFeatureAnchor;
};

export type AvatarFeatureDefinition = {
  id: string;
  category: AvatarFeatureCategory;
  sourceViewBox: {
    width: number;
    height: number;
  };
  /** Raw inner SVG markup (children of <svg>). */
  svgMarkup: string;
  placement: AvatarFeaturePlacement;
  notes?: string;
};

export const AVATAR_FEATURE_SOURCE_CANVAS = {
  width: 400,
  height: 600,
} as const;

export const AVATAR_FEATURE_REGISTRY: Record<
  AvatarFeatureCategory,
  Record<string, AvatarFeatureDefinition>
> = {
  mouth: {
    facesjs_mouth_02: {
      id: 'facesjs_mouth_02',
      category: 'mouth',
      sourceViewBox: { width: 400, height: 600 },
      svgMarkup: `<style>
		.lips { opacity: 0.05;mix-blend-mode: multiply;fill: #501414 }
		.teeth { fill: #ffffff }
		.stroke { fill: none;stroke: #000000;stroke-width: 4 }
		.thin-stroke { fill: none;stroke: #000000;stroke-width: 1 }
	</style>
	<g id="mouth-02">
		<path id="color" class="lips" d="M167 382C167 382 177 373.14 200 373C216.67 372.9 234 382 234 382C234 382 222.67 403.31 200 404C177.68 404.68 167 382 167 382Z" />
		<path id="teeth" class="teeth" d="M176 384C176 384 190 380 200 380C210 380 224 384 224 384C224 384 216 392 200 392C184 392 176 384 176 384Z" />
		<path id="stroke" class="stroke" d="M176 384C176 384 190 380 200 380C210 380 224 384 224 384C224 384 216 392 200 392C184 392 176 384 176 384Z" />
		<path id="Shape 1" class="thin-stroke" d="M180 376C196 372 204 372 220 376" />
		<path id="Shape 2" class="stroke" d="M166 382C166 382 171 385.19 176 384M234 382C234 382 229 385.19 224 384" />
		<path id="Shape 3" class="thin-stroke" d="M185.71 400.69C200.86 404.83 202 404.55 214.86 400.12" />
	</g>`,
      placement: {
        x: 200,
        y: 300,
        scale: 1,
        rotation: 0,
        zIndex: 10,
        anchor: 'center',
      },
      notes: 'Imported from facesjs svgs/mouth/mouth2.svg (400x600 source space).',
    },
  },
  nose: {},
  hair: {},
};

for (const feature of GENERATED_AVATAR_FEATURES) {
  AVATAR_FEATURE_REGISTRY[feature.category][feature.id] = feature;
}

export function getAvatarFeature(
  category: AvatarFeatureCategory,
  id: string | null | undefined,
): AvatarFeatureDefinition | null {
  if (!id) return null;
  const clean = id.trim();
  if (!clean) return null;
  return AVATAR_FEATURE_REGISTRY[category][clean] ?? null;
}

export function sourcePlacementToAvatarGeometry(def: AvatarFeatureDefinition) {
  const sx = AVATAR_VIEWBOX_W / AVATAR_FEATURE_SOURCE_CANVAS.width;
  const sy = AVATAR_VIEWBOX_H / AVATAR_FEATURE_SOURCE_CANVAS.height;
  const width = def.sourceViewBox.width * sx * def.placement.scale;
  const height = def.sourceViewBox.height * sy * def.placement.scale;
  let x = def.placement.x * sx;
  let y = def.placement.y * sy;
  if (def.placement.anchor === 'center') {
    x -= width / 2;
    y -= height / 2;
  }
  return {
    x,
    y,
    width,
    height,
    pivotX: x + width / 2,
    pivotY: y + height / 2,
    rotation: def.placement.rotation,
  };
}
