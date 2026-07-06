import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadGitLabConfig, gitlabFetch } from '@/lib/gitlab';

// Issues for one project. state: opened | closed | all; optional text search.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await loadGitLabConfig(session.user.id);
  if (!config) return NextResponse.json({ error: 'GitLab is not connected' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const projectId = sp.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  const state = sp.get('state') || 'opened';
  const search = sp.get('search') || '';

  const qs = new URLSearchParams({
    per_page: '50',
    order_by: 'updated_at',
    sort: 'desc',
  });
  if (state !== 'all') qs.set('state', state);
  if (search) qs.set('search', search);

  try {
    const issues = await gitlabFetch(
      config,
      `/projects/${encodeURIComponent(projectId)}/issues?${qs}`
    );
    return NextResponse.json({
      issues: (issues as any[]).map((i) => ({
        iid: i.iid,
        title: i.title,
        state: i.state,
        webUrl: i.web_url,
        labels: i.labels ?? [],
        author: i.author?.name ?? '',
        assignee: i.assignee?.name ?? null,
        milestone: i.milestone?.title ?? null,
        updatedAt: i.updated_at,
        description: i.description ?? '',
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
