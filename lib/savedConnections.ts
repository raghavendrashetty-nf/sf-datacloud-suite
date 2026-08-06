'use client';

// Client-side only. A named list of reusable org connection profiles, stored in this browser's
// localStorage - same trust model as every other "Remember on this device" credential store
// already in this app (ConnectionForm, PasswordOAuthConnectCard, OAuthClientConfigCard): never
// sent anywhere but this browser and this app's own server, never written to disk server-side.
// Lets a user save an org once (however they authenticated to it) and reconnect it later from
// Org Scanner or either side of Deployment, instead of re-entering credentials every visit.

export type SavedConnectionAuthMethod = 'password' | 'oauth_password' | 'oauth_redirect';

export interface SavedConnection {
  id: string;
  name: string;
  authMethod: SavedConnectionAuthMethod;
  createdAt: string;
  lastUsedAt?: string;
  // Display-only hints so the list is identifiable without touching stored secrets.
  lastKnownOrgName?: string;
  lastKnownUsername?: string;
  lastKnownInstanceUrl?: string;

  // authMethod: 'password' (classic SOAP login) or 'oauth_password' (OAuth username-password
  // grant, requires a Connected App) - both reuse the same credential fields.
  username?: string;
  password?: string;
  securityToken?: string;
  // 'password' mode only:
  domain?: 'login' | 'test' | 'custom';
  customDomain?: string;
  instanceUrl?: string;
  // 'oauth_password' mode only:
  orgUrl?: string;

  // authMethod: 'oauth_redirect' - captured after a completed interactive OAuth login/approve
  // round trip (see OAuthConnectCard's "Remember this connection" checkbox). Cannot be filled in
  // by hand; only ever written by that flow.
  refreshToken?: string;

  // 'oauth_password' and 'oauth_redirect' only: this connection's own Connected App Consumer
  // Key/Secret, so it stays reconnectable on its own rather than always depending on the one
  // shared server-side Connected App config (which may later be cleared or point elsewhere).
  clientId?: string;
  clientSecret?: string;
}

const STORAGE_KEY = 'sfdc.savedConnections.v1';

function readAll(): SavedConnection[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedConnection[]) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* storage unavailable/full */ }
}

export function listSavedConnections(): SavedConnection[] {
  return readAll().sort((a, b) => (b.lastUsedAt || b.createdAt).localeCompare(a.lastUsedAt || a.createdAt));
}

export function getSavedConnection(id: string): SavedConnection | undefined {
  return readAll().find((c) => c.id === id);
}

export function upsertSavedConnection(conn: SavedConnection) {
  const list = readAll();
  const idx = list.findIndex((c) => c.id === conn.id);
  if (idx >= 0) list[idx] = conn; else list.push(conn);
  writeAll(list);
}

export function deleteSavedConnection(id: string) {
  writeAll(readAll().filter((c) => c.id !== id));
}

export function touchSavedConnection(id: string, display?: { orgName?: string; username?: string; instanceUrl?: string }) {
  const list = readAll();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return;
  list[idx] = {
    ...list[idx], lastUsedAt: new Date().toISOString(),
    lastKnownOrgName: display?.orgName ?? list[idx].lastKnownOrgName,
    lastKnownUsername: display?.username ?? list[idx].lastKnownUsername,
    lastKnownInstanceUrl: display?.instanceUrl ?? list[idx].lastKnownInstanceUrl
  };
  writeAll(list);
}

export function newSavedConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
