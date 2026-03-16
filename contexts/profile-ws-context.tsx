'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';

interface ProfileWsContextValue {
  wsClient: BlackjackWebSocketClient | null;
  setWsClient: (client: BlackjackWebSocketClient | null) => void;
}

const ProfileWsContext = createContext<ProfileWsContextValue | null>(null);

export function ProfileWsProvider({ children }: { children: React.ReactNode }) {
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const value: ProfileWsContextValue = {
    wsClient,
    setWsClient: useCallback((client) => setWsClient(client), []),
  };
  return (
    <ProfileWsContext.Provider value={value}>
      {children}
    </ProfileWsContext.Provider>
  );
}

export function useProfileWs(): ProfileWsContextValue | null {
  return useContext(ProfileWsContext);
}
