import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    kratosSessionToken?: string;
    username?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      username?: string | null;
      isAdmin?: boolean;
    };
    kratosSessionToken?: string;
    provider?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    kratosSessionToken?: string;
    isAdmin?: boolean;
    provider?: string;
    username?: string;
  }
}
