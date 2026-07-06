import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadGitLabConfig, gitlabFetch } from '@/lib/gitlab';

// Projects the user is a member of, most recently active first.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await loadGitLabConfig(session.user.id);
  if (!config) return NextResponse.json({ error: 'GitLab is not connected' }, { status: 400 });

  const search = req.nextUrl.searchParams.get('search') || '';
  const qs = new URLSearchParams({
    membership: 'true',
    simple: 'true',
    order_by: 'last_activity_at',
    per_page: '30',
  });
  if (search) qs.set('search', search);

  try {
    const projects = await gitlabFetch(config, `/projects?${qs}`);
    return NextResponse.json({
      projects: (projects as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        pathWithNamespace: p.path_with_namespace,
        webUrl: p.web_url,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
