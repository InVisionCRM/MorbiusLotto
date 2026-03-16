'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import AvatarPreview, { type Emotion } from './AvatarPreview';
import AvatarControls from './AvatarControls';
import { motion } from 'framer-motion';
import { Palette, Scissors, Eye, Smile, Sparkles, Flag, Shirt, Image as ImageIcon, Glasses } from 'lucide-react';

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  skinColor: '#F1C27D',
  hairStyle: 'Short',
  hairColor: '#3B3024',
  eyeShape: 'Almond',
  eyeColor: '#5c4033',
  noseShape: 'Small',
  lipShape: 'Smile',
  accessory: 'None',
  flag: '🇺🇸',
  shirtColor: '#3f3f46',
  hat: 'None',
  necklace: 'None',
  mouthAccessory: 'None',
  backgroundImage: '',
};

const tabs = [
  { id: 'skin', label: 'Skin', icon: Palette },
  { id: 'bg', label: 'Token Avatar', icon: ImageIcon },
  { id: 'hair', label: 'Hair', icon: Scissors },
  { id: 'eyes', label: 'Eyes', icon: Eye },
  { id: 'face', label: 'Face', icon: Smile },
  { id: 'clothes', label: 'Clothes', icon: Shirt },
  { id: 'acc', label: 'Extras', icon: Sparkles },
  { id: 'flag', label: 'Flag', icon: Flag },
];

type CharacterCreatorProps = {
  /** Controlled: pass config and onChange to own the state in parent (e.g. modal). */
  config?: AvatarConfig;
  onChange?: (c: AvatarConfig) => void;
  /** Uncontrolled: initial config when not using controlled mode. */
  initialConfig?: AvatarConfig;
  /** When provided, show editable display name instead of static "Player Profile". */
  displayName?: string;
  onDisplayNameChange?: (value: string) => void;
  /** Tighter layout for modals (smaller avatar, tabs, and controls). */
  compact?: boolean;
};

export default function CharacterCreator({ config: controlledConfig, onChange, initialConfig, displayName, onDisplayNameChange, compact = false }: CharacterCreatorProps) {
  const [internalConfig, setInternalConfig] = useState<AvatarConfig>(initialConfig ?? DEFAULT_AVATAR_CONFIG);
  const config = controlledConfig ?? internalConfig;
  const setConfig = onChange ?? setInternalConfig;

  useEffect(() => {
    if (initialConfig != null && !onChange) {
      setInternalConfig(initialConfig);
    }
  }, [initialConfig, onChange]);

  const [activeTab, setActiveTab] = useState('skin');
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [glassesAnimationKey, setGlassesAnimationKey] = useState(0);
  const emotionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playEmotion = (emo: Emotion) => {
    setEmotion(emo);
    if (emotionTimeoutRef.current) clearTimeout(emotionTimeoutRef.current);
    const duration = emo === 'wink' ? 350 : 2000;
    emotionTimeoutRef.current = setTimeout(() => setEmotion('neutral'), duration);
  };

  const handleDealWithIt = () => {
    setConfig({ ...config, accessory: 'Sunglasses' });
    setGlassesAnimationKey(prev => prev + 1);
  };

  return (
    <div className="flex flex-col w-full min-h-0 flex-1">
      {/* Tabs: 44px min touch target, horizontal scroll on mobile */}
      <div className={`w-full border-b border-zinc-800 bg-zinc-900/80 overflow-x-auto overflow-y-hidden scrollbar-hide shrink-0 ${compact ? 'p-2' : 'p-4'}`}>
        <div className="flex space-x-1.5 max-w-full md:justify-center min-h-[44px] items-center">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center space-x-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[44px] touch-manipulation ${compact ? 'px-3 py-2.5' : 'px-4 py-2.5 rounded-xl text-sm'} ${isActive ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className={`absolute inset-0 bg-zinc-800 shadow-sm ${compact ? 'rounded-lg' : 'rounded-xl'}`}
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center space-x-1.5">
                  <Icon size={compact ? 14 : 16} />
                  <span>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Left: avatar + name + Shades + emotions */}
        <div className={`w-full md:w-2/5 bg-zinc-800/50 flex flex-col items-center justify-center relative border-b md:border-b-0 md:border-r border-zinc-800 shrink-0 ${compact ? 'p-3' : 'p-8'}`}>
          {displayName !== undefined && onDisplayNameChange ? (
            <input
              type="text"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="Your name"
              maxLength={32}
              className={`font-bold text-zinc-100 tracking-tight w-full max-w-[200px] text-center bg-transparent border-b-2 border-zinc-600 hover:border-zinc-500 focus:border-cyan-500 focus:outline-none placeholder:text-zinc-500 pb-1 transition-colors touch-manipulation ${compact ? 'text-base sm:text-lg mb-2 md:mb-3' : 'text-2xl mb-8'}`}
            />
          ) : (
            <h1 className={`font-bold text-zinc-100 tracking-tight ${compact ? 'text-base sm:text-lg mb-2 md:mb-3' : 'text-2xl mb-8'}`}>Player Profile</h1>
          )}
          <AvatarPreview config={config} emotion={emotion} glassesAnimationKey={glassesAnimationKey} className={compact ? 'w-20 h-20 sm:w-28 sm:h-28' : undefined} />

          <div className={`text-center w-full ${compact ? 'mt-2 md:mt-3' : 'mt-8'}`}>
            <button
              onClick={handleDealWithIt}
              className={`mx-auto flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg font-medium transition-colors shadow-sm border border-zinc-700 hover:border-zinc-600 touch-manipulation min-h-[44px] ${compact ? 'mb-2 md:mb-3 px-3 py-2 text-xs' : 'mb-6 px-4 py-2 rounded-xl'}`}
            >
              <Glasses size={compact ? 12 : 16} />
              Shades
            </button>
            <p className={`text-zinc-400 ${compact ? 'text-xs mb-1 md:mb-2' : 'text-sm mb-4'}`}>Test Emotions</p>
            <div className="flex justify-center gap-1.5 flex-wrap">
              {(['happy', 'sad', 'angry', 'surprised', 'wink'] as Emotion[]).map((emo) => (
                <button
                  key={emo}
                  onClick={() => playEmotion(emo)}
                  className={`rounded-lg font-medium capitalize transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center ${compact ? 'px-2 text-[10px] sm:text-xs' : 'px-3 py-1.5 text-xs'} ${emotion === emo ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                >
                  {emo}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`w-full md:w-3/5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${compact ? 'p-3' : 'p-6 sm:p-8'}`}>
          <AvatarControls config={config} onChange={setConfig} activeTab={activeTab} compact={compact} />
        </div>
      </div>
    </div>
  );
}
