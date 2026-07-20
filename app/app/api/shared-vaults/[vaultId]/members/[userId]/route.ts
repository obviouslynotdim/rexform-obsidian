import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { syncVaultSecurity } from '@/lib/vault';
import { getVaultMembers, getUserVaultRole, revokeVaultAccess } from '@/lib/keto';

// Remove a member. Owners can remove anyone (except the sole owner);
// non-owners can only remove themselves — that's "leave vault".
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { vaultId: string; userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { vaultId, userId: targetId } = params;
  if (!vaultId.startsWith('vault-shared-')) {
    return NextResponse.json({ error: 'Not a shared vault' }, { status: 400 });
  }

  const myRole = await getUserVaultRole(vaultId, session.user.id);
  if (!myRole) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const isSelf = targetId === session.user.id;
  if (myRole !== 'owner' && !isSelf) {
    return NextResponse.json({ error: 'Only the vault owner can remove members' }, { status: 403 });
  }

  try {
    const members = await getVaultMembers(vaultId);
    const targetTuples = members.filter((m) => m.userId === targetId);
    if (targetTuples.length === 0) {
      return NextResponse.json({ error: 'Not a member' }, { status: 404 });
    }

    // Never remove the last owner — delete the vault instead.
    const owners = members.filter((m) => m.role === 'owner');
    if (targetTuples.some((m) => m.role === 'owner') && owners.length === 1) {
      return NextResponse.json(
        { error: 'Cannot remove the only owner — delete the vault or promote someone first' },
        { status: 400 }
      );
    }

    await Promise.all(targetTuples.map((m) => revokeVaultAccess(vaultId, m.userId, m.role)));
    await syncVaultSecurity(vaultId);

    // Leaving the vault you're currently in: drop the active-vault override.
    if (isSelf && cookies().get('rexform-active-vault')?.value === vaultId) {
      cookies().delete('rexform-active-vault');
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[shared-vaults] member removal failed:', e);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
