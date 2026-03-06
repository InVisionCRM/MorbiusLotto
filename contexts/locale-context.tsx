'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'morbius-locale'

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']

interface LocaleContextValue {
  locale: LocaleCode
  setLocale: (code: LocaleCode) => void
  localeLabel: string
}

const defaultLocale: LocaleCode = 'en'

const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
  localeLabel: 'English',
})

function getStoredLocale(): LocaleCode {
  if (typeof window === 'undefined') return defaultLocale
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const found = SUPPORTED_LOCALES.some((l) => l.code === stored)
    return found ? (stored as LocaleCode) : defaultLocale
  } catch {
    return defaultLocale
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(defaultLocale)

  useEffect(() => {
    const stored = getStoredLocale()
    setLocaleState(stored)
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = stored
    }
  }, [])

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code)
    try {
      localStorage.setItem(STORAGE_KEY, code)
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = code
      }
    } catch {
      // ignore
    }
  }, [])

  const localeLabel = SUPPORTED_LOCALES.find((l) => l.code === locale)?.label ?? 'English'

  return (
    <LocaleContext.Provider value={{ locale, setLocale, localeLabel }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
