import { NextRequest, NextResponse } from 'next/server';
import { buildOAuth2, consumePendingState } from '@/lib/salesforceOAuth';
import { setTargetConnectionFromOAuth } from '@/lib/salesforceClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Step 2 of the OAuth 2.0 Web Server Flow: Salesforce redirects the browser back here with
// ?code=...&state=... after the user logs in and approves access. Exchanges the code for
// access/refresh tokens (POST /services/oauth2/token, via jsforce's OAuth2.requestToken) and
// stores the resulting connection as the target org. Always redirects back to the deployment
// page (with a status query param) rather than rendering JSON here - this response is what the
// user's browser lands on directly after leaving Salesforce.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const returnUrl = new URL('/deployment-assistant', req.url);

  const oauthError = params.get('error');
  if (oauthError) {
    returnUrl.searchParams.set('oauth_error', params.get('error_description') || oauthError);
    return NextResponse.redirect(returnUrl);
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    returnUrl.searchParams.set('oauth_error', 'Salesforce did not return an authorization code.');
    return NextResponse.redirect(returnUrl);
  }

  const pending = consumePendingState(state);
  if (!pending) {
    returnUrl.searchParams.set('oauth_error', 'OAuth state expired or invalid - please try connecting again.');
    return NextResponse.redirect(returnUrl);
  }

  try {
    const oauth2 = await buildOAuth2(pending.loginUrl);
    const tokenResponse = await oauth2.requestToken(code);
    await setTargetConnectionFromOAuth(oauth2, tokenResponse);
    returnUrl.searchParams.set('target_connected', '1');
    return NextResponse.redirect(returnUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    returnUrl.searchParams.set('oauth_error', `Failed to complete OAuth: ${message}`);
    return NextResponse.redirect(returnUrl);
  }
}
