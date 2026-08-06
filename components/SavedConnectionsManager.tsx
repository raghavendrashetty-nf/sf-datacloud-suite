'use client';

import { useEffect, useState } from 'react';
import {
  listSavedConnections, getSavedConnection, upsertSavedConnection, deleteSavedConnection, touchSavedConnection, newSavedConnectionId,
  type SavedConnection, type SavedConnectionAuthMethod
} from '@/lib/savedConnections';
import type { ConnectionInfo } from '@/lib/dataReadiness';

const METHOD_LABELS: Record<SavedConnectionAuthMethod, string> = {
  password: 'Username/Password (SOAP)',
  oauth_password: 'OAuth Username/Password',
  oauth_redirect: 'OAuth Redirect (saved refresh token)'
};

function emptyDraft(): SavedConnection {
  return { id: newSavedConnectionId(), name: '', authMethod: 'password', createdAt: new Date().toISOString(), domain: 'login' };
}

// Builds the /authorize query string from a saved connection's own Production/Sandbox/Custom
// domain choice - same encoding OAuthConnectCard already uses, just driven from stored fields
// instead of live radio state. Once a connection has actually succeeded once, its real
// instanceUrl is known and preferred over the original domain choice - more precise (the exact
// org host, not just "production" generically) and still correct for a later re-auth even if
// the connection was originally started via the generic Production/Sandbox toggle.
function authorizeQueryForDomain(c: SavedConnection): string {
  if (c.instanceUrl) return `loginUrl=${encodeURIComponent(c.instanceUrl)}`;
  if (c.domain === 'custom' && c.customDomain) return `loginUrl=${encodeURIComponent(c.customDomain)}`;
  return `sandbox=${c.domain === 'test'}`;
}

function buildAuthorizeHref(c: SavedConnection): string {
  const params = new URLSearchParams();
  if (c.clientId) params.set('clientId', c.clientId);
  if (c.clientSecret) params.set('clientSecret', c.clientSecret);
  params.set('remember', 'true');
  params.set('returnTo', '/saved-connections');
  params.set('savedConnectionId', c.id);
  return `/api/deployment/oauth/authorize?${authorizeQueryForDomain(c)}&${params.toString()}`;
}

class ConnectError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

