'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';

export type TabType = 'note' | 'graph' | 'kanban' | 'calendar' | 'gitlab';

export interface Tab {
  id: string;
  title: string;
  type?: TabType;
}

interface TabsContextType {
  tabs: Tab[];
  activeTabId: string | null;
  initialized: boolean;
  openTab: (id: string, title: string, type?: TabType) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (fromId: string, toId: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

export function useTabsContext() {
  return useContext(TabsContext);
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// These tab types are singletons — only one instance per type at a time
const SINGLETON_TYPES: TabType[] = ['graph', 'kanban', 'calendar', 'gitlab'];

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabIdState] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: vaultsData } = useSWR<{ vaults: any[]; activeVault: string }>(
    '/api/vaults',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const rawVaultId = vaultsData?.activeVault ?? null;
  const vaultId = (rawVaultId === 'undefined' || rawVaultId === 'null' || rawVaultId === '')
    ? null
    : rawVaultId;

  // Restore tabs for the current vault once vaultId is known.
  // React 18 batches setTabs + setInitialized into one render, so the save
  // effect below sees the restored tabs (not the initial []) on first write.
  useEffect(() => {
    if (!vaultId) return;
    try {
      const saved = localStorage.getItem(`rexform-tabs:${vaultId}`);
      const savedActive = localStorage.getItem(`rexform-active-tab:${vaultId}`);
      setTabs(saved ? JSON.parse(saved) : []);
      setActiveTabIdState(savedActive ?? null);
    } catch {
      setTabs([]);
      setActiveTabIdState(null);
    }
    setInitialized(true);
  }, [vaultId]);

  // Persist tabs — guarded so we never write [] before restoration completes.
  useEffect(() => {
    if (!initialized || !vaultId) return;
    try { localStorage.setItem(`rexform-tabs:${vaultId}`, JSON.stringify(tabs)); } catch {}
  }, [tabs, initialized, vaultId]);

  // Persist active tab.
  useEffect(() => {
    if (!initialized || !vaultId) return;
    try {
      if (activeTabId) localStorage.setItem(`rexform-active-tab:${vaultId}`, activeTabId);
      else localStorage.removeItem(`rexform-active-tab:${vaultId}`);
    } catch {}
  }, [activeTabId, initialized, vaultId]);

  const openTab = useCallback((id: string, title: string, type?: TabType) => {
    setTabs(prev => {
      // Singleton types: remove any existing tab of the same type, then add the new one
      if (type && SINGLETON_TYPES.includes(type)) {
        const withoutType = prev.filter(t => t.type !== type);
        const next = [...withoutType, { id, title, type }];
        return next.length > 10 ? next.slice(next.length - 10) : next;
      }
      // Note tabs: deduplicate by ID
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

  const reorderTabs = useCallback((fromId: string, toId: string) => {
    setTabs(prev => {
      const fromIdx = prev.findIndex(t => t.id === fromId);
      const toIdx = prev.findIndex(t => t.id === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, initialized, openTab, closeTab, setActiveTab, reorderTabs }}>
      {children}
    </TabsContext.Provider>
  );
}
