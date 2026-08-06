'use client';

import { useEffect, useState } from 'react';
import type { ConnectionInfo } from '@/lib/dataReadiness';

interface Props { onConnected: (info: ConnectionInfo) => void; }

const REMEMBER_KEY = 'sfdc.targetConnection.oauthPassword.remember.v1';

interface Remembered { orgUrl: string; username: string; password: string; securityToken: string; }

function readRemembered(): Remembered | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// One form - org URL, username, password, optional security token - authenticates via OAuth's
// password grant (see /api/deployment/oauth-password) instead of the classic SOAP login(), so it
// works uniformly on production, sandbox, or scratch/dev orgs, including ones that have SOAP
// login specifically disabled. Still needs a Connected App Consumer Key+Secret configured
// server-side (that requirement never goes away with any OAuth path) - if that's missing, the
// API returns a clear setup message rather than a confusing auth failure.
export default function PasswordOAuthConnectCard({ onConnected }: Props) {
  const [orgUrl, setOrgUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [remember, setRemember] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const remembered = readRemembered();
    if (remembered) {
      setOrgUrl(remembered.orgUrl); setUsername(remembered.username);
      setPassword(remembered.password); setSecurityToken(remembered.securityToken);
      setRemember(true);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConnecting(true);
    try {
      const resp = await fetch('/api/deployment/oauth-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgUrl, username, password, securityToken: securityToken || undefined })
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      if (remember) {
        try { window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ orgUrl, username, password, securityToken })); } catch {}
      } else {
        try { window.localStorage.removeItem(REMEMBER_KEY); } catch {}
      }
      onConnected(j.info);
    } catch (e: any) {
      setError(e?.message ?? 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900">Connect Second Org</h3>
        <p className="text-xs text-slate-500 mt-1">
          Org URL + username + password - authenticates via OAuth&apos;s password grant (not the classic SOAP login), so it works even on orgs where SOAP login is disabled. Works for production, sandbox, or scratch/dev orgs - just paste that org&apos;s own URL.
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Org URL</label>
        <input type="text" required value={orgUrl} onChange={(e) => setOrgUrl(e.target.value)}
          placeholder="https://yourdomain.my.salesforce.com (or paste any org URL)"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Username</label>
        {/* type="text", not "email" - Salesforce usernames are email-SHAPED but many real ones
            (esp. sandbox/trial-org auto-generated suffixes like ...com2026_07_30.demo) fail
            strict browser email validation, which would silently block submission. */}
        <input type="text" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="you@company.com.sandboxname"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Password</label>
        <div className="relative">
          <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
          <button type="button" onClick={() => setShowPassword((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Security Token <span className="text-slate-500 font-normal normal-case">(optional - only needed if login fails without it)</span></label>
        <div className="relative">
          <input type={showToken ? 'text' : 'password'} value={securityToken} onChange={(e) => setSecurityToken(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
          <button type="button" onClick={() => setShowToken((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
        <span>Remember these credentials on this device (stored in this browser&apos;s local storage - only do this on a device you trust).</span>
      </label>
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <div className="font-semibold mb-1">Connection failed</div>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
        <button type="submit" disabled={connecting || !orgUrl || !username || !password}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow hover:shadow-md disabled:opacity-50">
          {connecting ? 'Connecting...' : 'Connect & Save'}
        </button>
      </div>
    </form>
  );
}
