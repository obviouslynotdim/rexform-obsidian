'use client';
import { createContext, useContext, useState, useMemo } from 'react';
import type { OutlineItem } from '@/components/OutlinePanel';

// The note view publishes its outline + jump handler here; NotesShell's right
// column consumes it. Null while no note is open (graph/kanban/empty state).
export interface RightPanelData {
  noteId: string;
  outline: OutlineItem[];
  onJump: (o: OutlineItem) => void;
}

interface RightPanelContextValue {
  panel: RightPanelData | null;
  // Stable setter (useState's) — publishers depend on it without re-running
  // when `panel` itself changes, which would otherwise loop.
  setPanel: (p: RightPanelData | null) => void;
}

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export function RightPanelProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<RightPanelData | null>(null);
  const value = useMemo(() => ({ panel, setPanel }), [panel]);
  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>;
}

export function useRightPanel() {
  return useContext(RightPanelContext);
}
