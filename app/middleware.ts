import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse, NextFetchEvent } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Per-IP fixed windows. Strict on the public auth endpoints (brute-force
// surface), generous on API writes (autosave fires ~1-2/sec while typing),
// none on reads. In-memory — see lib/rate-limit.ts for the scaling caveat.

// Note the keys are per-IP: users behind one NAT (campus wifi) share a bucket,
// so the non-auth limits are deliberately generous.
const AUTH_POST_LIMIT = 10;   // login / registration attempts per minute
const AUTH_GET_LIMIT = 120;   // flow inits + session polling per minute
const WRITE_LIMIT = 600;      // note saves, moves, deletes per minute
const WINDOW_MS = 60_000;

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function clientIp(req: NextRequest): string {
  return (
    req.ip ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

function checkRateLimit(req: NextRequest): NextResponse | null {
  const path = req.nextUrl.pathname;
  if (!path.startsWith('/api/')) return null;

  const ip = clientIp(req);
  let result = null;

  if (path.startsWith('/api/auth/')) {
    result = WRITE_METHODS.has(req.method)
      ? rateLimit(`auth-write:${ip}`, AUTH_POST_LIMIT, WINDOW_MS)
      : rateLimit(`auth-read:${ip}`, AUTH_GET_LIMIT, WINDOW_MS);
  } else if (WRITE_METHODS.has(req.method)) {
    result = rateLimit(`write:${ip}`, WRITE_LIMIT, WINDOW_MS);
  }

  if (result?.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down and try again.' },
      { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } }
    );
  }
  return null;
}

// ─── Auth (unchanged behaviour) ───────────────────────────────────────────────
// Paths that were previously excluded from the matcher entirely and must stay
// public: the auth API itself and webhook endpoints. (login/register pages and
// static assets remain excluded in the matcher below.)
const PUBLIC_PREFIXES = ['/api/auth', '/api/hooks'];

const authMiddleware = withAuth(
  function middleware(req) {
    if (req.nextUrl.pathname === '/' && req.nextauth.token) {
      return NextResponse.redirect(new URL('/notes', req.url));
    }
  },
  {
    secret: process.env.NEXTAUTH_SECRET,
    callbacks: {
      authorized({ token }) {
        return !!token;
      },
    },
    pages: { signIn: '/login' },
  }
);

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  const path = req.nextUrl.pathname;
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }
  return (authMiddleware as any)(req, event);
}

// api/auth is now INCLUDED (for rate limiting; it bypasses withAuth above).
export const config = {
  matcher: ['/((?!login|register|api/hooks|_next/static|_next/image|favicon\\.ico).*)'],
};
