'use client';

import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import AvatarPreview from './AvatarPreview';
import PixelBackgroundUploader from './PixelBackgroundUploader';

// ── data ──────────────────────────────────────────────────────────────────────

const SkinColors = [
  '#FFF5EE', '#FFE4E1', '#FFDAB9', '#FFCDB2', '#FFB4A2', '#FFDBAC', '#F1C27D', '#E0AC69', '#C68642',
  '#8D5524', '#7B4B2A', '#5C3A21', '#4A3B32', '#3E2723', '#2D221E', '#1A1110', '#E5989B', '#B5838D',
  '#6D6875', '#4A4E69', '#22223B', '#39FF14', '#88CCFF', '#FF0000', '#8A2BE2', '#FF69B4', '#FFD700',
  '#C0C0C0', '#556B2F', '#E0FFFF', '#FF4500', '#FF00FF', '#00FFFF', '#FFFF00', '#000080', '#7FFF00',
  '#FFC0CB', '#F8F8FF', '#050505',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const HairColors = [
  '#090806', '#2C222B', '#71635A', '#B7A69E', '#D6C4C2', '#CABFB1', '#DCD0BA', '#FFF5E1', '#E6CEA8',
  '#E5C8A8', '#DEBC99', '#B89778', '#A56B46', '#B55239', '#8D4A43', '#91553D', '#533D32', '#3B3024',
  '#554838', '#4E433F', '#504444', '#6A4E42', '#A7856A', '#977961', '#E11D48', '#2563EB', '#16A34A', '#9333EA',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const EyeColors = [
  '#634e34', '#2e536f', '#3d671d', '#1c7847', '#497665',
  '#000000', '#5c4033', '#8a9a5b', '#4682b4', '#8B5CF6', '#F43F5E',
];
const ShirtColors = [
  '#ef4444', '#b91c1c', '#7f1d1d', '#f97316', '#c2410c',
  '#eab308', '#a16207', '#22c55e', '#15803d', '#14532d',
  '#10b981', '#3b82f6', '#1d4ed8', '#1e3a8a', '#06b6d4',
  '#a855f7', '#7e22ce', '#4c1d95', '#d946ef', '#ec4899',
  '#be185d', '#ffffff', '#9ca3af', '#3f3f46', '#000000',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];

const HairStyles = ['Bald', 'Short', 'Buzz', 'Fade', 'Long Straight', 'Long Wavy', 'Ponytail', 'Curly', 'Spiky', 'Bob', 'Mohawk', 'Dreadlocks', 'Afro', 'Mullet', 'Pigtails', 'Messy'];
const FaceShapes = ['Square', 'Round', 'Oval', 'Heart', 'Diamond'];
const EyeShapes = ['Round', 'Almond', 'Narrow', 'Wide'];
const NoseShapes = ['Small', 'Wide', 'Pointy', 'Button'];
const LipShapes = ['Thin', 'Full', 'Smile', 'Smirk', 'Pout'];
const Accessories = ['None', 'Glasses', 'Sunglasses', 'Aviators', 'Wayfarers', 'Round Glasses', 'Cyberpunk', 'Earrings', 'Headband'];
const Hats = ['None', 'Cap', 'Beanie', 'Top Hat', 'Cowboy', 'Crown', 'Bandana'];
const Necklaces = ['None', 'Gold Chain', 'Silver Chain', 'Pearl', 'Pendant'];
const MouthAccessories = ['None', 'Cigar', 'Cigarette', 'Pipe', 'Bubblegum', 'Medical Mask'];

// ── component ─────────────────────────────────────────────────────────────────

type Props = {
  config: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  displayName?: string;
  onDisplayNameChange?: (v: string) => void;
};

export default function CharacterCreatorMobile({ config, onChange, displayName, onDisplayNameChange }: Props) {
  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });

  const skinColors  = config.customPattern ? ['url(#custom)', ...SkinColors]  : SkinColors;
  const hairColors  = config.customPattern ? ['url(#custom)', ...HairColors]  : HairColors;
  const shirtColors = config.customPattern ? ['url(#custom)', ...ShirtColors] : ShirtColors;
  const accessories = config.customPattern ? ['Voxel Glasses', ...Accessories] : Accessories;
  const necklaces   = config.customPattern ? ['Voxel Chain', ...Necklaces]    : Necklaces;

  // ── render helpers ─────────────────────────────────────────────────────────

  const Label = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-4">
      {children}
    </p>
  );

  const Divider = () => <div className="h-px bg-zinc-800/70 mx-4 my-1" />;

  const ColorStrip = ({ colors, active, field }: { colors: string[]; active: string; field: keyof AvatarConfig }) => (
    <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 pb-1">
      {colors.map(c => (
        <button
          key={c}
          onClick={() => update(field, c)}
          aria-label={`Select ${c}`}
          className={`w-11 h-11 flex-shrink-0 rounded-full overflow-hidden touch-manipulation transition-transform
            ${active === c
              ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-900 scale-110'
              : 'ring-1 ring-white/10 active:scale-95'}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
            <rect width="100" height="100" fill={c} />
          </svg>
        </button>
      ))}
    </div>
  );

  const PillStrip = ({ options, active, field }: { options: string[]; active: string; field: keyof AvatarConfig }) => (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-1">
      {options.map(s => (
        <button
          key={s}
          onClick={() => update(field, s)}
          className={`flex-shrink-0 px-4 h-11 rounded-xl text-sm font-medium touch-manipulation transition-colors whitespace-nowrap
            ${active === s
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
              : 'bg-zinc-800 text-zinc-300 active:bg-zinc-700'}`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="py-3">
      <Label>{label}</Label>
      {children}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-zinc-900 min-h-0">

      {/* ── Compact header: avatar + name ─────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
        <AvatarPreview config={config} compact className="w-10 h-10 flex-shrink-0" />
        {displayName !== undefined && onDisplayNameChange ? (
          <input
            type="text"
            value={displayName}
            onChange={e => onDisplayNameChange(e.target.value)}
            placeholder="Display name"
            maxLength={32}
            className="flex-1 text-sm font-semibold text-zinc-100 bg-transparent border-b border-zinc-700 focus:border-cyan-500 focus:outline-none placeholder:text-zinc-600 py-1 touch-manipulation"
          />
        ) : (
          <span className="text-sm font-semibold text-zinc-100">Player Profile</span>
        )}
      </div>

      {/* ── Scrollable feature list ───────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">

        <Section label="Skin Tone">
          <ColorStrip colors={skinColors} active={config.skinColor} field="skinColor" />
        </Section>
        <Divider />

        <Section label="Face Shape">
          <PillStrip options={FaceShapes} active={config.faceShape} field="faceShape" />
        </Section>
        <Divider />

        <Section label="Hair Style">
          <PillStrip options={HairStyles} active={config.hairStyle} field="hairStyle" />
        </Section>
        <Divider />

        <Section label="Hair Color">
          <ColorStrip colors={hairColors} active={config.hairColor} field="hairColor" />
        </Section>
        <Divider />

        <Section label="Eye Shape">
          <PillStrip options={EyeShapes} active={config.eyeShape} field="eyeShape" />
        </Section>
        <Divider />

        <Section label="Eye Color">
          <ColorStrip colors={EyeColors} active={config.eyeColor} field="eyeColor" />
        </Section>
        <Divider />

        <Section label="Nose">
          <PillStrip options={NoseShapes} active={config.noseShape} field="noseShape" />
        </Section>
        <Divider />

        <Section label="Lips">
          <PillStrip options={LipShapes} active={config.lipShape} field="lipShape" />
        </Section>
        <Divider />

        <Section label="Mouth Accessory">
          <PillStrip options={MouthAccessories} active={config.mouthAccessory} field="mouthAccessory" />
        </Section>
        <Divider />

        <Section label="Shirt Color">
          <ColorStrip colors={shirtColors} active={config.shirtColor} field="shirtColor" />
        </Section>
        <Divider />

        <Section label="Glasses & Earrings">
          <PillStrip options={accessories} active={config.accessory} field="accessory" />
        </Section>
        <Divider />

        <Section label="Hat">
          <PillStrip options={Hats} active={config.hat} field="hat" />
        </Section>
        <Divider />

        <Section label="Necklace">
          <PillStrip options={necklaces} active={config.necklace} field="necklace" />
        </Section>
        <Divider />

        <Section label="Custom Background (Voxelizer)">
          <div className="px-4">
            <PixelBackgroundUploader
              currentImage={config.backgroundImage}
              onImageChange={url => onChange({
                ...config,
                backgroundImage: url,
                customPattern: url,
                skinColor: url ? 'url(#custom)' : config.skinColor,
                hairColor: url ? 'url(#custom)' : config.hairColor,
                shirtColor: url ? 'url(#custom)' : config.shirtColor,
              })}
            />
          </div>
        </Section>

        {/* bottom breathing room */}
        <div className="h-4" />
      </div>
    </div>
  );
}
