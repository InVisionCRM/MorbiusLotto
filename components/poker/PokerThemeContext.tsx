'use client';

import React, { createContext, useContext } from 'react';
import type { PokerThemeId } from '@/lib/poker-themes';

const PokerThemeContext = createContext<PokerThemeId | null>(null);

export function PokerThemeProvider({
  themeId,
  children,
}: {
  themeId: PokerThemeId;
  children: React.ReactNode;
}) {
  return (
    <PokerThemeContext.Provider value={themeId}>
      {children}
    </PokerThemeContext.Provider>
  );
}

export function usePokerTheme(): PokerThemeId {
  const id = useContext(PokerThemeContext);
  return id ?? 'classic';
}
