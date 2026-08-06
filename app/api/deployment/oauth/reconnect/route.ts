import { NextRequest, NextResponse } from 'next/server';
import { buildOAuth2 } from '@/lib/salesforceOAuth';
import { setTargetConnectionFromOAuth } from '@/lib/salesforceClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body { refreshToken?: string; instanceUrl?: string; }

// Silently re-establishes the target org connection from a refresh token remembered in the
// browser (see OAuthConnectCard's "Remember this connection" checkbox) - lets a returning visit
// skip the Salesforce login/approve screen entirely, including after this server restarted and
// lost its in-memory connection cache. Uses jsforce's OAuth2.refreshToken(), the standard OAuth
// 2.0 refresh grant, then reuses the exact same setTargetConnectionFromOAuth() the initial
// connect uses, so the resulting connection is indistinguishable from a fresh one.
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.refreshToken || !body.instanceUrl) {
    return NextResponse.json({ error: 'Missing refreshToken or instanceUrl' }, { status: 400 });
  }

  try {
    const oauth2 = await buildOAuth2(body.instanceUrl);
    const tokenResponse = await oauth2.refreshToken(body.refreshToken);
    const info = await setTargetConnectionFromOAuth(oauth2, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || body.refreshToken,
      instance_url: tokenResponse.instance_url || body.instanceUrl,
      id: tokenResponse.id
    });
    return NextResponse.json({ info });
  } catch (e: any) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to reconnect: ${message}` }, { status: 400 });
  }
}
