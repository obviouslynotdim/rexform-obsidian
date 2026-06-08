import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser, syncVaultSecurity } from '@/lib/vault';
import { getVaultMembers, grantVaultAccess, revokeVaultAccess, type VaultRole } from '@/lib/keto';

const VALID_ROLES: VaultRole[] = ['owner', 'editor', 'viewer'];

export async function GET(_req: Request, { params }: { params: { vaultId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const members = await getVaultMembers(params.vaultId);
    return NextResponse.json({ members });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { vaultId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let userId: string, role: VaultRole;
  try {
    ({ userId, role } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!userId?.trim() || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'userId and valid role required' }, { status: 400 });
  }

  try {
    // Revoke any existing role for this user before granting the new one
    const members = await getVaultMembers(params.vaultId);
    const existing = members.filter((m) => m.userId === userId);
    await Promise.all(existing.map((m) => revokeVaultAccess(params.vaultId, m.userId, m.role)));
    await grantVaultAccess(params.vaultId, userId, role);
    await syncVaultSecurity(params.vaultId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
