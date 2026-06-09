import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser, syncVaultSecurity } from '@/lib/vault';
import { getVaultMembers, grantVaultAccess, revokeVaultAccess, type VaultRole } from '@/lib/keto';
import { kratosAdmin } from '@/lib/kratos';

const VALID_ROLES: VaultRole[] = ['owner', 'editor', 'viewer'];

async function resolveEmail(userId: string): Promise<string | null> {
  try {
    const { data } = await kratosAdmin.getIdentity({ id: userId });
    const traits = data.traits as Record<string, any>;
    return traits?.email ?? null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: { vaultId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const members = await getVaultMembers(params.vaultId);
    const enriched = await Promise.all(
      members.map(async (m) => ({ ...m, email: await resolveEmail(m.userId) }))
    );
    return NextResponse.json({ members: enriched });
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
