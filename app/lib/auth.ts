import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { kratosFrontend } from './kratos';
import { isAdminUser } from './vault';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        flowId: { label: 'Flow ID', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.flowId) {
          return null;
        }
        try {
          const result = await kratosFrontend.updateLoginFlow({
            flow: credentials.flowId,
            updateLoginFlowBody: {
              method: 'password',
              identifier: credentials.email,
              password: credentials.password,
            },
          });
          const { session, session_token } = result.data;
          return {
            id: session.identity?.id ?? '',
            email: credentials.email,
            kratosSessionToken: session_token,
          };
        } catch (err: any) {
          const msg =
            err?.response?.data?.ui?.messages?.[0]?.text ||
            err?.response?.data?.error?.message ||
            'Invalid credentials';
          throw new Error(msg);
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.kratosSessionToken = user.kratosSessionToken;
        token.isAdmin = isAdminUser(user.id);
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId ?? '';
      session.user.isAdmin = token.isAdmin ?? false;
      session.kratosSessionToken = token.kratosSessionToken;
      return session;
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};
