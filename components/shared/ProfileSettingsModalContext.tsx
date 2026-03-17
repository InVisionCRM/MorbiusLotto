'use client';

import React, { createContext, useCallback, useRef, useState } from 'react';
import ProfileSettingsModal from '@/components/shared/ProfileSettingsModal';

export interface OpenProfileSettingsOptions {
  displayName: string;
  profileImageUrl: string | null;
  bio?: string | null;
  xHandle?: string | null;
  tgHandle?: string | null;
  onSave: (displayName: string, profileImageUrl: string | null, bio: string | null, xHandle: string | null, tgHandle: string | null) => Promise<void>;
}

const ProfileSettingsModalContext = createContext<{
  openProfileSettings: (options: OpenProfileSettingsOptions) => void;
} | null>(null);

export function useProfileSettingsModal() {
  const ctx = React.useContext(ProfileSettingsModalContext);
  if (!ctx) throw new Error('useProfileSettingsModal must be used within ProfileSettingsModalProvider');
  return ctx;
}

export function ProfileSettingsModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [tgHandle, setTgHandle] = useState<string | null>(null);
  const onSaveRef = useRef<(displayName: string, profileImageUrl: string | null, bio: string | null, xHandle: string | null, tgHandle: string | null) => Promise<void>>();

  const openProfileSettings = useCallback((options: OpenProfileSettingsOptions) => {
    setDisplayName(options.displayName);
    setProfileImageUrl(options.profileImageUrl);
    setBio(options.bio ?? null);
    setXHandle(options.xHandle ?? null);
    setTgHandle(options.tgHandle ?? null);
    onSaveRef.current = options.onSave;
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    onSaveRef.current = undefined;
  }, []);

  const handleSave = useCallback(async (name: string, img: string | null, b: string | null, x: string | null, tg: string | null) => {
    if (onSaveRef.current) await onSaveRef.current(name, img, b, x, tg);
  }, []);

  return (
    <ProfileSettingsModalContext.Provider value={{ openProfileSettings }}>
      {children}
      <ProfileSettingsModal
        open={open}
        onClose={handleClose}
        displayName={displayName}
        profileImageUrl={profileImageUrl}
        bio={bio}
        xHandle={xHandle}
        tgHandle={tgHandle}
        onSave={handleSave}
      />
    </ProfileSettingsModalContext.Provider>
  );
}
