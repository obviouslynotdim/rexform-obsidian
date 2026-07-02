'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { useTabsContext } from '@/context/TabsContext';

// Month-grid calendar for the right panel (Calendar community plugin).
// Days that already have a daily note (a note named YYYY-MM-DD.md anywhere in
// the vault) are marked with a dot and open it; other days ask to create one —
// Obsidian Calendar's "would you like to create it?" flow.

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKDAYS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

interface NoteEntry { id: string; path: string }

interface Props {
  /** 'panel' = compact right-sidebar grid (default); 'page' = full-size month view. */
  variant?: 'panel' | 'page';
}

export default function CalendarPanel({ variant = 'panel' }: Props) {
  const isPage = variant === 'page';
  const router = useRouter();
  const tabsCtx = useTabsContext();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data } = useSWR<{ notes: NoteEntry[] }>('/api/notes/tree', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  // date string → note id, for every note whose filename is YYYY-MM-DD.md.
  const dailyNotes = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of data?.notes ?? []) {
      const base = (n.path.split('/').pop() ?? '').replace(/\.md$/i, '');
      if (DATE_RE.test(base) && !map.has(base)) map.set(base, n.id);
    }
    return map;
  }, [data]);

  const todayStr = fmt(now.getFullYear(), now.getMonth(), now.getDate());

  // Leading blanks so day 1 lands on its weekday column, then the days.
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) list.push(d);
    return list;
  }, [year, month]);

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function openNote(id: string, title: string) {
    tabsCtx?.openTab(id, title, 'note');
    router.push(`/notes/${encodeURIComponent(id.replace(/\.md$/i, ''))}`);
  }

  function handleDayClick(day: number) {
    const dateStr = fmt(year, month, day);
    const existing = dailyNotes.get(dateStr);
    if (existing) openNote(existing, dateStr);
    else setConfirmDate(dateStr);
  }

  async function createDailyNote() {
    if (!confirmDate || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: confirmDate, folder: '', content: '' }),
      });
      const resData = await res.json();
      if (!res.ok) { alert(resData.error || 'Failed to create daily note.'); return; }
      mutate('/api/notes/tree');
      openNote(resData.id, resData.title);
      setConfirmDate(null);
    } finally {
      setCreating(false);
    }
  }

  const navBtn: React.CSSProperties = {
    width: isPage ? 28 : 22, height: isPage ? 28 : 22,
    borderRadius: 5, border: 'none', cursor: 'pointer',
    background: 'transparent', color: 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: isPage ? 16 : 13, lineHeight: 1, padding: 0,
  };

  return (
    <div style={{ padding: isPage ? 0 : '12px 12px 16px', userSelect: 'none' }}>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: isPage ? 16 : 10 }}>
        <span style={{ flex: 1, fontSize: isPage ? 19 : 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {MONTHS[month]} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{year}</span>
        </span>
        <button
          style={navBtn}
          onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
          title="Go to today"
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            border: '1.5px solid currentColor', display: 'block',
          }} />
        </button>
        <button style={navBtn} onClick={() => shiftMonth(-1)} title="Previous month">‹</button>
        <button style={navBtn} onClick={() => shiftMonth(1)} title="Next month">›</button>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isPage ? 6 : 0, marginBottom: isPage ? 4 : 2 }}>
        {(isPage ? WEEKDAYS_FULL : WEEKDAYS).map((w) => (
          <span
            key={w}
            style={{
              textAlign: 'center', fontSize: isPage ? 11.5 : 10, fontWeight: 600,
              color: 'var(--text-muted)', padding: '2px 0',
            }}
          >
            {w}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isPage ? 6 : undefined, rowGap: isPage ? 6 : 2 }}>
        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />;
          const dateStr = fmt(year, month, day);
          const hasNote = dailyNotes.has(dateStr);
          const isToday = dateStr === todayStr;
          return (
            <button
              key={dateStr}
              onClick={() => handleDayClick(day)}
              title={hasNote ? `Open ${dateStr}` : `Create daily note ${dateStr}`}
              style={{
                position: 'relative',
                height: isPage ? 76 : 30,
                borderRadius: isPage ? 8 : 6,
                border: isPage ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                background: isPage ? 'rgba(255,255,255,0.02)' : 'transparent',
                color: isToday ? 'var(--accent)' : hasNote ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: isPage ? 13.5 : 12,
                fontWeight: isToday || hasNote ? 600 : 400,
                outline: isToday ? '1px solid rgba(127,119,221,0.55)' : 'none',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isPage ? 'rgba(255,255,255,0.02)' : 'transparent'; }}
            >
              {day}
              {hasNote && (
                <span style={{
                  position: 'absolute', bottom: isPage ? 8 : 3, left: '50%', transform: 'translateX(-50%)',
                  width: isPage ? 5 : 4, height: isPage ? 5 : 4, borderRadius: '50%', background: 'var(--accent)',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Create-confirmation — centered on the screen (Obsidian Calendar flow) */}
      {confirmDate && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 8000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDate(null); }}
        >
          <div
            style={{
              width: 'min(400px, calc(100vw - 48px))',
              background: '#16213e',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
              padding: '20px 22px',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
              New Daily Note
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>
              File <strong style={{ color: 'var(--text-primary)' }}>{confirmDate}</strong> does not exist.
              Would you like to create it?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setConfirmDate(null)}
                style={{
                  padding: '7px 16px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.65)', fontSize: 12.5, fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={createDailyNote}
                disabled={creating}
                style={{
                  padding: '7px 16px', borderRadius: 6, border: 'none',
                  cursor: creating ? 'default' : 'pointer',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 12.5, fontWeight: 500, opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
