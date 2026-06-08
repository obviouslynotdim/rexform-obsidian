import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser, syncVaultSecurity } from '@/lib/vault';
import { grantVaultAccess, revokeVaultAccess, getVaultMembers, type VaultRole } from '@/lib/keto';

const VALID_ROLES: VaultRole[] = ['owner', 'editor', 'viewer'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { vaultId: string; userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let newRole: VaultRole;
  try {
    ({ role: newRole } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!VALID_ROLES.includes(newRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Revoke all existing roles then grant the new one
  const members = await getVaultMembers(params.vaultId);
  const existing = members.filter((m) => m.userId === params.userId);
  await Promise.all(existing.map((m) => revokeVaultAccess(params.vaultId, m.userId, m.role)));
  await grantVaultAccess(params.vaultId, params.userId, newRole);
  await syncVaultSecurity(params.vaultId);

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { vaultId: string; userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const members = await getVaultMembers(params.vaultId);
  const owners = members.filter((m) => m.role === 'owner');
  const isLastOwner =
    owners.length === 1 && owners[0].userId === params.userId;

  if (isLastOwner) {
    return NextResponse.json({ error: 'Cannot remove the last owner' }, { status: 400 });
  }

  const existing = members.filter((m) => m.userId === params.userId);
  await Promise.all(existing.map((m) => revokeVaultAccess(params.vaultId, m.userId, m.role)));
  await syncVaultSecurity(params.vaultId);

  return NextResponse.json({ success: true });
}
