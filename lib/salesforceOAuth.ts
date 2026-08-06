// Server-side only. Real Salesforce OAuth 2.0 Web Server Flow (Authorization Code Grant) for
// connecting a SECOND (target) org for deployment, so the user isn't required to paste a
// username/password/security token for that org. Uses jsforce's own OAuth2 class (confirmed via
// its type defs/source: getAuthorizationUrl() builds the exact /services/oauth2/authorize
// redirect, requestToken(code) POSTs to /services/oauth2/token) rather than hand-rolled HTTP
// calls, so the request shapes are the same ones jsforce itself uses, not guessed.
import { randomUUID } from 'crypto';

export interface PendingOAuthState {
  loginUrl: string;
  codeVerifier?: string;
  remember?: boolean;
  createdAt: number;
  // Set when this authorize request was initiated from Saved Connections using that entry's own
  // Consumer Key/Secret rather than the shared server-side Connected App config - the callback
  // must reuse the SAME client credentials to exchange the code, or the token request would be
  // signed with the wrong (or no) Connected App.
  clientId?: string;
  clientSecret?: string;
  // Where to redirect back to when this didn't originate from the default Deployment Assistant
  // flow (e.g. '/saved-connections') - validated against an allowlist before use, never trusted
  // as an arbitrary redirect target.
  returnTo?: string;
  // If set, the callback updates THIS existing saved-connection entry (by id) instead of the
  // deployment page's generic "always create a new auto-saved entry" behavior.
  savedConnectionId?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __sfOAuthPending: Map<string, PendingOAuthState> | undefined;
  // eslint-disable-next-line no-var
  var __sfOAuthClientConfig: OAuthEnvConfig | null | undefined;
  // eslint-disable-next-line no-var
  var __sfOAuthTokenHandoff: Map<string, { refreshToken: string; instanceUrl: string; createdAt: number }> | undefined;
}
if (!globalThis.__sfOAuthPending) globalThis.__sfOAuthPending = new Map();
const pending = globalThis.__sfOAuthPending;
if (globalThis.__sfOAuthClientConfig === undefined) globalThis.__sfOAuthClientConfig = null;
if (!globalThis.__sfOAuthTokenHandoff) globalThis.__sfOAuthTokenHandoff = new Map();
const tokenHandoff = globalThis.__sfOAuthTokenHandoff;

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes - plenty for a login+approve round trip
const HANDOFF_TTL_MS = 2 * 60 * 1000; // 2 minutes - just long enough for the browser to redirect back and fetch it once

export interface OAuthEnvConfig { clientId: string; clientSecret?: string; redirectUri: string; }

// Requires a real Salesforce Connected App - Consumer Key/Secret and (for the redirect flow only)
// a Callback URL matching SF_OAUTH_REDIRECT_URI exactly. Not something this app can fabricate.
// Two ways to supply it, checked in this order:
//  1. Set in-memory via the UI (setOAuthClientConfig, below) - server-session only, never
//     written to disk, cleared on restart. Lets a user configure this without touching env vars
//     or restarting the server.
//  2. SF_OAUTH_CLIENT_ID / SF_OAUTH_CLIENT_SECRET / SF_OAUTH_REDIRECT_URI env vars - takes over
//     once set, useful for a persistent deployment.
export function readOAuthEnvConfig(): OAuthEnvConfig | null {
  const clientId = process.env.SF_OAUTH_CLIENT_ID;
  if (!clientId) return null;
  return { clientId, clientSecret: process.env.SF_OAUTH_CLIENT_SECRET, redirectUri: process.env.SF_OAUTH_REDIRECT_URI || '' };
}

export function getEffectiveOAuthConfig(): { config: OAuthEnvConfig; source: 'ui' | 'env' } | null {
  if (globalThis.__sfOAuthClientConfig) return { config: globalThis.__sfOAuthClientConfig, source: 'ui' };
  const env = readOAuthEnvConfig();
  if (env) return { config: env, source: 'env' };
  return null;
}

export function setOAuthClientConfig(config: OAuthEnvConfig) {
  globalThis.__sfOAuthClientConfig = config;
}
export function clearOAuthClientConfig() {
  globalThis.__sfOAuthClientConfig = null;
}
// Status only - never exposes the secret back to the client.
export function getOAuthClientConfigStatus(): { configured: boolean; source: 'ui' | 'env' | null; clientId?: string } {
  const effective = getEffectiveOAuthConfig();
  if (!effective) return { configured: false, source: null };
  return { configured: true, source: effective.source, clientId: effective.config.clientId };
}

