import { NextRequest, NextResponse } from 'next/server';
import { buildOAuth2, consumePendingState, createTokenHandoff } from '@/lib/salesforceOAuth';
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
  // Look up pending state as early as possible (even on an error/denial redirect) so we know the
  // real returnTo/savedConnectionId - Salesforce echoes the state param back on error redirects
  // too, per the OAuth 2.0 spec, so this isn't limited to the success path.
  const state = params.get('state');
  const pending = state ? consumePendingState(state) : null;
  const returnUrl = new URL(pending?.returnTo || '/deployment-assistant', req.url);
  if (pending?.savedConnectionId) returnUrl.searchParams.set('saved_connection_id', pending.savedConnectionId);

  const oauthError = params.get('error');
  if (oauthError) {
    returnUrl.searchParams.set('oauth_error', params.get('error_description') || oauthError);
    return NextResponse.redirect(returnUrl);
  }

  const code = params.get('code');
  if (!code) {
    returnUrl.searchParams.set('oauth_error', 'Salesforce did not return an authorization code.');
    return NextResponse.redirect(returnUrl);
  }
  if (!pending) {
    returnUrl.searchParams.set('oauth_error', 'OAuth state expired or invalid - please try connecting again.');
    return NextResponse.redirect(returnUrl);
  }

  try {
    // Reuse the SAME Consumer Key/Secret the /authorize step used (a Saved Connection's own, if
    // that's how this was initiated) - the token exchange must be signed with the identical
    // Connected App credentials that requested the authorization code.
    const clientOverride = pending.clientId
      ? { clientId: pending.clientId, clientSecret: pending.clientSecret, redirectUri: `${req.nextUrl.origin}/api/deployment/oauth/callback` }
      : undefined;
    const oauth2 = await buildOAuth2(pending.loginUrl, false, clientOverride);
    // Reattach the same code_verifier minted at the /authorize step (a fresh OAuth2 instance
    // here would otherwise have none) - jsforce's requestToken() automatically sends it as
    // code_verifier when present, completing the PKCE exchange the authorize step started.
    if (pending.codeVerifier) oauth2.codeVerifier = pending.codeVerifier;
    const tokenResponse = await oauth2.requestToken(code);
    await setTargetConnectionFromOAuth(oauth2, tokenResponse);
    returnUrl.searchParams.set('target_connected', '1');
    // Only if the user opted in (checkbox in OAuthConnectCard) and Salesforce actually issued a
    // refresh token (requires the "refresh_token" scope, always requested above) - a one-time
    // code the client fetches once to learn the real refresh token, so it can remember the
    // connection across a server restart the same way this app already remembers passwords.
    if (pending.remember && tokenResponse.refresh_token) {
      const handoffCode = createTokenHandoff(tokenResponse.refresh_token, tokenResponse.instance_url);
      returnUrl.searchParams.set('token_handoff', handoffCode);
    }
    return NextResponse.redirect(returnUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    returnUrl.searchParams.set('oauth_error', `Failed to complete OAuth: ${message}`);
    return NextResponse.redirect(returnUrl);
  }
}
