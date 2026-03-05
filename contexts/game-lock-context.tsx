'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface GameLockContextValue {
  gameLocked: boolean
  setGameLocked: (locked: boolean) => void
}

const GameLockContext = createContext<GameLockContextValue>({
  gameLocked: false,
  setGameLocked: () => {},
})

export function GameLockProvider({ children }: { children: React.ReactNode }) {
  const [gameLocked, setGameLockedState] = useState(false)
  const setGameLocked = useCallback((locked: boolean) => {
    setGameLockedState(locked)
  }, [])

  return (
    <GameLockContext.Provider value={{ gameLocked, setGameLocked }}>
      {children}
    </GameLockContext.Provider>
  )
}

export function useGameLock() {
  return useContext(GameLockContext)
}