// useVerifier enables PKCE (jsforce generates a code_verifier and adds the matching
// code_challenge to the authorize URL / code_verifier to the token exchange, per RFC 7636).
// Required by Connected Apps with "Require Proof Key for Code Exchange (PKCE)" turned on - a
// real Salesforce Connected App security setting (confirmed live: omitting it produces
// "invalid_request / missing required code challenge" from Salesforce's own authorize endpoint).
// Harmless to send even when the org doesn't require it, so it's on unconditionally for the
// Web Server (redirect) flow. Not used for the password grant, which has no code exchange step.
// clientOverride lets a caller supply its own Consumer Key/Secret directly (e.g. a Saved
// Connection that was set up with its own Connected App) instead of always falling back to the
// one shared server-side config - needed since a saved connection must stay reconnectable even
// if the shared Connected App panel is later cleared or pointed at a different app.
export async function buildOAuth2(loginUrl: string, useVerifier = false, clientOverride?: { clientId: string; clientSecret?: string; redirectUri?: string }) {
  const jsforce: any = await import('jsforce');
  const OAuth2 = jsforce.OAuth2 ?? jsforce.default?.OAuth2;
  let clientId: string, clientSecret: string | undefined, redirectUri: string | undefined;
  if (clientOverride?.clientId) {
    clientId = clientOverride.clientId; clientSecret = clientOverride.clientSecret;
    redirectUri = clientOverride.redirectUri || readOAuthEnvConfig()?.redirectUri || getEffectiveOAuthConfig()?.config.redirectUri;
  } else {
    const effective = getEffectiveOAuthConfig();
    if (!effective) throw new Error('OAuth is not configured on this server - enter a Consumer Key/Secret in the Connected App panel above, or set SF_OAUTH_CLIENT_ID/SF_OAUTH_CLIENT_SECRET in the environment.');
    clientId = effective.config.clientId; clientSecret = effective.config.clientSecret; redirectUri = effective.config.redirectUri;
  }
  return new OAuth2({ loginUrl, clientId, clientSecret, redirectUri: redirectUri || undefined, useVerifier });
}

// CSRF protection for the redirect round-trip: a random state is minted before redirecting to
// Salesforce and must come back unchanged on the callback. Stored server-side (in-memory, same
// pattern as the rest of this app's session state) rather than trusting a client-suppliable
// value, and expires quickly since the whole flow should take well under 10 minutes.
export function createPendingState(loginUrl: string, options: {
  codeVerifier?: string; remember?: boolean; clientId?: string; clientSecret?: string; returnTo?: string; savedConnectionId?: string;
} = {}): string {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > STATE_TTL_MS) pending.delete(k);
  const state = randomUUID();
  pending.set(state, { loginUrl, createdAt: now, ...options });
  return state;
}

export function consumePendingState(state: string): PendingOAuthState | null {
  const entry = pending.get(state);
  if (!entry) return null;
  pending.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry;
}

// One-time handoff for a freshly-minted refresh token: the OAuth callback route is a full-page
// redirect, not a fetch the client can read JSON from, so the refresh token can't be handed back
// directly in that response. Instead it's cached here very briefly under a random one-time code,
// appended to the redirect URL as ?token_handoff=<code>, and the client fetches+consumes it
// exactly once right after landing back on the page - never sent as the token itself over a URL
// (which browser history/server logs could capture), only an opaque, single-use lookup code.
export function createTokenHandoff(refreshToken: string, instanceUrl: string): string {
  const now = Date.now();
  for (const [k, v] of tokenHandoff) if (now - v.createdAt > HANDOFF_TTL_MS) tokenHandoff.delete(k);
  const code = randomUUID();
  tokenHandoff.set(code, { refreshToken, instanceUrl, createdAt: now });
  return code;
}

export function consumeTokenHandoff(code: string): { refreshToken: string; instanceUrl: string } | null {
  const entry = tokenHandoff.get(code);
  if (!entry) return null;
  tokenHandoff.delete(code);
  if (Date.now() - entry.createdAt > HANDOFF_TTL_MS) return null;
  return { refreshToken: entry.refreshToken, instanceUrl: entry.instanceUrl };
}

// Accepts whatever URL a user actually copies out of their browser - the Lightning UI host
// (*.lightning.force.com) or a bare My Domain name - and normalizes it to the API/login host
// (*.my.salesforce.com) that /services/oauth2/token expects, stripping any path/query. Works
// identically for production, sandbox, and scratch/dev orgs since each has its own unique My
// Domain host - there's no "prod vs sandbox" branching needed once a real domain is given.
export function normalizeOrgUrl(input: string): string {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  url.hostname = url.hostname.replace(/\.lightning\.force\.com$/i, '.my.salesforce.com');
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.origin;
}
