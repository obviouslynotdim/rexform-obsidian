import Link from 'next/link'

export default function Navbar() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b"
      style={{ background: '#16213e', borderColor: '#2a2a4a' }}
    >
      <Link href="/" className="flex items-center gap-2 font-bold text-lg">
        <span
          className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold"
          style={{ background: '#7F77DD' }}
        >
          R
        </span>
        <span style={{ color: '#e0e0e0' }}>REXFORM</span>
        <span style={{ color: '#7F77DD' }}>Notes</span>
      </Link>

      <div className="flex items-center gap-1">
        <Link
          href="/"
          className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
          style={{ color: '#8892a4' }}
        >
          Dashboard
        </Link>
        <Link
          href="/notes"
          className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
          style={{ color: '#8892a4' }}
        >
          Notes
        </Link>
        <Link
          href="/search"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
          style={{ color: '#8892a4' }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          Search
        </Link>
      </div>
    </nav>
  )
}
