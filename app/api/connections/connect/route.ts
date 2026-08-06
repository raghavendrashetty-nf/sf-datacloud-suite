import { NextRequest, NextResponse } from 'next/server';
import { setConnectionInSlot, setConnectionFromOAuthInSlot, type ConnectionSlot } from '@/lib/salesforceClient';
import { buildOAuth2, normalizeOrgUrl, getEffectiveOAuthConfig } from '@/lib/salesforceOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  slot?: ConnectionSlot;
  authMethod?: 'password' | 'oauth_password' | 'oauth_redirect';
  // password
  username?: string; password?: string; securityToken?: string;
  domain?: 'login' | 'test' | 'custom'; customDomain?: string; instanceUrl?: string;
  // oauth_password / oauth_redirect - a saved connection can carry its own Connected App
  // credentials instead of always depending on the one shared server-side Connected App config,
  // so it stays reconnectable even if that shared config is later cleared or changed.
  clientId?: string; clientSecret?: string;
  // oauth_password
  orgUrl?: string;
  // oauth_redirect
  refreshToken?: string;
}

// Single entry point the Saved Connections feature uses to reconnect a saved profile into
// EITHER connection slot, regardless of which of the three auth methods it was saved with -
// avoids re-deriving this branching logic in every place a saved connection might be applied
// (Org Scanner, Deployment's source AND target). Each branch below just calls the exact same
// underlying functions the dedicated connect routes already use and already proved live.
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const slot: ConnectionSlot = body.slot === 'target' ? 'target' : 'primary';
  if (!body.authMethod) return NextResponse.json({ error: 'Missing authMethod' }, { status: 400 });

  try {
    if (body.authMethod === 'password') {
      if (!body.username || !body.password) return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
      const domain = body.domain === 'custom' ? (body.customDomain || body.instanceUrl || 'login') : (body.domain || 'login');
      const info = await setConnectionInSlot({
        username: body.username, password: body.password, securityToken: body.securityToken,
        domain, instanceUrl: body.instanceUrl
      }, slot);
      return NextResponse.json({ info });
    }

    if (body.authMethod === 'oauth_password') {
      const clientOverride = body.clientId ? { clientId: body.clientId, clientSecret: body.clientSecret } : undefined;
      if (!clientOverride) {
        const effective = getEffectiveOAuthConfig();
        if (!effective || !effective.config.clientSecret) {
          return NextResponse.json({
            error: 'This mode needs a Connected App Consumer Key AND Secret - either saved on this connection, or configured in the Connected App panel on the Deployment Assistant page.'
          }, { status: 501 });
        }
      } else if (!clientOverride.clientSecret) {
        return NextResponse.json({ error: 'This mode needs a Consumer Secret too, not just a Consumer Key.' }, { status: 400 });
      }
      if (!body.orgUrl || !body.username || !body.password) {
        return NextResponse.json({ error: 'Org URL, username, and password are all required.' }, { status: 400 });
      }
      const loginUrl = normalizeOrgUrl(body.orgUrl);
      const oauth2 = await buildOAuth2(loginUrl, false, clientOverride);
      const password = body.password + (body.securityToken || '');
      const tokenResponse = await oauth2.authenticate(body.username, password);
      const info = await setConnectionFromOAuthInSlot(oauth2, tokenResponse, slot);
      return NextResponse.json({ info });
    }

    if (body.authMethod === 'oauth_redirect') {
      if (!body.refreshToken || !body.instanceUrl) {
        return NextResponse.json({ error: 'Missing refreshToken or instanceUrl' }, { status: 400 });
      }
      const clientOverride = body.clientId ? { clientId: body.clientId, clientSecret: body.clientSecret } : undefined;
      const oauth2 = await buildOAuth2(body.instanceUrl, false, clientOverride);
      const tokenResponse = await oauth2.refreshToken(body.refreshToken);
      const info = await setConnectionFromOAuthInSlot(oauth2, {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token || body.refreshToken,
        instance_url: tokenResponse.instance_url || body.instanceUrl,
        id: tokenResponse.id
      }, slot);
      return NextResponse.json({ info });
    }

    return NextResponse.json({ error: `Unknown authMethod: ${body.authMethod}` }, { status: 400 });
  } catch (e: any) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Connection failed: ${message}`, name: e?.name, errorCode: e?.errorCode }, { status: 400 });
  }
}
