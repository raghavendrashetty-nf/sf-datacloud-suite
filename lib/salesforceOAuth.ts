// Server-side only. Real Salesforce OAuth 2.0 Web Server Flow (Authorization Code Grant) for
// connecting a SECOND (target) org for deployment, so the user isn't required to paste a
// username/password/security token for that org. Uses jsforce's own OAuth2 class (confirmed via
// its type defs/source: getAuthorizationUrl() builds the exact /services/oauth2/authorize
// redirect, requestToken(code) POSTs to /services/oauth2/token) rather than hand-rolled HTTP
// calls, so the request shapes are the same ones jsforce itself uses, not guessed.
import { randomUUID } from 'crypto';

declare global {
  // eslint-disable-next-line no-var
  var __sfOAuthPending: Map<string, { loginUrl: string; createdAt: number }> | undefined;
}
if (!globalThis.__sfOAuthPending) globalThis.__sfOAuthPending = new Map();
const pending = globalThis.__sfOAuthPending;

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes - plenty for a login+approve round trip

export interface OAuthEnvConfig { clientId: string; clientSecret?: string; redirectUri: string; }

// Requires a real Salesforce Connected App - Consumer Key/Secret and a Callback URL that must
// match SF_OAUTH_REDIRECT_URI exactly (including protocol/port). Not something this app can
// fabricate; returns null (never a fake value) when unconfigured so callers can show a clear
// setup message instead of a confusing failure deep in the OAuth handshake.
export function readOAuthEnvConfig(): OAuthEnvConfig | null {
  const clientId = process.env.SF_OAUTH_CLIENT_ID;
  const redirectUri = process.env.SF_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;
  return { clientId, clientSecret: process.env.SF_OAUTH_CLIENT_SECRET, redirectUri };
}

export async function buildOAuth2(loginUrl: string) {
  const jsforce: any = await import('jsforce');
  const OAuth2 = jsforce.OAuth2 ?? jsforce.default?.OAuth2;
  const env = readOAuthEnvConfig();
  if (!env) throw new Error('OAuth is not configured on this server - set SF_OAUTH_CLIENT_ID and SF_OAUTH_REDIRECT_URI (and SF_OAUTH_CLIENT_SECRET if your Connected App requires a secret).');
  return new OAuth2({ loginUrl, clientId: env.clientId, clientSecret: env.clientSecret, redirectUri: env.redirectUri });
}

// CSRF protection for the redirect round-trip: a random state is minted before redirecting to
// Salesforce and must come back unchanged on the callback. Stored server-side (in-memory, same
// pattern as the rest of this app's session state) rather than trusting a client-suppliable
// value, and expires quickly since the whole flow should take well under 10 minutes.
export function createPendingState(loginUrl: string): string {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > STATE_TTL_MS) pending.delete(k);
  const state = randomUUID();
  pending.set(state, { loginUrl, createdAt: now });
  return state;
}

export function consumePendingState(state: string): { loginUrl: string } | null {
  const entry = pending.get(state);
  if (!entry) return null;
  pending.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry;
}
