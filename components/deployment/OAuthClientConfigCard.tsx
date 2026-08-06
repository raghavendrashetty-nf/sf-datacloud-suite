'use client';

import { useEffect, useState } from 'react';

const REMEMBER_KEY = 'sfdc.oauthClientConfig.remember.v1';

interface Remembered { clientId: string; clientSecret: string; redirectUri: string; }
interface Status { configured: boolean; source: 'ui' | 'env' | null; clientId?: string; }

function readRemembered(): Remembered | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Lets a user set up the Connected App Consumer Key/Secret straight from the browser instead of
// editing .env.local and restarting the server - stored server-side in memory only (see
// lib/salesforceOAuth.ts's __sfOAuthClientConfig), never written to disk, cleared on restart.
// Needed by both the OAuth Redirect and URL+Username/Password connect modes (either way, a real
// Connected App is required - this app can't fabricate one).
export default function OAuthClientConfigCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const remembered = readRemembered();
    if (remembered) {
      setClientId(remembered.clientId); setClientSecret(remembered.clientSecret); setRedirectUri(remembered.redirectUri);
      setRemember(true);
    } else if (typeof window !== 'undefined') {
      setRedirectUri(`${window.location.origin}/api/deployment/oauth/callback`);
    }

    (async () => {
      try {
        const resp = await fetch('/api/deployment/oauth/config');
        const j = await resp.json();
        if (!j.configured && remembered?.clientId) {
          // Server-side config is in-memory only and doesn't survive a restart - if this
          // browser remembers a Client ID, silently restore it rather than making the user
          // reopen this card and click Save again every time the server restarts.
          const saveResp = await fetch('/api/deployment/oauth/config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: remembered.clientId, clientSecret: remembered.clientSecret || undefined, redirectUri: remembered.redirectUri || undefined })
          });
          setStatus(await saveResp.json());
        } else {
          setStatus(j);
        }
      } catch { /* leave status null - card shows "not configured" and user can set up manually */ }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const resp = await fetch('/api/deployment/oauth/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret: clientSecret || undefined, redirectUri: redirectUri || undefined })
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      if (remember) {
        try { window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ clientId, clientSecret, redirectUri })); } catch {}
      } else {
        try { window.localStorage.removeItem(REMEMBER_KEY); } catch {}
      }
      setStatus(j);
      setExpanded(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      const resp = await fetch('/api/deployment/oauth/config', { method: 'DELETE' });
      const j = await resp.json();
      setStatus(j);
      setClientId(''); setClientSecret(''); setRedirectUri(typeof window !== 'undefined' ? `${window.location.origin}/api/deployment/oauth/callback` : '');
      try { window.localStorage.removeItem(REMEMBER_KEY); } catch {}
      setRemember(false);
    } finally {
      setSaving(false);
    }
  }

  const configured = status?.configured ?? false;

  return (
    <div className="card p-4 space-y-3 border-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Connected App</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {configured ? (
              <>
                <span className="text-emerald-700 font-semibold">Configured</span>
                {status?.source === 'env' ? ' via server environment variables.' : ' via this browser (session only - cleared on server restart).'}
                {status?.clientId ? <span className="font-mono text-slate-400"> ({status.clientId.slice(0, 10)}...)</span> : null}
              </>
            ) : (
              <span className="text-amber-700 font-semibold">Not configured yet - required for OAuth-based connect modes.</span>
            )}
          </p>
        </div>
        <button type="button" onClick={() => setExpanded((s) => !s)}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 shrink-0">
          {expanded ? 'Hide' : configured ? 'Edit' : 'Set up'}
        </button>
      </div>

      {expanded ? (
        <form onSubmit={save} className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-[11px] text-slate-500">
            From a Salesforce Connected App (Setup &rarr; App Manager &rarr; your app &rarr; View, under &quot;API (Enable OAuth Settings)&quot;). Stored only in this server&apos;s memory for the current session - never written to disk.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Consumer Key (Client ID)</label>
            <input type="text" required value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
              Consumer Secret <span className="text-slate-500 font-normal normal-case">(required for URL+Username/Password mode; optional for OAuth Redirect if the Connected App is public)</span>
            </label>
            <div className="relative">
              <input type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
              <button type="button" onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
              Redirect URI <span className="text-slate-500 font-normal normal-case">(only needed for OAuth Redirect mode - must exactly match the Connected App&apos;s Callback URL)</span>
            </label>
            <input type="text" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="https://yourapp.example.com/api/deployment/oauth/callback"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
            <span>Remember on this device (stored in this browser&apos;s local storage, resubmitted automatically on future visits - only do this on a device you trust).</span>
          </label>
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{error}</div>
          ) : null}
          <div className="flex items-center justify-between gap-3 pt-1">
            {configured ? (
              <button type="button" onClick={clear} disabled={saving} className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50">
                Clear
              </button>
            ) : <span />}
            <button type="submit" disabled={saving || !clientId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-xs bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow hover:shadow-md disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
