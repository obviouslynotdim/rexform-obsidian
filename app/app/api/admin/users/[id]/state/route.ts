import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/vault';
import { kratosAdmin } from '@/lib/kratos';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = params.id;

  // Admin cannot suspend themselves
  if (userId === session.user.id) {
    return NextResponse.json({ error: 'Cannot change your own state' }, { status: 400 });
  }

  const body = await req.json();
  const { state } = body as { state: string };
  if (state !== 'active' && state !== 'inactive') {
    return NextResponse.json({ error: 'Invalid state. Must be "active" or "inactive".' }, { status: 400 });
  }

  try {
    await kratosAdmin.patchIdentity({
      id: userId,
      jsonPatch: [{ op: 'replace' as any, path: '/state', value: state }],
    });
    return NextResponse.json({ success: true, state });
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || e.message || 'Failed to update state';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
