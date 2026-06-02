'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const loading = status === 'loading';

  const navLink = (href: string, label: React.ReactNode) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        href={href}
        className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
        style={{ color: active ? '#7F77DD' : '#8892a4', fontWeight: active ? 500 : 400 }}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b"
      style={{ background: '#16213e', borderColor: '#2a2a4a' }}
    >
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg flex-shrink-0">
        <span
          className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold"
          style={{ background: '#7F77DD' }}
        >
          R
        </span>
        <span style={{ color: '#e0e0e0' }}>REXFORM</span>
        <span style={{ color: '#7F77DD' }}>Notes</span>
      </Link>

      {/* Nav links */}
      {session && (
        <div className="flex items-center gap-1">
          {navLink('/dashboard', 'Dashboard')}
          {navLink('/notes', 'Notes')}
          {session.user?.isAdmin && navLink('/admin', 'Admin')}
          {navLink(
            '/search',
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Search
            </span>
          )}
        </div>
      )}

      {/* Right — auth state */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {loading ? (
          <span className="text-xs" style={{ color: '#4a5568' }}>…</span>
        ) : session ? (
          <>
            <span
              className="text-xs px-2 py-1 rounded-md border hidden sm:block"
              style={{
                color: '#8892a4',
                borderColor: '#2a2a4a',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5 border"
              style={{ color: '#e05c5c', borderColor: '#2a2a4a' }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
              style={{ color: '#8892a4' }}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: '#7F77DD', color: '#fff' }}
            >
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
