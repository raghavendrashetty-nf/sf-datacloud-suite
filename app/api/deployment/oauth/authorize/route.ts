import { NextRequest, NextResponse } from 'next/server';
import { buildOAuth2, createPendingState, getEffectiveOAuthConfig, normalizeOrgUrl } from '@/lib/salesforceOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Internal-only redirect targets this route will send the browser back to after Salesforce -
// never trust an arbitrary caller-supplied path here (open-redirect risk).
const RETURN_TO_ALLOWLIST = new Set(['/deployment-assistant', '/saved-connections']);

// Step 1 of the OAuth 2.0 Web Server Flow: redirect the browser to Salesforce's real
// authorization page. GET (not POST) because this must be a full browser navigation - the user
// logs in and approves access on Salesforce's own domain, not inside this app.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  // A saved connection can bring its own Consumer Key/Secret (set up for its own Connected App)
  // instead of depending on the one shared server-side Connected App config - lets different
  // saved orgs use different Connected Apps without switching a single shared setting between
  // them. Falls back to the shared config when neither is supplied, same as before.
  const clientIdParam = params.get('clientId');
  const clientOverride = clientIdParam
    ? { clientId: clientIdParam, clientSecret: params.get('clientSecret') || undefined, redirectUri: `${req.nextUrl.origin}/api/deployment/oauth/callback` }
    : undefined;

  if (!clientOverride) {
    const effective = getEffectiveOAuthConfig();
    if (!effective) {
      return NextResponse.json({
        error: 'OAuth is not configured on this server. Enter a Consumer Key/Secret in the Connected App panel above, or set SF_OAUTH_CLIENT_ID and SF_OAUTH_REDIRECT_URI in the environment.'
      }, { status: 501 });
    }
    if (!effective.config.redirectUri) {
      return NextResponse.json({
        error: 'A Redirect URI is required for this mode - add one in the Connected App panel above (it must exactly match the Callback URL on the Connected App), or set SF_OAUTH_REDIRECT_URI in the environment.'
      }, { status: 501 });
    }
  }

  // A custom org URL (e.g. https://ne1785420174855.my.salesforce.com) takes priority over the
  // generic Production/Sandbox toggle - lets a user target their org's own My Domain host
  // directly instead of the shared login.salesforce.com/test.salesforce.com hosts.
  const customUrl = params.get('loginUrl');
  const sandbox = params.get('sandbox') === 'true';
  let loginUrl: string;
  try {
    loginUrl = customUrl ? normalizeOrgUrl(customUrl) : (sandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com');
  } catch {
    return NextResponse.json({ error: 'That does not look like a valid org URL.' }, { status: 400 });
  }

  const remember = params.get('remember') === 'true';
  const returnToParam = params.get('returnTo');
  const returnTo = returnToParam && RETURN_TO_ALLOWLIST.has(returnToParam) ? returnToParam : undefined;
  const savedConnectionId = params.get('savedConnectionId') || undefined;

  try {
    const oauth2 = await buildOAuth2(loginUrl, true, clientOverride);
    const state = createPendingState(loginUrl, {
      codeVerifier: oauth2.codeVerifier, remember,
      clientId: clientOverride?.clientId, clientSecret: clientOverride?.clientSecret,
      returnTo, savedConnectionId
    });
    // "api" for Data/Metadata API access, "refresh_token" for a long-lived token so the user
    // doesn't have to re-authenticate every session - the two standard scopes for this pattern.
    const authorizeUrl = oauth2.getAuthorizationUrl({ scope: 'api refresh_token', state });
    return NextResponse.redirect(authorizeUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to start OAuth flow: ${message}` }, { status: 500 });
  }
}
