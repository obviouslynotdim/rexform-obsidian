import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { kratosAdmin } from '@/lib/kratos';
import { listSsoUsers, updateSsoUserProfile } from '@/lib/sso-users';
import { USERNAME_RE, isUsernameTaken } from '@/lib/username';

type AccountType = 'local' | 'sso-only';

interface ProfileResponse {
  accountType: AccountType;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string;
  hasPassword: boolean;
}

// Kratos admin lives at a railway.internal hostname that only resolves inside
// Railway's private network — unreachable is expected in local dev and must
// not be conflated with "this user has no local identity" (that misclassifies
// a real local account as SSO-only, see app/app/api/admin/users/route.ts for
// the same distinction).
function isKratosConnectionError(e: any): boolean {
  const msg = String(e?.message ?? e);
  const code = String(e?.code ?? e?.cause?.code ?? '');
  return /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i.test(msg + ' ' + code);
}

function kratosUnreachableResponse() {
  const adminUrl = process.env.KRATOS_ADMIN_URL || 'http://localhost:4434';
  return NextResponse.json(
    {
      error:
        `Cannot reach the Kratos admin API at ${adminUrl}. ` +
        `Railway-internal hostnames (…railway.internal) only resolve inside Railway's private network, ` +
        `so profile management works on the deployed app but not in local development.`,
    },
    { status: 503 }
  );
}

function splitName(name: string | null): { firstName: string; lastName: string } {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const [first, ...rest] = trimmed.split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}

async function loadProfile(userId: string): Promise<ProfileResponse | null> {
  let identity: any = null;
  try {
    identity = (await kratosAdmin.getIdentity({ id: userId, includeCredential: ['password'] })).data;
  } catch (e: any) {
    if (isKratosConnectionError(e)) throw e;
    // Genuinely not a local Kratos identity — fall back to the SSO-only registry.
  }

  if (identity) {
    const traits = (identity.traits as any) ?? {};
    return {
      accountType: 'local',
      firstName: traits.name?.first ?? '',
      lastName: traits.name?.last ?? '',
      email: traits.email ?? null,
      username: (identity.metadata_public as any)?.username ?? '',
      hasPassword: !!identity.credentials?.password,
    };
  }

  const ssoUsers = await listSsoUsers();
  const record = ssoUsers.find((u) => u.id === userId);
  if (!record) return null;
  const { firstName, lastName } = splitName(record.name);
  return {
    accountType: 'sso-only',
    firstName,
    lastName,
    email: record.email,
    username: record.username ?? '',
    hasPassword: false,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const profile = await loadProfile(session.user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (e: any) {
    if (isKratosConnectionError(e)) return kratosUnreachableResponse();
    return NextResponse.json({ error: e.message || 'Failed to load profile' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const firstName: string | undefined = typeof body.firstName === 'string' ? body.firstName.trim() : undefined;
  const lastName: string | undefined = typeof body.lastName === 'string' ? body.lastName.trim() : undefined;
  const username: string | undefined = typeof body.username === 'string' ? body.username.trim() : undefined;

  const userId = session.user.id;

  if (username !== undefined && username !== '') {
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3-32 characters: letters, numbers, dots, underscores or hyphens.' },
        { status: 400 }
      );
    }
    if (await isUsernameTaken(username, userId)) {
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
    }
  }

  let identity;
  try {
    identity = (await kratosAdmin.getIdentity({ id: userId })).data;
  } catch (e: any) {
    if (isKratosConnectionError(e)) return kratosUnreachableResponse();
    identity = null; // no local Kratos identity — SSO-only account
  }

  try {
    if (identity) {
      // Local identity — update traits.name and metadata_public.username via a full PUT.
      const traits = { ...(identity.traits as any) };
      traits.name = {
        first: firstName !== undefined ? firstName : (traits.name?.first ?? ''),
        last: lastName !== undefined ? lastName : (traits.name?.last ?? ''),
      };
      const metadataPublic = { ...((identity.metadata_public as any) ?? {}) };
      if (username !== undefined) metadataPublic.username = username || undefined;

      await kratosAdmin.updateIdentity({
        id: userId,
        updateIdentityBody: {
          schema_id: identity.schema_id,
          state: identity.state as any,
          traits,
          metadata_public: metadataPublic,
        },
      });
    } else if (username !== undefined) {
      // SSO-only account — only username persists here (name is sourced from
      // the IAM claims and gets overwritten on every login, see sso-users.ts).
      await updateSsoUserProfile(userId, username || null);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to update profile' }, { status: 500 });
  }

  try {
    const profile = await loadProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (e: any) {
    if (isKratosConnectionError(e)) return kratosUnreachableResponse();
    return NextResponse.json({ error: e.message || 'Failed to load profile' }, { status: 500 });
  }
}
