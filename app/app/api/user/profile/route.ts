import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { kratosAdmin } from '@/lib/kratos';
import { listSsoUsers, updateSsoUserProfile } from '@/lib/sso-users';

type AccountType = 'local' | 'sso-only';

interface ProfileResponse {
  accountType: AccountType;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string;
  hasPassword: boolean;
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

function splitName(name: string | null): { firstName: string; lastName: string } {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const [first, ...rest] = trimmed.split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}

async function loadProfile(userId: string): Promise<ProfileResponse | null> {
  try {
    const { data: identity } = await kratosAdmin.getIdentity({ id: userId, includeCredential: ['password'] });
    const traits = (identity.traits as any) ?? {};
    return {
      accountType: 'local',
      firstName: traits.name?.first ?? '',
      lastName: traits.name?.last ?? '',
      email: traits.email ?? null,
      username: (identity.metadata_public as any)?.username ?? '',
      hasPassword: !!identity.credentials?.password,
    };
  } catch {
    // Not a local Kratos identity — fall back to the SSO-only registry.
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

  const profile = await loadProfile(session.user.id);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  return NextResponse.json(profile);
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

  if (username !== undefined && username !== '' && !USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 3-32 characters: letters, numbers, dots, underscores or hyphens.' },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  let identity;
  try {
    identity = (await kratosAdmin.getIdentity({ id: userId })).data;
  } catch {
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

  const profile = await loadProfile(userId);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  return NextResponse.json(profile);
}
