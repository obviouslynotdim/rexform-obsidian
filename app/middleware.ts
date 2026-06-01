import { withAuth, NextRequestWithAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    if (req.nextUrl.pathname === '/' && req.nextauth.token) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
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

export const config = {
  matcher: ['/((?!login|register|api/auth|api/hooks|_next/static|_next/image|favicon\\.ico).*)'],
};
