'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTabsContext, type Tab } from '@/context/TabsContext';

function tabHref(tab: Tab): string {
  switch (tab.type) {
    case 'graph':    return '/notes/graph';
    case 'kanban':   return '/notes/kanban';
    case 'calendar': return '/notes/calendar';
    case 'gitlab':   return '/notes/gitlab';
    default:         return `/notes/${encodeURIComponent(tab.id)}`;
  }
}

export default function NotesPage() {
  const router = useRouter();
  const ctx = useTabsContext();
  const initialized = ctx?.initialized ?? false;
  const activeTabId = ctx?.activeTabId ?? null;
  const tabs = ctx?.tabs ?? [];

  useEffect(() => {
    if (!initialized) return;
    if (!activeTabId || tabs.length === 0) return;
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;
    router.replace(tabHref(activeTab));
  }, [initialized, activeTabId, tabs, router]);

  // Suppress flash: if initialized and there's a tab to redirect to, render nothing
  // while the router.replace fires (happens in the same tick as the effect).
  if (!initialized) return null;
  if (activeTabId && tabs.some(t => t.id === activeTabId)) return null;

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          📝
        </div>
        <p className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          Select a note to view
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          or create something new
        </p>
        <Link
          href="/notes/new"
          className="px-5 py-2 rounded-lg font-medium text-sm transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + New Note
        </Link>
      </div>
    </div>
  );
}
