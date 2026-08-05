import { NextRequest, NextResponse } from 'next/server';
import { buildOAuth2, createPendingState, readOAuthEnvConfig } from '@/lib/salesforceOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Step 1 of the OAuth 2.0 Web Server Flow: redirect the browser to Salesforce's real
// authorization page. GET (not POST) because this must be a full browser navigation - the user
// logs in and approves access on Salesforce's own domain, not inside this app.
export async function GET(req: NextRequest) {
  const env = readOAuthEnvConfig();
  if (!env) {
    return NextResponse.json({
      error: 'OAuth is not configured on this server. Set SF_OAUTH_CLIENT_ID and SF_OAUTH_REDIRECT_URI (and SF_OAUTH_CLIENT_SECRET if your Connected App requires a secret) in the environment, then restart the server.'
    }, { status: 501 });
  }

  const sandbox = req.nextUrl.searchParams.get('sandbox') === 'true';
  const loginUrl = sandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com';

  try {
    const oauth2 = await buildOAuth2(loginUrl);
    const state = createPendingState(loginUrl);
    // "api" for Data/Metadata API access, "refresh_token" for a long-lived token so the user
    // doesn't have to re-authenticate every session - the two standard scopes for this pattern.
    const authorizeUrl = oauth2.getAuthorizationUrl({ scope: 'api refresh_token', state });
    return NextResponse.redirect(authorizeUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to start OAuth flow: ${message}` }, { status: 500 });
  }
}
