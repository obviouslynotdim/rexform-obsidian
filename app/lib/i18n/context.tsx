'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { en } from './en';
import { kh } from './kh';

export type Locale = 'en' | 'kh';

const DICTS: Record<Locale, Record<string, string>> = { en, kh };

function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'kh';
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  // Hydrate the locale from the user's saved settings on mount.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (isLocale(data.language)) setLocaleState(data.language);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Update state immediately and persist in the background. The settings route
  // merges partial updates, so sending only { language } preserves other fields.
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    fetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: next }),
    }).catch(() => {});
  }, []);

  // Lookup: current dict → English fallback → the key itself.
  const t = useCallback(
    (key: string): string => DICTS[locale][key] ?? en[key] ?? key,
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback if a component renders outside the provider (e.g. tests):
    // English, no-op setLocale.
    return {
      locale: 'en',
      setLocale: () => {},
      t: (key: string) => en[key] ?? key,
    };
  }
  return ctx;
}

// Convenience hook for components that only need the translate function.
export function useT(): (key: string) => string {
  return useI18n().t;
}
