'use client';

import { useEffect, useState } from 'react';
import type { ZendeskConnectionInfo, ZendeskConnectionConfig } from '@/lib/zendeskClient';

interface Props {
  onConnected?: (info: ZendeskConnectionInfo) => void;
}

export default function ZendeskConnectionForm({ onConnected }: Props) {
  const [info, setInfo] = useState<ZendeskConnectionInfo>({ connected: false });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [subdomain, setSubdomain] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/data-readiness/zendesk-connection')
      .then((r) => r.json())
      .then((j) => { if (j?.info) setInfo(j.info); })
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConnecting(true);
    try {
      const config: ZendeskConnectionConfig = {
        subdomain: subdomain.trim(),
        email: email.trim(),
        apiToken: apiToken.trim()
      };
      const resp = await fetch('/api/data-readiness/zendesk-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      setInfo(j.info);
      onConnected?.(j.info);
    } catch (e: any) {
      setError(e?.message ?? 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    setConnecting(true);
    try {
      await fetch('/api/data-readiness/zendesk-connection', { method: 'DELETE' });
      setInfo({ connected: false });
    } finally {
      setConnecting(false);
    }
  }

  if (loadingStatus) {
    return (
      <div className="card p-6 flex items-center gap-3 text-sm text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 animate-spin">
          <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
        </svg>
        Checking Zendesk connection status...
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
            <h3 className="text-base font-bold text-slate-900">Connected to Zendesk</h3>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <div><dt className="inline text-slate-500">Subdomain: </dt><dd className="inline font-mono text-slate-800">{info.subdomain}</dd></div>
              <div><dt className="inline text-slate-500">Email: </dt><dd className="inline font-mono text-slate-800 break-all">{info.email}</dd></div>
              {info.accountName ? <div><dt className="inline text-slate-500">Account: </dt><dd className="inline font-semibold text-slate-900">{info.accountName}</dd></div> : null}
              {info.plan ? <div><dt className="inline text-slate-500">Plan: </dt><dd className="inline text-slate-800">{info.plan}</dd></div> : null}
              {info.apiBaseUrl ? <div className="sm:col-span-2"><dt className="inline text-slate-500">API: </dt><dd className="inline font-mono text-slate-800 break-all text-[11px]">{info.apiBaseUrl}</dd></div> : null}
            </dl>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={disconnect} disabled={connecting}
                className="text-xs text-rose-600 hover:text-rose-800 underline disabled:opacity-60">
                Disconnect
              </button>
              {onConnected ? (
                <button type="button" onClick={() => onConnected(info)}
                  className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow hover:shadow-md">
                  Continue
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
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
        <h3 className="text-base font-bold text-slate-900">Connect to Zendesk</h3>
        <p className="text-xs text-slate-500 mt-1">
          Enter your Zendesk credentials. Credentials are stored only in server memory and never persisted.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
          Subdomain
        </label>
        <div className="flex items-stretch rounded-lg border border-slate-300 overflow-hidden focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-200">
          <input type="text" required autoComplete="off"
            value={subdomain} onChange={(e) => setSubdomain(e.target.value)}
            placeholder="acme"
            className="flex-1 min-w-0 px-3 py-2 text-sm outline-none" />
          <span className="px-3 flex items-center text-xs text-slate-500 border-l border-slate-200 bg-slate-50">.zendesk.com</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Just the subdomain part - e.g. <code>acme</code> from <code>acme.zendesk.com</code>.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
          Agent Email
        </label>
        <input type="email" required autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="agent@acme.com"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none" />
        <p className="mt-1 text-[11px] text-slate-500">
          The email of a Zendesk agent or admin. The API token below authenticates as this user.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
          API Token
        </label>
        <div className="relative">
          <input type={showToken ? 'text' : 'password'} required
            value={apiToken} onChange={(e) => setApiToken(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm font-mono focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none" />
          <button type="button" onClick={() => setShowToken((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5">
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Generate from <strong>Zendesk Admin Center &rarr; Apps &amp; integrations &rarr; Zendesk API &rarr; Tokens</strong>.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <div className="font-semibold mb-1">Connection failed</div>
          <div>{error}</div>
          <ul className="mt-2 list-disc list-inside space-y-0.5 text-rose-600">
            <li>Verify subdomain (e.g. <code>acme</code>, not the full URL).</li>
            <li>Verify email is a valid Zendesk agent or admin.</li>
            <li>API token must be active - check under Admin Center &rarr; Apps &amp; integrations &rarr; APIs &rarr; Tokens.</li>
            <li>If your Zendesk uses IP restrictions, allowlist this server's egress IP.</li>
          </ul>
        </div>
      ) : null}

      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
        <button type="submit" disabled={connecting || !subdomain || !email || !apiToken}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow hover:shadow-md disabled:opacity-50">
          {connecting ? 'Connecting...' : 'Connect & Save'}
        </button>
      </div>
    </form>
  );
}