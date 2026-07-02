'use client';
import { useSettingsModal } from '@/context/SettingsModalContext';

function CalendarIllustration() {
  return (
    <svg width="110" height="100" viewBox="0 0 110 100" fill="none" style={{ opacity: 0.18 }}>
      <rect x="4" y="14" width="102" height="82" rx="5" stroke="#7F77DD" strokeWidth="2" />
      <line x1="4" y1="34" x2="106" y2="34" stroke="#7F77DD" strokeWidth="1.5" />
      <line x1="4" y1="52" x2="106" y2="52" stroke="#7F77DD" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="4" y1="70" x2="106" y2="70" stroke="#7F77DD" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="19" y1="34" x2="19" y2="96" stroke="#7F77DD" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="34" y1="34" x2="34" y2="96" stroke="#7F77DD" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="49" y1="34" x2="49" y2="96" stroke="#7F77DD" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="64" y1="34" x2="64" y2="96" stroke="#7F77DD" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="79" y1="34" x2="79" y2="96" stroke="#7F77DD" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="94" y1="34" x2="94" y2="96" stroke="#7F77DD" strokeWidth="1" strokeOpacity="0.5" />
      <rect x="49" y="52" width="15" height="18" rx="2" fill="#7F77DD" />
      <line x1="24" y1="4" x2="24" y2="20" stroke="#7F77DD" strokeWidth="2" strokeLinecap="round" />
      <line x1="84" y1="4" x2="84" y2="20" stroke="#7F77DD" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function CalendarPage() {
  const settingsModal = useSettingsModal();

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 40,
      }}
    >
      <CalendarIllustration />

      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 10,
          }}
        >
          Calendar
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 24 }}>
          Navigate your notes by date and create daily notes directly from the calendar.
          Perfect for journaling and daily planning workflows.
        </p>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 8,
            background: 'rgba(127,119,221,0.12)',
            border: '1px solid rgba(127,119,221,0.3)',
            fontSize: 13,
            color: 'var(--accent)',
            fontWeight: 500,
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 11 }}>⚡</span>
          Coming soon
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          You can disable this plugin in{' '}
          <button
            onClick={() => settingsModal?.openSettings('plugins')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: 12,
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Settings → Community Plugins
          </button>
        </p>
      </div>
    </div>
  );
}
