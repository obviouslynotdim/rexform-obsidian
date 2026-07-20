import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { syncVaultSecurity } from '@/lib/vault';
import {
  getVaultMembers,
  getUserVaultRole,
  grantVaultAccess,
  revokeVaultAccess,
  type VaultRole,
} from '@/lib/keto';
import { resolveUserIdentifier, getUserEmail } from '@/lib/user-lookup';

const VALID_ROLES: VaultRole[] = ['owner', 'editor', 'viewer'];

// Any member may view the roster; only owners may change it.
export async function GET(_req: NextRequest, { params }: { params: { vaultId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!params.vaultId.startsWith('vault-shared-')) {
    return NextResponse.json({ error: 'Not a shared vault' }, { status: 400 });
  }
  const myRole = await getUserVaultRole(params.vaultId, session.user.id);
  if (!myRole) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const members = await getVaultMembers(params.vaultId);
    const enriched = await Promise.all(
      members.map(async (m) => ({ ...m, email: await getUserEmail(m.userId) }))
    );
    return NextResponse.json({ members: enriched, myRole });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Invite a user (by email or userId) or change an existing member's role.
export async function POST(req: NextRequest, { params }: { params: { vaultId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!params.vaultId.startsWith('vault-shared-')) {
    return NextResponse.json({ error: 'Not a shared vault' }, { status: 400 });
  }
  const myRole = await getUserVaultRole(params.vaultId, session.user.id);
  if (myRole !== 'owner') {
    return NextResponse.json({ error: 'Only the vault owner can manage members' }, { status: 403 });
  }

  let identifier: string, role: VaultRole;
  try {
    ({ identifier, role } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!identifier?.trim() || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'identifier and valid role required' }, { status: 400 });
  }

  const target = await resolveUserIdentifier(identifier);
  if (!target) {
    return NextResponse.json(
      { error: 'No user found for that email or ID. They may need to sign in once first.' },
      { status: 404 }
    );
  }

  try {
    const members = await getVaultMembers(params.vaultId);

    // Demoting yourself as the sole owner would orphan the vault.
    if (target.userId === session.user.id && role !== 'owner') {
      const otherOwners = members.filter((m) => m.role === 'owner' && m.userId !== session.user.id);
      if (otherOwners.length === 0) {
        return NextResponse.json(
          { error: 'You are the only owner — promote someone else to owner first' },
          { status: 400 }
        );
      }
    }

    // One role per user: revoke any existing tuples before granting.
    const existing = members.filter((m) => m.userId === target.userId);
    await Promise.all(existing.map((m) => revokeVaultAccess(params.vaultId, m.userId, m.role)));
    await grantVaultAccess(params.vaultId, target.userId, role);
    await syncVaultSecurity(params.vaultId);
    return NextResponse.json({ success: true, userId: target.userId, email: target.email, role });
  } catch (e: any) {
    console.error('[shared-vaults] member change failed:', e);
    return NextResponse.json({ error: 'Failed to update members' }, { status: 500 });
  }
}
