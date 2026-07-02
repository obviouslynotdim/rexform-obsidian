'use client';
import CalendarPanel from '@/components/CalendarPanel';

function CalendarPageIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 20 20" fill="none" style={{ color: '#7F77DD' }}>
      <rect x="1.5" y="3.5" width="17" height="14.5" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1.5" y1="8.5" x2="18.5" y2="8.5" stroke="currentColor" strokeWidth="1.1" />
      <line x1="6" y1="1.5" x2="6" y2="5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14" y1="1.5" x2="14" y2="5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6" cy="12.5" r="1.1" fill="currentColor" />
      <circle cx="10" cy="12.5" r="1.1" fill="currentColor" />
      <circle cx="14" cy="12.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

export default function CalendarPage() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <CalendarPageIcon />
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
            Calendar
          </h1>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 28 }}>
          Daily notes at a glance — days with a note are marked, and clicking any
          other day creates its <code style={{ fontSize: 12 }}>YYYY-MM-DD</code> note.
        </p>

        {/* Month view */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '20px 22px',
          }}
        >
          <CalendarPanel variant="page" />
        </div>
      </div>
    </div>
  );
}
