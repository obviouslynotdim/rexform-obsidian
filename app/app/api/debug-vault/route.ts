import { NextResponse } from 'next/server';

export async function GET() {
  const internalUrl = process.env.COUCHDB_INTERNAL_URL;
  const couchUrl = process.env.COUCHDB_URL;
  const adminUser = process.env.COUCHDB_ADMIN_USER;
  const couchUsername = process.env.COUCHDB_USERNAME;
  const adminPassLen = (process.env.COUCHDB_ADMIN_PASSWORD ?? '').length;
  const couchPassLen = (process.env.COUCHDB_PASSWORD ?? '').length;

  const effectiveUrl = internalUrl || couchUrl || 'http://localhost:5984';
  const effectiveUser = adminUser || couchUsername || 'admin';
  const effectivePassLen = adminPassLen || couchPassLen;

  // Test a real request
  let testStatus: number | string = 'not attempted';
  let testBody = '';
  try {
    const pass = process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';
    const user = adminUser || couchUsername || 'admin';
    const header = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    const res = await fetch(`${effectiveUrl}/_session`, {
      headers: { Authorization: header },
      cache: 'no-store',
    });
    testStatus = res.status;
    testBody = await res.text();
  } catch (e: any) {
    testStatus = 'error';
    testBody = e.message;
  }

  return NextResponse.json({
    env: {
      COUCHDB_INTERNAL_URL: internalUrl ?? '(unset)',
      COUCHDB_URL: couchUrl ?? '(unset)',
      COUCHDB_ADMIN_USER: adminUser ?? '(unset)',
      COUCHDB_USERNAME: couchUsername ?? '(unset)',
      COUCHDB_ADMIN_PASSWORD_len: adminPassLen,
      COUCHDB_PASSWORD_len: couchPassLen,
    },
    effective: {
      url: effectiveUrl,
      user: effectiveUser,
      passLen: effectivePassLen,
    },
    test: { status: testStatus, body: testBody },
  });
}
