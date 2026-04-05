'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { InstallAppHelpDialog } from '@/components/shared/InstallAppHelpDialog';

type InstallAppHelpDialogContextValue = {
  openInstallHelp: () => void;
};

const InstallAppHelpDialogContext = createContext<InstallAppHelpDialogContextValue | null>(
  null,
);

/**
 * Renders {@link InstallAppHelpDialog} once app-wide and exposes `openInstallHelp`
 * for the home splash, sidebar, etc. Must sit inside {@link PwaInstallPromptProvider}.
 */
export function InstallAppHelpDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openInstallHelp = useCallback(() => setOpen(true), []);

  const value = useMemo(() => ({ openInstallHelp }), [openInstallHelp]);

  return (
    <InstallAppHelpDialogContext.Provider value={value}>
      {children}
      <InstallAppHelpDialog open={open} onOpenChange={setOpen} />
    </InstallAppHelpDialogContext.Provider>
  );
}

export function useInstallAppHelpDialog(): InstallAppHelpDialogContextValue {
  const ctx = useContext(InstallAppHelpDialogContext);
  if (!ctx) {
    throw new Error(
      'useInstallAppHelpDialog must be used within InstallAppHelpDialogProvider',
    );
  }
  return ctx;
}
