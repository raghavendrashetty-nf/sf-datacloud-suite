'use client';

import { useState } from 'react';

interface Props { oauthError?: string | null; }

// Step 1 of the real Salesforce OAuth 2.0 Web Server Flow: this button does a full browser
// navigation (not a fetch) to /api/deployment/oauth/authorize, which redirects to Salesforce's
// own login/approve page. Salesforce then redirects back to /api/deployment/oauth/callback,
// which exchanges the code for tokens and redirects here again - so this component itself never
// touches an authorization code or token directly.
export default function OAuthConnectCard({ oauthError }: Props) {
  const [sandbox, setSandbox] = useState(false);

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h3 className="text-base font-bold text-slate-900">Connect Second Org</h3>
        <p className="text-xs text-slate-500 mt-1">
          Recommended: connect via Salesforce&apos;s own login/approval page - no password ever passes through this app, and a refresh token is saved so you won&apos;t need to re-authenticate every session.
        </p>
      </div>

      {oauthError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <div className="font-semibold mb-1">Connection failed</div>
          <div>{oauthError}</div>
        </div>
      ) : null}

      <fieldset>
        <legend className="text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">Target Environment</legend>
        <div className="grid grid-cols-2 gap-2">
          {([{ value: false, label: 'Production', hint: 'login.salesforce.com' },
             { value: true, label: 'Sandbox', hint: 'test.salesforce.com' }] as const).map((opt) => (
            <label key={String(opt.value)} className={`flex items-start gap-2 rounded-lg border-2 p-2.5 cursor-pointer transition-colors ${
              sandbox === opt.value ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300'
            }`}>
              <input type="radio" name="oauth-env" checked={sandbox === opt.value} onChange={() => setSandbox(opt.value)} className="mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                <div className="text-[11px] text-slate-500">{opt.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <a href={`/api/deployment/oauth/authorize?sandbox=${sandbox}`}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow hover:shadow-md">
        Connect Second Org via OAuth
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
      <p className="text-[11px] text-slate-400">
        Requires a Salesforce Connected App registered for this app (Consumer Key/Secret + Callback URL). If this button errors, the server admin needs to set SF_OAUTH_CLIENT_ID / SF_OAUTH_CLIENT_SECRET / SF_OAUTH_REDIRECT_URI.
      </p>
    </div>
  );
}
