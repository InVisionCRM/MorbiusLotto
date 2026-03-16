'use client';

import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { motion, AnimatePresence } from 'framer-motion';
import PixelBackgroundUploader from './PixelBackgroundUploader';

const SkinColors = [
  '#FFF5EE', '#FFE4E1', '#FFDAB9', '#FFCDB2', '#FFB4A2', '#FFDBAC', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#7B4B2A', '#5C3A21', '#4A3B32', '#3E2723', '#2D221E', '#1A1110', '#E5989B', '#B5838D', '#6D6875', '#4A4E69', '#22223B',
  '#39FF14', '#88CCFF', '#FF0000', '#8A2BE2', '#FF69B4', '#FFD700', '#C0C0C0', '#556B2F', '#E0FFFF', '#FF4500', '#FF00FF', '#00FFFF', '#FFFF00', '#000080', '#7FFF00', '#FFC0CB', '#F8F8FF', '#050505',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const HairColors = [
  '#090806', '#2C222B', '#71635A', '#B7A69E', '#D6C4C2', '#CABFB1', '#DCD0BA', '#FFF5E1', '#E6CEA8', '#E5C8A8', '#DEBC99', '#B89778', '#A56B46', '#B55239', '#8D4A43', '#91553D', '#533D32', '#3B3024', '#554838', '#4E433F', '#504444', '#6A4E42', '#A7856A', '#977961', '#E11D48', '#2563EB', '#16A34A', '#9333EA',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const EyeColors = ['#634e34', '#2e536f', '#3d671d', '#1c7847', '#497665', '#000000', '#5c4033', '#8a9a5b', '#4682b4', '#8B5CF6', '#F43F5E'];
const ShirtColors = [
  '#ef4444', '#b91c1c', '#7f1d1d', '#f97316', '#c2410c',
  '#eab308', '#a16207', '#22c55e', '#15803d', '#14532d',
  '#10b981', '#3b82f6', '#1d4ed8', '#1e3a8a', '#06b6d4',
  '#a855f7', '#7e22ce', '#4c1d95', '#d946ef', '#ec4899',
  '#be185d', '#ffffff', '#9ca3af', '#3f3f46', '#000000',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];

const HairStyles = ['Bald', 'Short', 'Buzz', 'Fade', 'Long Straight', 'Long Wavy', 'Ponytail', 'Curly', 'Spiky', 'Bob', 'Mohawk', 'Dreadlocks', 'Afro', 'Mullet', 'Pigtails', 'Messy'];
const FaceShapes = ['Square', 'Round', 'Oval', 'Heart', 'Diamond', 'Triangle', 'Inverted Triangle', 'Long', 'Wide', 'Slim'];
const EyeShapes = ['Round', 'Almond', 'Narrow', 'Wide'];
const NoseShapes = ['Small', 'Wide', 'Pointy', 'Button'];
const LipShapes = ['Thin', 'Full', 'Smile', 'Smirk', 'Pout'];
const Accessories = ['None', 'Glasses', 'Sunglasses', 'Aviators', 'Wayfarers', 'Round Glasses', 'Cyberpunk', 'Earrings', 'Headband'];
const Hats = ['None', 'Cap', 'Beanie', 'Top Hat', 'Cowboy', 'Crown', 'Bandana'];
const Necklaces = ['None', 'Gold Chain', 'Silver Chain', 'Pearl', 'Pendant'];
const MouthAccessories = ['None', 'Cigar', 'Cigarette', 'Pipe', 'Bubblegum', 'Medical Mask'];

export default function AvatarControls({ config, onChange, activeTab, compact = false }: { config: AvatarConfig; onChange: (c: AvatarConfig) => void; activeTab: string; compact?: boolean }) {
  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });

  const skinColors   = config.customPattern ? ['url(#custom)', ...SkinColors]  : SkinColors;
  const hairColors   = config.customPattern ? ['url(#custom)', ...HairColors]  : HairColors;
  const shirtColors  = config.customPattern ? ['url(#custom)', ...ShirtColors] : ShirtColors;
  const accessories  = config.customPattern ? ['Voxel Glasses', ...Accessories] : Accessories;
  const necklaces    = config.customPattern ? ['Voxel Chain', ...Necklaces]    : Necklaces;

  const renderColorGrid = (colors: string[], activeColor: string, key: keyof AvatarConfig) => (
    <div className={`grid grid-cols-6 sm:grid-cols-7 ${compact ? 'gap-2' : 'gap-3'}`}>
      {colors.map(c => (
        <button
          key={c}
          className={`rounded-full shadow-sm transition-transform hover:scale-110 focus:outline-none overflow-hidden flex items-center justify-center touch-manipulation ${compact ? 'min-w-[44px] min-h-[44px] w-11 h-11 ring-offset-1 ring-offset-zinc-900' : 'w-10 h-10 ring-offset-2 ring-offset-zinc-900'} ${activeColor === c ? 'ring-2 ring-indigo-500 scale-110' : 'ring-1 ring-white/10'}`}
          onClick={() => update(key, c)}
          aria-label={`Select color ${c}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
            <rect width="100" height="100" fill={c} />
          </svg>
        </button>
      ))}
    </div>
  );

  const renderShapeGrid = (shapes: string[], activeShape: string, key: keyof AvatarConfig) => (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${compact ? 'gap-2' : 'gap-3'}`}>
      {shapes.map(s => (
        <button
          key={s}
          className={`rounded-lg font-medium transition-all touch-manipulation min-h-[44px] ${compact ? 'py-2.5 px-3 text-xs' : 'py-3 px-4 rounded-xl text-sm'} ${activeShape === s ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'}`}
          onClick={() => update(key, s)}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <h3 className={`font-semibold text-zinc-400 uppercase tracking-wider ${compact ? 'text-xs mb-2' : 'text-sm mb-4'}`}>{children}</h3>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={compact ? 'space-y-4' : 'space-y-8'}
          >
            {activeTab === 'skin' && (
              <section>
                <SectionLabel>Skin Tone</SectionLabel>
                {renderColorGrid(skinColors, config.skinColor, 'skinColor')}
              </section>
            )}

            {activeTab === 'hair' && (
              <>
                <section>
                  <SectionLabel>Hair Style</SectionLabel>
                  {renderShapeGrid(HairStyles, config.hairStyle, 'hairStyle')}
                </section>
                <section>
                  <SectionLabel>Hair Color</SectionLabel>
                  {renderColorGrid(hairColors, config.hairColor, 'hairColor')}
                </section>
              </>
            )}

            {activeTab === 'eyes' && (
              <>
                <section>
                  <SectionLabel>Eye Shape</SectionLabel>
                  {renderShapeGrid(EyeShapes, config.eyeShape, 'eyeShape')}
                </section>
                <section>
                  <SectionLabel>Eye Color</SectionLabel>
                  {renderColorGrid(EyeColors, config.eyeColor, 'eyeColor')}
                </section>
              </>
            )}

            {activeTab === 'face' && (
              <>
                <section>
                  <SectionLabel>Face Shape</SectionLabel>
                  {renderShapeGrid(FaceShapes, config.faceShape, 'faceShape')}
                </section>
                <section>
                  <SectionLabel>Nose</SectionLabel>
                  {renderShapeGrid(NoseShapes, config.noseShape, 'noseShape')}
                </section>
                <section>
                  <SectionLabel>Lips</SectionLabel>
                  {renderShapeGrid(LipShapes, config.lipShape, 'lipShape')}
                </section>
                <section>
                  <SectionLabel>Mouth Accessory</SectionLabel>
                  {renderShapeGrid(MouthAccessories, config.mouthAccessory, 'mouthAccessory')}
                </section>
              </>
            )}

            {activeTab === 'clothes' && (
              <section>
                <SectionLabel>Shirt Color</SectionLabel>
                {renderColorGrid(shirtColors, config.shirtColor, 'shirtColor')}
              </section>
            )}

            {activeTab === 'acc' && (
              <>
                <section>
                  <SectionLabel>Glasses & Earrings</SectionLabel>
                  {renderShapeGrid(accessories, config.accessory, 'accessory')}
                </section>
                <section>
                  <SectionLabel>Hats</SectionLabel>
                  {renderShapeGrid(Hats, config.hat, 'hat')}
                </section>
                <section>
                  <SectionLabel>Necklaces</SectionLabel>
                  {renderShapeGrid(necklaces, config.necklace, 'necklace')}
                </section>
              </>
            )}

            {activeTab === 'bg' && (
              <section>
                <SectionLabel>Custom Background (Voxelizer)</SectionLabel>
                <PixelBackgroundUploader
                  currentImage={config.backgroundImage}
                  onImageChange={(dataUrl) => {
                    onChange({
                      ...config,
                      backgroundImage: dataUrl,
                      customPattern: dataUrl,
                      skinColor: dataUrl ? 'url(#custom)' : config.skinColor,
                      hairColor: dataUrl ? 'url(#custom)' : config.hairColor,
                      shirtColor: dataUrl ? 'url(#custom)' : config.shirtColor,
                    });
                  }}
                />
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
