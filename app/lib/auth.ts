import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { OAuthConfig } from 'next-auth/providers/oauth';
import { kratosFrontend } from './kratos';
import { isAdminUser, ensureUserVault } from './vault';

const SSO_ISSUER_URL = process.env.SSO_ISSUER_URL?.replace(/\/$/, '');

export const ssoEnabled = !!(
  SSO_ISSUER_URL &&
  process.env.SSO_CLIENT_ID &&
  process.env.SSO_CLIENT_SECRET
);

interface SsoProfile extends Record<string, unknown> {
  sub: string;
  email?: string;
  name?: string;
}

// Central REXFORM IAM: Ory Hydra behind the rexform-ory-dev gateway. The
// gateway only supports the `openid` scope and advertises `sub` as its sole
// claim, so the ID token may carry nothing else — email/name are merged in
// from /userinfo when the consent app provides them.
function rexformSsoProvider(): OAuthConfig<SsoProfile> {
  return {
    id: 'rexform-sso',
    name: 'REXFORM SSO',
    type: 'oauth',
    wellKnown: `${SSO_ISSUER_URL}/.well-known/openid-configuration`,
    clientId: process.env.SSO_CLIENT_ID,
    clientSecret: process.env.SSO_CLIENT_SECRET,
    authorization: { params: { scope: 'openid' } },
    idToken: true,
    checks: ['pkce', 'state'],
    // Must match the Hydra client's registered token_endpoint_auth_method,
    // otherwise the token exchange fails with invalid_client.
    client: { token_endpoint_auth_method: 'client_secret_basic' },
    userinfo: {
      // A custom request takes precedence over the idToken shortcut, letting
      // us merge ID-token claims with /userinfo instead of getting only one.
      async request({ client, tokens }) {
        // At runtime `tokens` is an openid-client TokenSet instance; next-auth
        // types it as the plain parameters object, hiding claims().
        const claims = (tokens as { claims?: () => Record<string, unknown> }).claims;
        const idClaims = tokens.id_token && claims ? claims.call(tokens) : {};
        try {
          const ui = await client.userinfo(tokens.access_token as string);
          return { ...idClaims, ...ui };
        } catch {
          return idClaims; // userinfo may be empty — sub alone is enough
        }
      },
    },
    profile(profile) {
      const sub = String(profile.sub);
      return {
        id: sub,
        email: profile.email ?? null,
        name:
          profile.name ??
          (profile.email ? String(profile.email).split('@')[0] : `User ${sub.slice(0, 8)}`),
      };
    },
  };
}

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
    ...(ssoEnabled ? [rexformSsoProvider()] : []),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user, account }) {
      // The Kratos after-register webhook never fires for SSO users, so their
      // vault is provisioned here on first login. Non-fatal: the lazy
      // auto-provision in fetchFromVault remains as the safety net.
      if (account?.provider === 'rexform-sso' && user.id) {
        try {
          await ensureUserVault(user.id);
        } catch (e) {
          console.error('[auth] SSO vault provisioning failed:', e);
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.userId = user.id;
        token.kratosSessionToken = user.kratosSessionToken;
        token.isAdmin = isAdminUser(user.id);
        token.provider = account?.provider ?? 'credentials';
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
