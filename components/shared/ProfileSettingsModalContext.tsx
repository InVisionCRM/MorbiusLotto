'use client';

import React, { createContext, useCallback, useRef, useState } from 'react';
import ProfileSettingsModal from '@/components/shared/ProfileSettingsModal';

export interface OpenProfileSettingsOptions {
  displayName: string;
  profileImageUrl: string | null;
  onSave: (displayName: string, profileImageUrl: string | null) => Promise<void>;
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
  const onSaveRef = useRef<(displayName: string, profileImageUrl: string | null) => Promise<void>>();

  const openProfileSettings = useCallback((options: OpenProfileSettingsOptions) => {
    setDisplayName(options.displayName);
    setProfileImageUrl(options.profileImageUrl);
    onSaveRef.current = options.onSave;
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    onSaveRef.current = undefined;
  }, []);

  const handleSave = useCallback(async (name: string, img: string | null) => {
    if (onSaveRef.current) await onSaveRef.current(name, img);
  }, []);

  return (
    <ProfileSettingsModalContext.Provider value={{ openProfileSettings }}>
      {children}
      <ProfileSettingsModal
        open={open}
        onClose={handleClose}
        displayName={displayName}
        profileImageUrl={profileImageUrl}
        onSave={handleSave}
      />
    </ProfileSettingsModalContext.Provider>
  );
}
