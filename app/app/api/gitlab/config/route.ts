import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  loadGitLabConfig,
  saveGitLabConfig,
  deleteGitLabConfig,
  normalizeHost,
  gitlabFetch,
} from '@/lib/gitlab';

// Connection status — never returns the token.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const config = await loadGitLabConfig(session.user.id);
    if (!config) return NextResponse.json({ connected: false });
    return NextResponse.json({ connected: true, host: config.host, username: config.username });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Connect: verify the token against /user, then store it encrypted.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let host: string, token: string;
  try {
    ({ host, token } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  token = (token || '').trim();
  if (!token) return NextResponse.json({ error: 'A personal access token is required' }, { status: 400 });
  host = normalizeHost(host);

  let user: any;
  try {
    user = await gitlabFetch({ host, token, username: '' }, '/user');
  } catch (e: any) {
    return NextResponse.json(
      { error: `Could not connect to GitLab: ${e.message}` },
      { status: 400 }
    );
  }

  try {
    await saveGitLabConfig(session.user.id, host, token, user.username ?? '');
    return NextResponse.json({ connected: true, host, username: user.username ?? '' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await deleteGitLabConfig(session.user.id);
    return NextResponse.json({ connected: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
