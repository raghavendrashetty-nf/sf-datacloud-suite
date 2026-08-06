import { NextRequest, NextResponse } from 'next/server';
import { consumeTokenHandoff } from '@/lib/salesforceOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Consumed exactly once, right after the OAuth redirect lands back on the deployment page (see
// createTokenHandoff in lib/salesforceOAuth.ts for why this indirection exists instead of handing
// the refresh token back directly). A second call with the same code returns 404 - by design.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  const entry = consumeTokenHandoff(code);
  if (!entry) return NextResponse.json({ error: 'Handoff code expired, already used, or invalid.' }, { status: 404 });
  return NextResponse.json(entry);
}
