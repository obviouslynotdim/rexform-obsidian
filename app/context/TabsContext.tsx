'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface Tab {
  id: string;
  title: string;
  type?: 'note' | 'graph';
}

interface TabsContextType {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (id: string, title: string, type?: 'note' | 'graph') => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

export function useTabsContext() {
  return useContext(TabsContext);
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rexform-tabs');
      const savedActive = localStorage.getItem('rexform-active-tab');
      if (saved) setTabs(JSON.parse(saved));
      if (savedActive) setActiveTabIdState(savedActive);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('rexform-tabs', JSON.stringify(tabs)); } catch {}
  }, [tabs]);

  useEffect(() => {
    try {
      if (activeTabId) localStorage.setItem('rexform-active-tab', activeTabId);
      else localStorage.removeItem('rexform-active-tab');
    } catch {}
  }, [activeTabId]);

  const openTab = useCallback((id: string, title: string, type?: 'note' | 'graph') => {
    setTabs(prev => {
      if (type === 'graph') {
        // Only one graph tab allowed — replace existing one if present
        const withoutGraph = prev.filter(t => t.type !== 'graph');
        const next = [...withoutGraph, { id, title, type }];
        return next.length > 10 ? next.slice(next.length - 10) : next;
      }
      if (prev.find(t => t.id === id)) return prev;
      const next = [...prev, { id, title, type: type ?? 'note' }];
      return next.length > 10 ? next.slice(next.length - 10) : next;
    });
    setActiveTabIdState(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const remaining = prev.filter(t => t.id !== id);
      if (id === activeTabId && remaining.length > 0) {
        const newActive = remaining[Math.max(0, idx - 1)];
        setActiveTabIdState(newActive.id);
      } else if (id === activeTabId) {
        setActiveTabIdState(null);
      }
      return remaining;
    });
  }, [activeTabId]);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabIdState(id);
  }, []);

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, openTab, closeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
}
