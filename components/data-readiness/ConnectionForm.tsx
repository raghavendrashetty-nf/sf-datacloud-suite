'use client';

import { useEffect, useState } from 'react';
import type { ConnectionInfo, SFConnectionConfig } from '@/lib/dataReadiness';

interface Props {
  onConnected?: (info: ConnectionInfo) => void;
  apiEndpoint?: string;
  rememberKey?: string;
  title?: string;
}
type DomainChoice = 'login' | 'test' | 'custom';

interface RememberedCreds {
  username: string; password: string; securityToken: string;
  domainChoice: DomainChoice; instanceUrl: string; customDomain: string;
}

function readRemembered(key: string): RememberedCreds | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveRemembered(key: string, creds: RememberedCreds) {
  try { window.localStorage.setItem(key, JSON.stringify(creds)); } catch {}
}
function clearRemembered(key: string) {
  try { window.localStorage.removeItem(key); } catch {}
}

export default function ConnectionForm({
  onConnected,
  apiEndpoint = '/api/data-readiness/connection',
  rememberKey = 'sfdc.salesforceConnection.remember.v1',
  title = 'Connect to Salesforce'
}: Props) {
  const [info, setInfo] = useState<ConnectionInfo>({ connected: false });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  const [domainChoice, setDomainChoice] = useState<DomainChoice>('login');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connectWithConfig(config: SFConnectionConfig, rememberThis: boolean): Promise<boolean> {
    setError(null);
    try {
      const resp = await fetch(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      setInfo(j.info); onConnected?.(j.info);
      if (rememberThis) {
        saveRemembered(rememberKey, {
          username: config.username, password: config.password, securityToken: config.securityToken || '',
          domainChoice, instanceUrl: config.instanceUrl || '', customDomain
        });
      } else {
        clearRemembered(rememberKey);
      }
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Connection failed');
      return false;
    }
  }

  useEffect(() => {
    fetch(apiEndpoint).then((r) => r.json()).then(async (j) => {
      if (j?.info?.connected) { setInfo(j.info); return; }
      const remembered = readRemembered(rememberKey);
      if (remembered) {
        setUsername(remembered.username); setSecurityToken(remembered.securityToken);
        setDomainChoice(remembered.domainChoice); setInstanceUrl(remembered.instanceUrl); setCustomDomain(remembered.customDomain);
        setRemember(true);
        setAutoReconnecting(true);
        const domain = remembered.domainChoice === 'custom' ? (remembered.customDomain || remembered.instanceUrl) : remembered.domainChoice;
        const ok = await connectWithConfig(
          { username: remembered.username, password: remembered.password, securityToken: remembered.securityToken || undefined, domain, instanceUrl: remembered.instanceUrl || undefined },
          true
        );
        if (!ok) { clearRemembered(rememberKey); setError('Saved credentials no longer work - please reconnect.'); }
        setAutoReconnecting(false);
      }
    }).catch(() => {}).finally(() => setLoadingStatus(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiEndpoint, rememberKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    try {
      const domain = domainChoice === 'custom' ? (customDomain || instanceUrl) : domainChoice;
      const config: SFConnectionConfig = { username: username.trim(), password, securityToken: securityToken || undefined, domain, instanceUrl: instanceUrl.trim() || undefined };
      await connectWithConfig(config, remember);
    } finally { setConnecting(false); }
  }

  async function disconnect() {
    setConnecting(true);
    try { await fetch(apiEndpoint, { method: 'DELETE' }); clearRemembered(rememberKey); setInfo({ connected: false }); setRemember(false); }
    finally { setConnecting(false); }
  }

  if (loadingStatus || autoReconnecting) {
    return (
      <div className="card p-6 flex items-center gap-3 text-sm text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 animate-spin">
          <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
        </svg>
        {autoReconnecting ? 'Reconnecting with saved credentials...' : 'Checking connection status...'}
      </div>
    );
  }

  if (info.connected) {
    return (
      <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/50 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900">Connected to Salesforce</h3>
              {info.isSandbox ? <span className="chip bg-amber-100 text-amber-800 font-semibold">SANDBOX</span>
                              : <span className="chip bg-emerald-100 text-emerald-800 font-semibold">PRODUCTION</span>}
              {info.authMethod === 'oauth' ? (
                <span className="chip bg-indigo-100 text-indigo-800 font-semibold">
                  Connected via OAuth{info.hasRefreshToken ? ' (refresh token saved)' : ''}
                </span>
              ) : null}
              {readRemembered(rememberKey) ? <span className="chip bg-slate-100 text-slate-600 font-semibold">Remembered on this device</span> : null}
            </div>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              {info.displayName ? <div><dt className="inline text-slate-500">User: </dt><dd className="inline font-semibold text-slate-900">{info.displayName}</dd></div> : null}
              <div><dt className="inline text-slate-500">Username: </dt><dd className="inline font-mono text-slate-800 break-all">{info.username}</dd></div>
              {info.organizationName ? <div><dt className="inline text-slate-500">Org: </dt><dd className="inline font-semibold text-slate-900">{info.organizationName}</dd></div> : null}
              {info.instanceUrl ? <div className="sm:col-span-2"><dt className="inline text-slate-500">Instance: </dt><dd className="inline font-mono text-slate-800 break-all text-[11px]">{info.instanceUrl}</dd></div> : null}
            </dl>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={disconnect} disabled={connecting}
                className="text-xs text-rose-600 hover:text-rose-800 underline disabled:opacity-60">Disconnect{readRemembered(rememberKey) ? ' & forget' : ''}</button>
              {onConnected ? (
                <button type="button" onClick={() => onConnected(info)}
                  className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow hover:shadow-md">
                  Continue
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-1">Credentials are stored only in server memory and never persisted, unless you check &quot;Remember on this device&quot; below.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Username</label>
        <input type="email" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="you@company.com.sandboxname"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Password</label>
        <div className="relative">
          <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none" />
          <button type="button" onClick={() => setShowPassword((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Security Token <span className="text-slate-500 font-normal normal-case">(optional)</span></label>
        <div className="relative">
          <input type={showToken ? 'text' : 'password'} value={securityToken} onChange={(e) => setSecurityToken(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none" />
          <button type="button" onClick={() => setShowToken((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <fieldset>
        <legend className="text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">Login Endpoint</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([{ value: 'login', label: 'Production', hint: 'login.salesforce.com' },
             { value: 'test', label: 'Sandbox', hint: 'test.salesforce.com' },
             { value: 'custom', label: 'Custom URL', hint: 'My Domain' }] as { value: DomainChoice; label: string; hint: string }[]).map((opt) => (
            <label key={opt.value} className={`flex items-start gap-2 rounded-lg border-2 p-2.5 cursor-pointer transition-colors ${
              domainChoice === opt.value ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 hover:border-emerald-300'
            }`}>
              <input type="radio" name="domain" value={opt.value} checked={domainChoice === opt.value}
                onChange={() => setDomainChoice(opt.value)} className="mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                <div className="text-[11px] text-slate-500">{opt.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>
      {domainChoice === 'custom' ? (
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Custom login URL</label>
          <input type="url" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="https://mydomain.my.salesforce.com"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none" />
        </div>
      ) : null}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">Instance URL <span className="text-slate-500 font-normal normal-case">(optional)</span></label>
        <input type="url" value={instanceUrl} onChange={(e) => setInstanceUrl(e.target.value)}
          placeholder="https://mydomain--full.sandbox.my.salesforce.com"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none" />
      </div>
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
        <span>Remember these credentials on this device (stored in this browser&apos;s local storage, so you won&apos;t need to re-enter them next time - only do this on a device you trust).</span>
      </label>
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <div className="font-semibold mb-1">Connection failed</div>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
        <button type="submit" disabled={connecting || !username || !password}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow hover:shadow-md disabled:opacity-50">
          {connecting ? 'Connecting...' : 'Connect & Save'}
        </button>
      </div>
    </form>
  );
}
