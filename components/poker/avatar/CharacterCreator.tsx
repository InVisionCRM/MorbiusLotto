'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import AvatarPreview, { type Emotion } from './AvatarPreview';
import AvatarControls from './AvatarControls';
import CharacterCreatorMobile from './CharacterCreatorMobile';
import { motion } from 'framer-motion';
import { Palette, Scissors, Eye, Smile, Sparkles, Shirt, Image as ImageIcon, Glasses } from 'lucide-react';

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  skinColor: '#F1C27D',
  hairStyle: 'Short',
  hairColor: '#3B3024',
  eyeShape: 'Almond',
  eyeColor: '#5c4033',
  noseShape: 'Small',
  lipShape: 'Smile',
  accessory: 'None',
  shirtColor: '#3f3f46',
  hat: 'None',
  necklace: 'None',
  mouthAccessory: 'None',
  backgroundImage: '',
  overlayImage: '',
  faceShape: 'Square',
  customPattern: '',
};

const tabs = [
  { id: 'skin', label: 'Skin', icon: Palette },
  { id: 'hair', label: 'Hair', icon: Scissors },
  { id: 'eyes', label: 'Eyes', icon: Eye },
  { id: 'face', label: 'Face', icon: Smile },
  { id: 'clothes', label: 'Clothes', icon: Shirt },
  { id: 'acc', label: 'Extras', icon: Sparkles },
  { id: 'bg', label: 'Backgrounds', icon: ImageIcon },
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
  /** Item keys the player owns — passed through to AvatarControls for lock indicators. */
  ownedItems?: Set<string>;
  /** Admin wallets bypass all cosmetics locks. */
  isAdmin?: boolean;
  /** Called when user clicks a locked item — opens the purchase sheet in the parent. */
  onLockedItemClick?: (itemKey: string) => void;
};

export default function CharacterCreator({ config: controlledConfig, onChange, initialConfig, displayName, onDisplayNameChange, compact = false, ownedItems, isAdmin = false, onLockedItemClick }: CharacterCreatorProps) {
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
    const isOn = config.accessory === 'Sunglasses';
    setConfig({ ...config, accessory: isOn ? 'None' : 'Sunglasses' });
    if (!isOn) setGlassesAnimationKey(prev => prev + 1);
  };

  return (
    <div className="flex flex-col w-full min-h-0 flex-1">
      {/* Mobile-only layout */}
      <div className="md:hidden flex flex-col h-full">
        <CharacterCreatorMobile
          config={config}
          onChange={setConfig}
          displayName={displayName}
          onDisplayNameChange={onDisplayNameChange}
          ownedItems={ownedItems}
          isAdmin={isAdmin}
          onLockedItemClick={onLockedItemClick}
        />
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex flex-col w-full min-h-0 flex-1">
      {/* Tabs */}
      <div className={`w-full border-b border-zinc-800 bg-zinc-900/80 overflow-x-auto overflow-y-hidden scrollbar-hide shrink-0 ${compact ? 'px-2 py-1' : 'p-4'}`}>
        <div className={`flex max-w-full md:justify-center items-center ${compact ? 'space-x-0.5' : 'space-x-1.5'}`}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center rounded-md font-medium transition-colors whitespace-nowrap shrink-0 touch-manipulation ${compact ? 'space-x-1 px-2.5 py-1.5 text-[11px]' : 'space-x-1.5 px-4 py-2.5 rounded-xl text-sm min-h-[44px]'} ${isActive ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute inset-0 bg-zinc-800 shadow-sm rounded-md"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center space-x-1">
                  <Icon size={compact ? 12 : 16} />
                  <span>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* On mobile: flex-col-reverse so options appear directly under tabs. On md: avatar left, controls right. */}
      <div className="flex flex-col-reverse md:flex-row flex-1 min-h-0">
        {/* Left (desktop) / Bottom (mobile): avatar + name + Shades + emotions */}
        <div className={`w-full md:w-2/5 bg-zinc-800/50 flex flex-col items-center justify-center relative border-b md:border-b-0 md:border-r border-zinc-800 shrink-0 ${compact ? 'p-3 gap-2' : 'p-8'}`}>
          {displayName !== undefined && onDisplayNameChange ? (
            <input
              type="text"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="Your name"
              maxLength={32}
              className={`font-semibold text-zinc-100 tracking-tight w-full max-w-[200px] text-center bg-transparent border-b border-zinc-600 hover:border-zinc-500 focus:border-cyan-500 focus:outline-none placeholder:text-zinc-500 pb-0.5 transition-colors touch-manipulation ${compact ? 'text-sm' : 'text-2xl mb-8'}`}
            />
          ) : (
            <h1 className={`font-bold text-zinc-100 tracking-tight ${compact ? 'text-sm' : 'text-2xl mb-8'}`}>Player Profile</h1>
          )}
          <AvatarPreview config={config} emotion={emotion} glassesAnimationKey={glassesAnimationKey} className={compact ? 'w-36 sm:w-44 aspect-[6/7]' : undefined} />

          <div className={`w-full ${compact ? '' : 'mt-8 text-center'}`}>
            {compact ? (
              <div className="flex justify-center items-center gap-1 flex-wrap">
                <button
                  onClick={handleDealWithIt}
                  className={`flex items-center justify-center gap-1 rounded-md font-medium transition-colors border touch-manipulation px-2 py-1 text-[10px] ${config.accessory === 'Sunglasses' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'}`}
                >
                  <Glasses size={11} />
                  Shades
                </button>
                {(['happy', 'sad', 'angry', 'surprised', 'wink'] as Emotion[]).map((emo) => (
                  <button
                    key={emo}
                    onClick={() => playEmotion(emo)}
                    className={`rounded-md font-medium capitalize transition-colors touch-manipulation px-1.5 py-1 text-[10px] flex items-center justify-center ${emotion === emo ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}
                  >
                    {emo}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <button
                  onClick={handleDealWithIt}
                  className={`mx-auto flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors shadow-sm border touch-manipulation min-h-[44px] mb-6 px-4 py-2 ${config.accessory === 'Sunglasses' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700 hover:border-zinc-600'}`}
                >
                  <Glasses size={16} />
                  Shades
                </button>
                <p className="text-sm text-zinc-400 mb-4">Test Emotions</p>
                <div className="flex justify-center gap-1.5 flex-wrap">
                  {(['happy', 'sad', 'angry', 'surprised', 'wink'] as Emotion[]).map((emo) => (
                    <button
                      key={emo}
                      onClick={() => playEmotion(emo)}
                      className={`rounded-lg font-medium capitalize transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-1.5 text-xs ${emotion === emo ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {/* Options panel */}
        <div className={`w-full md:w-3/5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${compact ? 'p-2 min-h-[220px] md:min-h-0' : 'p-6 sm:p-8'}`}>
          <AvatarControls config={config} onChange={setConfig} activeTab={activeTab} compact={compact} ownedItems={ownedItems} isAdmin={isAdmin} onLockedItemClick={onLockedItemClick} />
        </div>
      </div>
      </div> {/* end desktop wrapper */}
    </div>
  );
}