async function attemptConnect(c: SavedConnection): Promise<ConnectionInfo> {
  const body: any = { slot: 'primary', authMethod: c.authMethod };
  if (c.authMethod === 'password') {
    Object.assign(body, { username: c.username, password: c.password, securityToken: c.securityToken, domain: c.domain, customDomain: c.customDomain, instanceUrl: c.instanceUrl });
  } else if (c.authMethod === 'oauth_password') {
    Object.assign(body, { orgUrl: c.orgUrl, username: c.username, password: c.password, securityToken: c.securityToken, clientId: c.clientId, clientSecret: c.clientSecret });
  } else {
    Object.assign(body, { refreshToken: c.refreshToken, instanceUrl: c.instanceUrl, clientId: c.clientId, clientSecret: c.clientSecret });
  }
  const resp = await fetch('/api/connections/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await resp.json();
  if (!resp.ok) throw new ConnectError(j.error || `HTTP ${resp.status}`, j.name);
  return j.info as ConnectionInfo;
}

// Both of these are real Salesforce OAuth responses this app cannot bypass - surfaced as
// actionable hints instead of leaving the user with just the raw error text:
//  - oauth_password + invalid_grant: the org requires a Security Token for this kind of
//    non-interactive login (or blocks it outright from an untrusted network) - confirmed live.
//  - oauth_redirect + invalid_grant "expired access/refresh token": Salesforce's Connected App
//    refresh-token policy expired or revoked this saved token (normal over time, not a bug) -
//    confirmed live. There's no way to "renew" a refresh token in place; the only fix is a fresh
//    interactive login, which is exactly what "Reconnect via OAuth Redirect" (shown alongside
//    this error) does.
function friendlyConnectError(e: any, authMethod: SavedConnectionAuthMethod): string {
  const raw = e?.message ?? 'Connection failed';
  if (e?.code === 'invalid_grant' && authMethod === 'oauth_password') {
    return `${raw} This usually means the org requires a Security Token for this kind of non-interactive login (or blocks it outright from this network) - try adding a Security Token above, or switch this connection's Auth Method to "OAuth Redirect" instead, which logs in through Salesforce's own page and isn't affected by this restriction.`;
  }
  if (e?.code === 'invalid_grant' && authMethod === 'oauth_redirect') {
    return `${raw} The saved refresh token has expired or been revoked (Salesforce does this periodically per the Connected App's policy - not a bug here). Click "Reconnect via OAuth Redirect" to get a fresh one.`;
  }
  return raw;
}

// Full CRUD management for Saved Connections - add/edit/delete/test-connect. The compact
// "pick and connect" dropdown used inline on Org Scanner and Deployment Assistant
// (SavedConnectionQuickConnect) reads from the same localStorage list this writes to.
export default function SavedConnectionsManager() {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [editing, setEditing] = useState<SavedConnection | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [testingDraft, setTestingDraft] = useState(false);

  function refresh() { setConnections(listSavedConnections()); }
  useEffect(refresh, []);

  // Lands here after "Save & Connect via OAuth Redirect" completes the full Salesforce login/
  // approve round trip - consumes the one-time token handoff and writes the resulting refresh
  // token straight into the SAME saved connection (matched by savedConnectionId), rather than
  // creating a new entry.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoffCode = params.get('token_handoff');
    const savedConnectionId = params.get('saved_connection_id');
    const oauthError = params.get('oauth_error');
    const targetConnected = params.get('target_connected');
    if (!handoffCode && !oauthError && !targetConnected) return;
    window.history.replaceState({}, '', window.location.pathname);

    if (oauthError) { setError(oauthError); return; }
    if (!handoffCode || !savedConnectionId) return;

    (async () => {
      try {
        const resp = await fetch(`/api/deployment/oauth/token-handoff?code=${encodeURIComponent(handoffCode)}`);
        const j = await resp.json();
        if (!resp.ok || !j.refreshToken) throw new Error(j.error || 'Failed to retrieve the new refresh token.');
        const existing = getSavedConnection(savedConnectionId);
        if (!existing) { setError('Connected, but the saved connection this belonged to was not found (was it deleted?).'); return; }
        upsertSavedConnection({ ...existing, refreshToken: j.refreshToken, instanceUrl: j.instanceUrl, lastUsedAt: new Date().toISOString() });

        // Also pick up the org/username the callback already resolved, for display.
        const statusResp = await fetch('/api/deployment/target-connection');
        const statusJson = await statusResp.json();
        if (statusJson?.info?.connected) {
          touchSavedConnection(savedConnectionId, { orgName: statusJson.info.organizationName, username: statusJson.info.username, instanceUrl: statusJson.info.instanceUrl });
        }
        refresh();
        setNotice(`"${existing.name}" connected successfully via OAuth Redirect.`);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to complete the OAuth Redirect connection.');
      }
    })();
  }, []);

  function startAdd() { setEditing(emptyDraft()); setError(null); setNotice(null); }
  function startEdit(c: SavedConnection) { setEditing({ ...c }); setError(null); setNotice(null); }

  function save() {
    if (!editing) return;
    if (!editing.name.trim()) { setError('Give this connection a name.'); return; }
    upsertSavedConnection(editing);
    setEditing(null);
    refresh();
  }

  // OAuth Redirect has no credentials to submit here - saving just records the draft (name,
  // Connected App, org URL), then hands off to a full browser navigation through Salesforce's
  // real login/approve page. The callback lands back on this same page and fills in the
  // refresh token against this exact saved id (see the token_handoff effect below).
  function saveAndConnectOAuthRedirect() {
    if (!editing) return;
    if (!editing.name.trim()) { setError('Give this connection a name.'); return; }
    // Only required for a first-time connect - a saved connection reconnecting after its
    // refresh token expired can still rely on the server's shared Connected App config, same as
    // the optional Consumer Key/Secret fields shown for that case above.
    if (!editing.refreshToken && !editing.clientId) { setError('Consumer Key is required to start an OAuth Redirect connection.'); return; }
    upsertSavedConnection(editing);
    window.location.href = buildAuthorizeHref(editing);
  }

  function remove(id: string) {
    deleteSavedConnection(id);
    refresh();
  }

  async function testConnect(c: SavedConnection) {
    setError(null); setNotice(null); setConnectingId(c.id);
    try {
      const info = await attemptConnect(c);
      touchSavedConnection(c.id, { orgName: info.organizationName, username: info.username, instanceUrl: info.instanceUrl });
      refresh();
      setNotice(`Connected successfully as the primary connection - ${info.organizationName || info.username}.`);
    } catch (e: any) {
      setError(`"${c.name}": ${friendlyConnectError(e, c.authMethod)}`);
    } finally {
      setConnectingId(null);
    }
  }

  async function testConnectDraft() {
    if (!editing) return;
    setError(null); setNotice(null); setTestingDraft(true);
    try {
      const info = await attemptConnect(editing);
      setNotice(`Test succeeded - ${info.organizationName || info.username}. (Not saved yet - click Save to keep these details.)`);
    } catch (e: any) {
      setError(friendlyConnectError(e, editing.authMethod));
    } finally {
      setTestingDraft(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 max-w-xl">
          Save org connections here once, then reuse them from Org Scanner or either side of Deployment without re-entering credentials. Stored only in this browser&apos;s local storage - never sent anywhere but this app&apos;s own server.
        </p>
        <button onClick={startAdd} className="btn-primary text-sm shrink-0">+ Add Connection</button>
      </div>

      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}

      {connections.length === 0 && !editing ? (
        <div className="card p-6 text-center text-sm text-slate-500">No saved connections yet. Click &quot;+ Add Connection&quot; to save your first org.</div>
      ) : null}

      <div className="space-y-2">
        {connections.map((c) => (
          <div key={c.id} className="card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900">{c.name}</span>
                <span className="chip bg-slate-100 text-slate-600 font-semibold">{METHOD_LABELS[c.authMethod]}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 space-x-3">
                {c.lastKnownOrgName ? <span>Org: <span className="font-semibold text-slate-700">{c.lastKnownOrgName}</span></span> : null}
                {c.lastKnownUsername ? <span className="font-mono">{c.lastKnownUsername}</span> : null}
                {c.lastUsedAt ? <span>Last used {new Date(c.lastUsedAt).toLocaleString()}</span> : <span>Never used yet</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {c.authMethod === 'oauth_redirect' && !c.refreshToken ? (
                <a href={buildAuthorizeHref(c)}
                  className="inline-flex items-center gap-1.5 btn-primary text-xs py-1.5 px-3">
                  Connect via OAuth Redirect
                </a>
              ) : (
                <button onClick={() => testConnect(c)} disabled={connectingId === c.id}
                  className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-60">
                  {connectingId === c.id ? 'Connecting...' : 'Test Connect'}
                </button>
              )}
              {/* A saved refresh token can expire or be revoked by Salesforce over time (a real,
                  expected event, not a bug) - there's no way to "renew" one in place, only a
                  fresh interactive login, so this stays available even after the first connect
                  succeeded, not just before it. */}
              {c.authMethod === 'oauth_redirect' && c.refreshToken ? (
                <a href={buildAuthorizeHref(c)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                  Reconnect
                </a>
              ) : null}
              <button onClick={() => startEdit(c)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Edit</button>
              <button onClick={() => remove(c.id)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <div className="card p-5 space-y-4 border-2 border-indigo-200">
          <h3 className="text-sm font-bold text-slate-900">{connections.some((c) => c.id === editing.id) ? 'Edit Connection' : 'Add Connection'}</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Name</label>
            <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Prod - NeuraFlash"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">Auth Method</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['password', 'oauth_password', 'oauth_redirect'] as const).map((m) => (
                <label key={m} className={`flex items-start gap-2 rounded-lg border-2 p-2.5 cursor-pointer transition-colors ${
                  editing.authMethod === m ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300'
                }`}>
                  <input type="radio" name="auth-method" checked={editing.authMethod === m} onChange={() => setEditing({ ...editing, authMethod: m })} className="mt-0.5" />
                  <span className="text-sm font-semibold text-slate-900">{METHOD_LABELS[m]}</span>
                </label>
              ))}
            </div>
            {editing.authMethod === 'oauth_redirect' && !editing.refreshToken ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Fill in a Connected App and org below, then <span className="font-semibold">Save &amp; Connect</span> - it&apos;ll take you to Salesforce&apos;s real login/approve page. No password is entered here or stored by this app.
              </p>
            ) : null}
          </div>

          {editing.authMethod === 'password' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Username</label>
                <input type="text" value={editing.username || ''} onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={editing.password || ''} onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Security Token <span className="text-slate-500 font-normal normal-case">(optional)</span></label>
                <div className="relative">
                  <input type={showToken ? 'text' : 'password'} value={editing.securityToken || ''} onChange={(e) => setEditing({ ...editing, securityToken: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  <button type="button" onClick={() => setShowToken((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">{showToken ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <fieldset>
                <legend className="text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">Login Endpoint</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([{ value: 'login', label: 'Production' }, { value: 'test', label: 'Sandbox' }, { value: 'custom', label: 'Custom URL' }] as const).map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-2 rounded-lg border-2 p-2 cursor-pointer text-sm font-semibold ${editing.domain === opt.value ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200'}`}>
                      <input type="radio" name="domain" checked={editing.domain === opt.value} onChange={() => setEditing({ ...editing, domain: opt.value })} />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {editing.domain === 'custom' ? (
                  <input type="url" value={editing.customDomain || ''} onChange={(e) => setEditing({ ...editing, customDomain: e.target.value })}
                    placeholder="https://mydomain.my.salesforce.com"
                    className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                ) : null}
              </fieldset>
            </>
          ) : null}

          {editing.authMethod === 'oauth_password' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Org URL</label>
                <input type="text" value={editing.orgUrl || ''} onChange={(e) => setEditing({ ...editing, orgUrl: e.target.value })}
                  placeholder="https://yourdomain.my.salesforce.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Username</label>
                <input type="text" value={editing.username || ''} onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={editing.password || ''} onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Security Token <span className="text-slate-500 font-normal normal-case">(optional)</span></label>
                <div className="relative">
                  <input type={showToken ? 'text' : 'password'} value={editing.securityToken || ''} onChange={(e) => setEditing({ ...editing, securityToken: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  <button type="button" onClick={() => setShowToken((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">{showToken ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Consumer Key (Client ID)</label>
                <input type="text" value={editing.clientId || ''} onChange={(e) => setEditing({ ...editing, clientId: e.target.value })}
                  placeholder="Leave blank to use the server's shared Connected App config instead"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Consumer Secret</label>
                <div className="relative">
                  <input type={showClientSecret ? 'text' : 'password'} value={editing.clientSecret || ''} onChange={(e) => setEditing({ ...editing, clientSecret: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  <button type="button" onClick={() => setShowClientSecret((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">{showClientSecret ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">A Connected App Consumer Key + Secret is required for this mode - either saved here (per-connection) or configured once on the Connected App panel on Deployment Assistant&apos;s OAuth Redirect tab.</p>
            </>
          ) : null}

          {editing.authMethod === 'oauth_redirect' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Consumer Key (Client ID) {editing.refreshToken ? <span className="text-slate-500 font-normal normal-case">(optional)</span> : null}
                </label>
                <input type="text" value={editing.clientId || ''} onChange={(e) => setEditing({ ...editing, clientId: e.target.value })}
                  placeholder={editing.refreshToken ? "Leave blank to use the server's shared Connected App config instead" : undefined}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Consumer Secret {editing.refreshToken ? <span className="text-slate-500 font-normal normal-case">(optional)</span> : null}
                </label>
                <div className="relative">
                  <input type={showClientSecret ? 'text' : 'password'} value={editing.clientSecret || ''} onChange={(e) => setEditing({ ...editing, clientSecret: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  <button type="button" onClick={() => setShowClientSecret((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">{showClientSecret ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              {!editing.refreshToken ? (
                <fieldset>
                  <legend className="text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">Target Environment</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ value: 'login', label: 'Production' }, { value: 'test', label: 'Sandbox' }, { value: 'custom', label: 'Custom URL' }] as const).map((opt) => (
                      <label key={opt.value} className={`flex items-center gap-2 rounded-lg border-2 p-2 cursor-pointer text-sm font-semibold ${editing.domain === opt.value ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200'}`}>
                        <input type="radio" name="oauth-redirect-domain" checked={editing.domain === opt.value} onChange={() => setEditing({ ...editing, domain: opt.value })} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {editing.domain === 'custom' ? (
                    <input type="url" value={editing.customDomain || ''} onChange={(e) => setEditing({ ...editing, customDomain: e.target.value })}
                      placeholder="https://ne1785420174855.my.salesforce.com"
                      className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  ) : null}
                </fieldset>
              ) : (
                <p className="text-[11px] text-slate-500">Only needed if reconnecting later fails because the server&apos;s shared Connected App config was cleared or changed since this was saved.</p>
              )}
            </>
          ) : null}

          {/* Duplicated here (not just the banner near the top of the page) since this form can
              sit well below a long list of saved connections - without this, testing/saving
              from here silently updates a message the user has already scrolled past. */}
          {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div> : null}
          {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button onClick={() => setEditing(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Cancel</button>
            {editing.authMethod !== 'oauth_redirect' || editing.refreshToken ? (
              <button onClick={testConnectDraft} disabled={testingDraft}
                className="btn-ghost text-xs py-2 px-4 disabled:opacity-60">
                {testingDraft ? 'Testing...' : 'Test Connection'}
              </button>
            ) : null}
            {editing.authMethod === 'oauth_redirect' && editing.refreshToken ? (
              <button onClick={saveAndConnectOAuthRedirect}
                className="btn-ghost text-xs py-2 px-4">
                Reconnect via OAuth Redirect
              </button>
            ) : null}
            {editing.authMethod === 'oauth_redirect' && !editing.refreshToken ? (
              <button onClick={saveAndConnectOAuthRedirect}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-sm bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow hover:shadow-md disabled:opacity-50">
                Save &amp; Connect via OAuth Redirect
              </button>
            ) : (
              <button onClick={save}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-sm bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow hover:shadow-md disabled:opacity-50">
                Save
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
