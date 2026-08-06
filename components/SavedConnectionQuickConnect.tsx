'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listSavedConnections, touchSavedConnection, type SavedConnection } from '@/lib/savedConnections';
import type { ConnectionInfo } from '@/lib/dataReadiness';

interface Props {
  slot: 'primary' | 'target';
  onConnected: (info: ConnectionInfo) => void;
}

// Compact "pick a saved org and connect" control, embedded inline wherever a connect form
// already lives (Org Scanner, Deployment Assistant's source and target sections) - reads the
// same localStorage list the full Saved Connections manager page writes to, so a profile saved
// once from either place is immediately usable everywhere else.
export default function SavedConnectionQuickConnect({ slot, onConnected }: Props) {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setConnections(listSavedConnections()); }, []);

  if (connections.length === 0) return null;

  async function connect() {
    const c = connections.find((x) => x.id === selectedId);
    if (!c) return;
    setError(null);
    setConnecting(true);
    try {
      const body: any = { slot, authMethod: c.authMethod };
      if (c.authMethod === 'password') {
        Object.assign(body, { username: c.username, password: c.password, securityToken: c.securityToken, domain: c.domain, customDomain: c.customDomain, instanceUrl: c.instanceUrl });
      } else if (c.authMethod === 'oauth_password') {
        Object.assign(body, { orgUrl: c.orgUrl, username: c.username, password: c.password, securityToken: c.securityToken, clientId: c.clientId, clientSecret: c.clientSecret });
      } else {
        Object.assign(body, { refreshToken: c.refreshToken, instanceUrl: c.instanceUrl, clientId: c.clientId, clientSecret: c.clientSecret });
      }
      const resp = await fetch('/api/connections/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      touchSavedConnection(c.id, { orgName: j.info.organizationName, username: j.info.username, instanceUrl: j.info.instanceUrl });
      onConnected(j.info);
    } catch (e: any) {
      setError(e?.message ?? 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-700 shrink-0">Or use a saved connection:</span>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white">
          <option value="">Choose one...</option>
          {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={connect} disabled={!selectedId || connecting}
          className="btn-primary text-xs py-1.5 px-3 disabled:opacity-60 shrink-0">
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
        <Link href="/saved-connections" className="text-xs text-indigo-600 hover:text-indigo-800 shrink-0">Manage saved orgs</Link>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
