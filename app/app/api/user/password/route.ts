import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { kratosAdmin, kratosFrontend } from '@/lib/kratos';

export async function POST(req: NextRequest) {
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

  const currentPassword: string | undefined = body.currentPassword;
  const newPassword: string | undefined = body.newPassword;
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const userId = session.user.id;
  let identity;
  try {
    identity = (await kratosAdmin.getIdentity({ id: userId })).data;
  } catch {
    return NextResponse.json(
      { error: "Your account doesn't have a password to change." },
      { status: 400 }
    );
  }

  const email = (identity.traits as any)?.email;
  if (!email) {
    return NextResponse.json({ error: 'Unable to resolve account email' }, { status: 500 });
  }

  // Verify the current password via a fresh native login flow — this works
  // regardless of how the caller is currently authenticated (SSO-linked
  // sessions don't carry a Kratos session token, only credential logins do).
  try {
    const { data: flow } = await kratosFrontend.createNativeLoginFlow();
    await kratosFrontend.updateLoginFlow({
      flow: flow.id,
      updateLoginFlowBody: {
        method: 'password',
        identifier: email,
        password: currentPassword,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
  }

  try {
    await kratosAdmin.updateIdentity({
      id: userId,
      updateIdentityBody: {
        schema_id: identity.schema_id,
        state: identity.state as any,
        traits: identity.traits as any,
        metadata_public: identity.metadata_public,
        credentials: { password: { config: { password: newPassword } } },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to update password' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
