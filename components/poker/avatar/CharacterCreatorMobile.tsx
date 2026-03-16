'use client';

import React, { useState, useRef } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import AvatarPreview, { type Emotion } from './AvatarPreview';
import PixelBackgroundUploader from './PixelBackgroundUploader';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette, Scissors, Eye, Smile, Sparkles, Shirt,
  Image as ImageIcon, Glasses, ChevronLeft, ChevronRight,
} from 'lucide-react';

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
const EyeShapes = ['Round', 'Almond', 'Narrow', 'Wide'];
const NoseShapes = ['Small', 'Wide', 'Pointy', 'Button'];
const LipShapes = ['Thin', 'Full', 'Smile', 'Smirk', 'Pout'];
const Accessories = ['None', 'Glasses', 'Sunglasses', 'Aviators', 'Wayfarers', 'Round Glasses', 'Cyberpunk', 'Earrings', 'Headband'];
const Hats = ['None', 'Cap', 'Beanie', 'Top Hat', 'Cowboy', 'Crown', 'Bandana'];
const Necklaces = ['None', 'Gold Chain', 'Silver Chain', 'Pearl', 'Pendant'];
const MouthAccessories = ['None', 'Cigar', 'Cigarette', 'Pipe', 'Bubblegum', 'Medical Mask'];

// ── tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'skin',    label: 'Skin',    icon: Palette },
  { id: 'bg',      label: 'Token',   icon: ImageIcon },
  { id: 'hair',    label: 'Hair',    icon: Scissors },
  { id: 'eyes',    label: 'Eyes',    icon: Eye },
  { id: 'face',    label: 'Face',    icon: Smile },
  { id: 'clothes', label: 'Shirt',   icon: Shirt },
  { id: 'acc',     label: 'Extras',  icon: Sparkles },
] as const;

const TAB_IDS = TABS.map(t => t.id);

// ── component ─────────────────────────────────────────────────────────────────

type Props = {
  config: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  displayName?: string;
  onDisplayNameChange?: (v: string) => void;
};

