import { NextRequest, NextResponse } from 'next/server';
import { buildOAuth2, normalizeOrgUrl, getEffectiveOAuthConfig } from '@/lib/salesforceOAuth';
import { setTargetConnectionFromOAuth } from '@/lib/salesforceClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body { orgUrl?: string; username?: string; password?: string; securityToken?: string; }

// OAuth 2.0 Username-Password Flow (Resource Owner Password Credentials) - jsforce's
// OAuth2.authenticate(), confirmed via source to POST grant_type=password directly to
// /services/oauth2/token. A real, different endpoint from the classic SOAP login() call, so it
// works on orgs that have that legacy SOAP login specifically disabled. Still requires a
// Connected App (Consumer Key AND Secret - jsforce's authenticate() throws without both), and
// still recommends a security token unless the org's login IP ranges are trusted - same
// requirement as the SOAP path, just via a different door.
export async function POST(req: NextRequest) {
  const effective = getEffectiveOAuthConfig();
  if (!effective || !effective.config.clientSecret) {
    return NextResponse.json({
      error: 'This mode needs a Connected App Consumer Key AND Secret. Enter them in the Connected App panel above, or set SF_OAUTH_CLIENT_ID and SF_OAUTH_CLIENT_SECRET in the environment and restart the server.'
    }, { status: 501 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.orgUrl || !body.username || !body.password) {
    return NextResponse.json({ error: 'Org URL, username, and password are all required.' }, { status: 400 });
  }

  try {
    const loginUrl = normalizeOrgUrl(body.orgUrl);
    const oauth2 = await buildOAuth2(loginUrl);
    const password = body.password + (body.securityToken || '');
    const tokenResponse = await oauth2.authenticate(body.username, password);
    const info = await setTargetConnectionFromOAuth(oauth2, tokenResponse);
    return NextResponse.json({ info });
  } catch (e: any) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Connection failed: ${message}`, name: e?.name, errorCode: e?.errorCode }, { status: 400 });
  }
}
