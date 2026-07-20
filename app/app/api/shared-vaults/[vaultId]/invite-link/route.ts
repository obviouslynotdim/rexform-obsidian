import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createVaultInviteLink } from '@/lib/vault';
import { getUserVaultRole, type VaultRole } from '@/lib/keto';

// Owner-only. Link invites are capped at editor/viewer — granting ownership
// through a forwardable link is too risky; promote to owner afterwards via
// the roster's role change instead.
const INVITABLE_ROLES: VaultRole[] = ['editor', 'viewer'];

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
    return NextResponse.json({ error: 'Only the vault owner can invite members' }, { status: 403 });
  }

  let role: VaultRole;
  try {
    ({ role } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'role must be editor or viewer' }, { status: 400 });
  }

  try {
    const { token, expiresAt } = await createVaultInviteLink(params.vaultId, role, session.user.id);
    return NextResponse.json({ token, role, expiresAt });
  } catch (e: any) {
    console.error('[shared-vaults] invite-link create failed:', e);
    return NextResponse.json({ error: 'Failed to create invite link' }, { status: 500 });
  }
}