export default function CharacterCreatorMobile({ config, onChange, displayName, onDisplayNameChange }: Props) {
  const [activeTab, setActiveTab] = useState<string>('skin');
  const [slideDir, setSlideDir] = useState(0);
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [glassesAnimationKey, setGlassesAnimationKey] = useState(0);
  const emotionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);
  const pillBarRef = useRef<HTMLDivElement>(null);

  const goToTab = (id: string) => {
    const cur = TAB_IDS.indexOf(activeTab as typeof TAB_IDS[number]);
    const next = TAB_IDS.indexOf(id as typeof TAB_IDS[number]);
    setSlideDir(next > cur ? 1 : -1);
    setActiveTab(id);
    // Scroll the pill into view
    setTimeout(() => {
      const el = pillBarRef.current?.querySelector(`[data-tab="${id}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 0);
  };

  const stepTab = (dir: 1 | -1) => {
    const idx = TAB_IDS.indexOf(activeTab as typeof TAB_IDS[number]);
    const next = idx + dir;
    if (next >= 0 && next < TAB_IDS.length) goToTab(TAB_IDS[next]);
  };

  const playEmotion = (emo: Emotion) => {
    setEmotion(emo);
    if (emotionTimer.current) clearTimeout(emotionTimer.current);
    emotionTimer.current = setTimeout(() => setEmotion('neutral'), emo === 'wink' ? 350 : 2000);
  };

  const handleDealWithIt = () => {
    onChange({ ...config, accessory: 'Sunglasses' });
    setGlassesAnimationKey(k => k + 1);
  };

  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 48) stepTab(dx > 0 ? 1 : -1);
    touchStartX.current = null;
  };

  // ── render helpers ───────────────────────────────────────────────────────

  const ColorGrid = ({ colors, active, field }: { colors: string[]; active: string; field: keyof AvatarConfig }) => (
    <div className="grid grid-cols-5 gap-3">
      {colors.map(c => (
        <button
          key={c}
          onClick={() => update(field, c)}
          aria-label={`Select ${c}`}
          className={`aspect-square rounded-full overflow-hidden touch-manipulation transition-transform
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

  const ShapeGrid = ({ shapes, active, field }: { shapes: string[]; active: string; field: keyof AvatarConfig }) => (
    <div className="grid grid-cols-2 gap-2.5">
      {shapes.map(s => (
        <button
          key={s}
          onClick={() => update(field, s)}
          className={`py-3.5 px-3 rounded-xl font-medium text-sm touch-manipulation min-h-[52px] transition-colors
            ${active === s ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-zinc-800 text-zinc-300 active:bg-zinc-700'}`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{children}</h3>
  );

  const curTabIdx = TAB_IDS.indexOf(activeTab as typeof TAB_IDS[number]);

  return (
    <div className="flex flex-col h-full bg-zinc-900">

      {/* ── Avatar Zone ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col items-center px-4 pt-3 pb-3 gap-3">
        {/* Name input */}
        {displayName !== undefined && onDisplayNameChange ? (
          <input
            type="text"
            value={displayName}
            onChange={e => onDisplayNameChange(e.target.value)}
            placeholder="Your name"
            maxLength={32}
            className="text-lg font-bold text-zinc-100 w-full max-w-[220px] text-center bg-transparent border-b-2 border-zinc-700 focus:border-cyan-500 focus:outline-none placeholder:text-zinc-600 pb-1 touch-manipulation"
          />
        ) : (
          <p className="text-lg font-bold text-zinc-100">Player Profile</p>
        )}

        {/* Avatar + controls row */}
        <div className="flex items-center gap-5 w-full justify-center">
          {/* Avatar */}
          <AvatarPreview
            config={config}
            emotion={emotion}
            glassesAnimationKey={glassesAnimationKey}
            className="w-32 h-32 flex-shrink-0"
          />

          {/* Right column: shades + emotions */}
          <div className="flex flex-col gap-2 min-w-0">
            <button
              onClick={handleDealWithIt}
              className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-xs font-medium touch-manipulation active:bg-zinc-700"
            >
              <Glasses size={13} />
              Shades
            </button>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Emotions</p>
            <div className="flex flex-wrap gap-1">
              {(['happy', 'sad', 'angry', 'surprised', 'wink'] as Emotion[]).map(emo => (
                <button
                  key={emo}
                  onClick={() => playEmotion(emo)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium capitalize touch-manipulation min-h-[28px] transition-colors
                    ${emotion === emo ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'}`}
                >
                  {emo}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Category Pill Bar ─────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
        <div
          ref={pillBarRef}
          className="flex gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-hide"
        >
          {TABS.map((tab, i) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                onClick={() => goToTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap touch-manipulation transition-all min-h-[40px] flex-shrink-0
                  ${isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                    : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'}`}
              >
                <Icon size={13} />
                {tab.label}
                {isActive && (
                  <span className="absolute -bottom-[11px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500" />
                )}
              </button>
            );
          })}
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-zinc-800 mx-3 mb-1 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-indigo-600 rounded-full"
            animate={{ width: `${((curTabIdx + 1) / TAB_IDS.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>
      </div>

      {/* ── Options Panel ─────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: slideDir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDir * -40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="p-4 space-y-6 pb-6"
          >
            {activeTab === 'skin' && (
              <section>
                <SectionLabel>Skin Tone</SectionLabel>
                <ColorGrid colors={SkinColors} active={config.skinColor} field="skinColor" />
              </section>
            )}

            {activeTab === 'hair' && (
              <>
                <section>
                  <SectionLabel>Hair Style</SectionLabel>
                  <ShapeGrid shapes={HairStyles} active={config.hairStyle} field="hairStyle" />
                </section>
                <section>
                  <SectionLabel>Hair Color</SectionLabel>
                  <ColorGrid colors={HairColors} active={config.hairColor} field="hairColor" />
                </section>
              </>
            )}

            {activeTab === 'eyes' && (
              <>
                <section>
                  <SectionLabel>Eye Shape</SectionLabel>
                  <ShapeGrid shapes={EyeShapes} active={config.eyeShape} field="eyeShape" />
                </section>
                <section>
                  <SectionLabel>Eye Color</SectionLabel>
                  <ColorGrid colors={EyeColors} active={config.eyeColor} field="eyeColor" />
                </section>
              </>
            )}

            {activeTab === 'face' && (
              <>
                <section>
                  <SectionLabel>Nose</SectionLabel>
                  <ShapeGrid shapes={NoseShapes} active={config.noseShape} field="noseShape" />
                </section>
                <section>
                  <SectionLabel>Lips</SectionLabel>
                  <ShapeGrid shapes={LipShapes} active={config.lipShape} field="lipShape" />
                </section>
              </>
            )}

            {activeTab === 'clothes' && (
              <section>
                <SectionLabel>Shirt Color</SectionLabel>
                <ColorGrid colors={ShirtColors} active={config.shirtColor} field="shirtColor" />
              </section>
            )}

            {activeTab === 'acc' && (
              <>
                <section>
                  <SectionLabel>Glasses & Earrings</SectionLabel>
                  <ShapeGrid shapes={Accessories} active={config.accessory} field="accessory" />
                </section>
                <section>
                  <SectionLabel>Hats</SectionLabel>
                  <ShapeGrid shapes={Hats} active={config.hat} field="hat" />
                </section>
                <section>
                  <SectionLabel>Necklaces</SectionLabel>
                  <ShapeGrid shapes={Necklaces} active={config.necklace} field="necklace" />
                </section>
                <section>
                  <SectionLabel>Mouth</SectionLabel>
                  <ShapeGrid shapes={MouthAccessories} active={config.mouthAccessory} field="mouthAccessory" />
                </section>
              </>
            )}

            {activeTab === 'bg' && (
              <section>
                <SectionLabel>Token Avatar Background</SectionLabel>
                <PixelBackgroundUploader
                  currentImage={config.backgroundImage}
                  onImageChange={url => update('backgroundImage', url)}
                />
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Prev / Next footer ────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between px-4 py-2">
        <button
          onClick={() => stepTab(-1)}
          disabled={curTabIdx === 0}
          className="flex items-center gap-1 text-xs font-medium text-zinc-400 disabled:text-zinc-700 touch-manipulation py-2 pr-3 min-h-[44px]"
        >
          <ChevronLeft size={16} />
          {curTabIdx > 0 ? TABS[curTabIdx - 1].label : ''}
        </button>
        <span className="text-xs text-zinc-600 font-medium">
          {curTabIdx + 1} / {TAB_IDS.length}
        </span>
        <button
          onClick={() => stepTab(1)}
          disabled={curTabIdx === TAB_IDS.length - 1}
          className="flex items-center gap-1 text-xs font-medium text-zinc-400 disabled:text-zinc-700 touch-manipulation py-2 pl-3 min-h-[44px]"
        >
          {curTabIdx < TAB_IDS.length - 1 ? TABS[curTabIdx + 1].label : ''}
          <ChevronRight size={16} />
        </button>
      </div>

    </div>
  );
}
