'use client';
import { createContext, useContext, useState, useCallback, useMemo } from 'react';

// Settings is a centered modal overlay (Obsidian-style), not a page. Any
// component can open it — the gear icon, the navbar link, plugin placeholder
// pages — optionally deep-linking to a category ('plugins', 'sync', …).
interface SettingsModalContextValue {
  open: boolean;
  /** Category requested by the opener; null → keep/restore the default. */
  initialCategory: string | null;
  openSettings: (category?: string) => void;
  closeSettings: () => void;
}

const SettingsModalContext = createContext<SettingsModalContextValue | null>(null);

export function SettingsModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialCategory, setInitialCategory] = useState<string | null>(null);

  const openSettings = useCallback((category?: string) => {
    setInitialCategory(category ?? null);
    setOpen(true);
  }, []);
  const closeSettings = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, initialCategory, openSettings, closeSettings }),
    [open, initialCategory, openSettings, closeSettings]
  );
  return <SettingsModalContext.Provider value={value}>{children}</SettingsModalContext.Provider>;
}

export function useSettingsModal() {
  return useContext(SettingsModalContext);
}
