'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { useTabsContext, type Tab } from '@/context/TabsContext';

const WELCOME_NOTE_ID = 'Welcome to REXFORM Notes.md';
const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

  // Active vault id (same source/normalisation as TabsContext) — the onboarded
  // flag is stored per-vault.
  const { data: vaultsData } = useSWR<{ vaults: any[]; activeVault: string }>(
    '/api/vaults',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const rawVaultId = vaultsData?.activeVault ?? null;
  const vaultId =
    rawVaultId === 'undefined' || rawVaultId === 'null' || rawVaultId === ''
      ? null
      : rawVaultId;

  // Note tree — used both to detect the seeded welcome note for the first-time
  // redirect and to enable the "Open Welcome note" button in the empty state.
  const { data: treeData } = useSWR<{ notes: { id: string }[] }>(
    '/api/notes/tree',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
  const welcomeExists = !!treeData?.notes?.some((n) => n.id === WELCOME_NOTE_ID);

  // Becomes true once we've decided NOT to redirect (onboarded already, or no
  // welcome note to open). Until then we render nothing so the empty state never
  // flashes before a first-time redirect fires.
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Returning user: restore the last active tab. (Unchanged behaviour.)
  useEffect(() => {
    if (!initialized) return;
    if (!activeTabId || tabs.length === 0) return;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    router.replace(tabHref(activeTab));
  }, [initialized, activeTabId, tabs, router]);

  // First-time user: no saved tabs. Decide between onboarding redirect and the
  // getting-started empty state.
  useEffect(() => {
    if (!initialized) return;
    if (tabs.length > 0) return;            // returning user — handled above
    if (vaultsData === undefined) return;   // wait for vault info
    if (treeData === undefined) return;     // wait for note tree

    // Can't determine a vault — just show the empty state.
    if (!vaultId) {
      setOnboardingChecked(true);
      return;
    }

    let onboarded = false;
    try {
      onboarded = localStorage.getItem(`rexform-onboarded:${vaultId}`) === '1';
    } catch {}

    if (onboarded) {
      setOnboardingChecked(true);
      return;
    }

    const hasWelcome = !!treeData?.notes?.some((n) => n.id === WELCOME_NOTE_ID);
    if (hasWelcome) {
      try {
        localStorage.setItem(`rexform-onboarded:${vaultId}`, '1');
      } catch {}
      router.replace('/notes/graph?open=' + encodeURIComponent(WELCOME_NOTE_ID));
      return;
    }

    // No welcome note to land on — fall through to the empty state.
    setOnboardingChecked(true);
  }, [initialized, tabs.length, vaultsData, vaultId, treeData, router]);

  function openWelcome() {
    if (!welcomeExists) return;
    const urlId = WELCOME_NOTE_ID.replace(/\.md$/i, '');
    ctx?.openTab(WELCOME_NOTE_ID, urlId);
    router.push(`/notes/${encodeURIComponent(urlId)}`);
  }

  // --- Render guards ---------------------------------------------------------
  if (!initialized) return null;
  // Returning user about to be redirected to last active tab — render nothing.
  if (activeTabId && tabs.some((t) => t.id === activeTabId)) return null;
  // First-time user: hold render until the onboarding decision resolves so the
  // empty state doesn't flash before a redirect to the graph.
  if (tabs.length === 0 && !onboardingChecked) return null;

  // --- Getting-started empty state (Part D) ----------------------------------
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: '#1a1a2e',
          border: '1px solid var(--border)',
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 text-2xl"
          style={{ background: 'rgba(127,119,221,0.14)', border: '1px solid rgba(127,119,221,0.3)' }}
        >
          📝
        </div>

        <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Get started with REXFORM Notes
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          A few things to try as you build your knowledge base.
        </p>

        <ul className="flex flex-col gap-3 mb-7">
          <ChecklistItem
            icon="✏️"
            title="Create your first note"
            desc="Capture a thought, a task, or some research."
          >
            <Link
              href="/notes/new"
              className="inline-block mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
              style={{ background: '#7F77DD', color: '#fff' }}
            >
              + New note
            </Link>
          </ChecklistItem>

          <ChecklistItem
            icon="🔗"
            title="Link notes together"
            desc="Type [[double brackets]] to connect related ideas into a web."
          />

          <ChecklistItem
            icon="🕸️"
            title="Explore your knowledge graph"
            desc="See every note and link laid out visually."
          >
            <Link
              href="/notes/graph"
              className="inline-block mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid rgba(127,119,221,0.4)',
                color: '#7F77DD',
              }}
            >
              Open graph view →
            </Link>
          </ChecklistItem>
        </ul>

        {welcomeExists && (
          <button
            onClick={openWelcome}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            📖 Open the Welcome note
          </button>
        )}
      </div>
    </div>
  );
}

function ChecklistItem({
  icon,
  title,
  desc,
  children,
}: {
  icon: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {desc}
        </p>
        {children}
      </div>
    </li>
  );
}
