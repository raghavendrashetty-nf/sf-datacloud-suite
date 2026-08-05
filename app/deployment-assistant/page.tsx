'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import CollapsibleSection from '@/components/CollapsibleSection';
import ConnectionForm from '@/components/data-readiness/ConnectionForm';
import OAuthConnectCard from '@/components/deployment/OAuthConnectCard';
import { streamNdjson } from '@/lib/streamNdjson';
import type { ConnectionInfo } from '@/lib/dataReadiness';
import type { DeployableCategory } from '@/lib/deploymentPackage';

interface DeployOutcome {
  id: string; done: boolean; success: boolean; status: string;
  numberComponentsDeployed: number; numberComponentsTotal: number; numberComponentErrors: number;
  checkOnly: boolean; errorMessage?: string;
  componentFailures: { fullName: string; componentType?: string; problem?: string }[];
}

function ProgressPanel({ messages, active }: { messages: string[]; active: boolean }) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  if (!active && messages.length === 0) return null;
  const elapsedSec = Math.max(0, Math.floor((nowTick - startedAt) / 1000));
  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-indigo-800">
          {messages.length > 0 ? messages[messages.length - 1] : 'Working...'}
        </span>
        {active ? <span className="text-[11px] text-indigo-600 shrink-0 tabular-nums">{elapsedSec}s elapsed</span> : null}
      </div>
      {messages.length > 1 ? (
        <ul className="mt-2 max-h-28 overflow-y-auto space-y-0.5 border-t border-indigo-100 pt-1.5">
          {messages.slice(0, -1).slice(-8).map((m, i) => <li key={i} className="text-[11px] text-indigo-700/80">{m}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

const DEPLOYMENT_SESSION_KEY = 'sfdc.deploymentAssistant.session.v1';

function downloadDataUri(name: string, uri: string) {
  const a = document.createElement('a');
  a.href = uri; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function DeploymentAssistantPage() {
  const [sourceConnection, setSourceConnection] = useState<ConnectionInfo>({ connected: false });
  const [targetConnection, setTargetConnection] = useState<ConnectionInfo>({ connected: false });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [showPasswordFallback, setShowPasswordFallback] = useState(false);

  // Picks up ?oauth_error=... or ?target_connected=1 after the OAuth redirect round-trip lands
  // back here, then cleans the URL so a refresh doesn't re-show a stale error. Also checks
  // target-connection status directly (rather than relying on ConnectionForm's own mount-time
  // check) since ConnectionForm isn't always mounted here - it's hidden behind the OAuth card
  // until connected, so something has to detect "already connected via OAuth" independently.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('oauth_error');
    if (err) setOauthError(err);
    if (err || params.get('target_connected')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    fetch('/api/deployment/target-connection').then((r) => r.json()).then((j) => {
      if (j?.info?.connected) setTargetConnection(j.info);
    }).catch(() => {});
  }, []);

  const [discovering, setDiscovering] = useState(false);
  const [discoverMessages, setDiscoverMessages] = useState<string[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [categories, setCategories] = useState<DeployableCategory[] | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const [packaging, setPackaging] = useState(false);
  const [packageMessages, setPackageMessages] = useState<string[]>([]);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packageXml, setPackageXml] = useState<string | null>(null);
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState<number | null>(null);

  // The OAuth "Connect Second Org" step is a full browser navigation away to Salesforce and
  // back, which remounts this page and wipes plain React state - without this, a user who
  // discovers/selects/packages components and THEN connects the target org via OAuth would lose
  // all of that progress. Persisted to sessionStorage (not localStorage - this is throwaway
  // in-progress state, not something to keep across browser sessions) and rehydrated on mount.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DEPLOYMENT_SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.categories) setCategories(saved.categories);
      if (saved.selectedEntries) {
        setSelected(Object.fromEntries((saved.selectedEntries as [string, string[]][]).map(([k, v]) => [k, new Set(v)])));
      }
      if (saved.packageXml) setPackageXml(saved.packageXml);
      if (saved.zipBase64) setZipBase64(saved.zipBase64);
      if (typeof saved.fileCount === 'number') setFileCount(saved.fileCount);
    } catch { /* malformed/absent - ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(DEPLOYMENT_SESSION_KEY, JSON.stringify({
        categories, selectedEntries: Object.entries(selected).map(([k, v]) => [k, Array.from(v)]),
        packageXml, zipBase64, fileCount
      }));
    } catch { /* storage unavailable/full - non-critical, just skip persistence */ }
  }, [categories, selected, packageXml, zipBase64, fileCount]);

  const [validating, setValidating] = useState(false);
  const [validateMessages, setValidateMessages] = useState<string[]>([]);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [validation, setValidation] = useState<DeployOutcome | null>(null);

  const [deploying, setDeploying] = useState(false);
  const [deployMessages, setDeployMessages] = useState<string[]>([]);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<DeployOutcome | null>(null);

  async function discoverComponents() {
    setDiscoverError(null);
    setCategories(null);
    setSelected({});
    setDiscoverMessages([]);
    setDiscovering(true);
    try {
      await streamNdjson('/api/deployment/components', { method: 'POST' }, (msg) => {
        if (msg.type === 'progress') setDiscoverMessages((prev) => [...prev, msg.message]);
        else if (msg.type === 'done') setCategories(msg.categories as DeployableCategory[]);
        else if (msg.type === 'error') setDiscoverError(msg.message);
      });
    } catch (e: any) {
      setDiscoverError(e?.message ?? 'Request failed');
    } finally {
      setDiscovering(false);
    }
  }

  function toggleCategory(xmlName: string, allFullNames: string[], on: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      next[xmlName] = on ? new Set(allFullNames) : new Set();
      return next;
    });
  }
  function toggleItem(xmlName: string, fullName: string, on: boolean) {
    setSelected((prev) => {
      const existing = new Set(prev[xmlName] ?? []);
      if (on) existing.add(fullName); else existing.delete(fullName);
      return { ...prev, [xmlName]: existing };
    });
  }

  const totalSelected = Object.values(selected).reduce((sum, s) => sum + s.size, 0);

  async function createPackage() {
    setPackageError(null);
    setPackageXml(null);
    setZipBase64(null);
    setFileCount(null);
    setPackageMessages([]);
    setValidation(null);
    setDeployResult(null);
    setPackaging(true);
    try {
      const selections = Object.entries(selected)
        .filter(([, s]) => s.size > 0)
        .map(([xmlName, s]) => ({ xmlName, members: Array.from(s) }));
      await streamNdjson('/api/deployment/package', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections })
      }, (msg) => {
        if (msg.type === 'progress') setPackageMessages((prev) => [...prev, msg.message]);
        else if (msg.type === 'done') { setPackageXml(msg.packageXml); setZipBase64(msg.zipBase64); setFileCount(msg.fileCount); }
        else if (msg.type === 'error') setPackageError(msg.message);
      });
    } catch (e: any) {
      setPackageError(e?.message ?? 'Request failed');
    } finally {
      setPackaging(false);
    }
  }

  async function runDeploy(checkOnly: boolean, validatedDeployId?: string) {
    const setMsgs = checkOnly ? setValidateMessages : setDeployMessages;
    const setErr = checkOnly ? setValidateError : setDeployError;
    const setBusy = checkOnly ? setValidating : setDeploying;
    const setResult = checkOnly ? setValidation : setDeployResult;
    setErr(null);
    setResult(null);
    setMsgs([]);
    setBusy(true);
    try {
      const body = validatedDeployId ? { validatedDeployId } : { zipBase64, checkOnly };
      await streamNdjson('/api/deployment/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }, (msg) => {
        if (msg.type === 'progress') setMsgs((prev) => [...prev, msg.message]);
        else if (msg.type === 'done') setResult(msg.outcome as DeployOutcome);
        else if (msg.type === 'error') setErr(msg.message);
      });
    } catch (e: any) {
      setErr(e?.message ?? 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold">
            Stage 4 &middot; Deployment
          </div>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">AI-Assisted Deployment</h1>
          <p className="mt-2 text-slate-600 max-w-2xl">
            Bundle real Data Cloud components from a source org into a deployable package, then validate and deploy it to a target org - via Salesforce&apos;s standard Metadata API, the same mechanism used for Apex/Flow deployments.
          </p>
          <p className="mt-2 text-xs text-slate-500 max-w-2xl">
            Only component types confirmed deployable in Salesforce&apos;s own Metadata API documentation are selectable below. Data Spaces must already exist (with matching names) in the target org, and connector credentials never migrate - both are real Salesforce limitations, not gaps in this tool.
          </p>
        </div>

        <div className="mb-6">
          <ConnectionForm onConnected={setSourceConnection} title="Connect Source Org" />
        </div>

        {sourceConnection.connected ? (
          <div className="card p-5 mb-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">1. Discover Deployable Components</h2>
                <p className="text-xs text-slate-500 mt-1">Reads real, currently-configured components from the source org. Read-only - nothing is changed.</p>
              </div>
              <button onClick={discoverComponents} disabled={discovering} className="btn-primary text-sm disabled:opacity-60 shrink-0">
                {discovering ? 'Discovering...' : categories ? 'Re-scan' : 'Discover Components'}
              </button>
            </div>
            <ProgressPanel messages={discoverMessages} active={discovering} />
            {discoverError ? <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{discoverError}</p> : null}
          </div>
        ) : null}

        {categories ? (
          <div className="card p-5 mb-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900">2. Select Components to Package</h2>
              <p className="text-xs text-slate-500">{totalSelected} component(s) selected</p>
            </div>
            <div className="mt-3 space-y-2">
              {categories.map((cat) => {
                const items = cat.items;
                const allNames = items.map((i) => i.fullName);
                const selectedSet = selected[cat.xmlName] ?? new Set<string>();
                const allSelected = items.length > 0 && allNames.every((n) => selectedSet.has(n));
                return (
                  <CollapsibleSection
                    key={cat.xmlName}
                    title={`${cat.category} (${items.length})${cat.supported ? '' : ' - not packageable'}`}
                    defaultOpen={false}>
                    {!cat.supported ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">{cat.unsupportedReason}</p>
                    ) : (
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
                        <input type="checkbox" checked={allSelected} onChange={(e) => toggleCategory(cat.xmlName, allNames, e.target.checked)} />
                        Select all {items.length}
                      </label>
                    )}
                    <ul className="space-y-1">
                      {items.map((it) => (
                        <li key={it.fullName} className="text-xs flex items-center gap-2 px-2.5 py-1 border border-slate-200 rounded-lg">
                          <input type="checkbox" disabled={!cat.supported} checked={selectedSet.has(it.fullName)}
                            onChange={(e) => toggleItem(cat.xmlName, it.fullName, e.target.checked)} />
                          <span className="font-semibold text-slate-900">{it.label}</span>
                          {it.label !== it.fullName ? <span className="text-slate-500">({it.fullName})</span> : null}
                        </li>
                      ))}
                      {items.length === 0 ? <li className="text-xs text-slate-500">None found in this org.</li> : null}
                    </ul>
                  </CollapsibleSection>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button onClick={createPackage} disabled={packaging || totalSelected === 0} className="btn-primary text-sm disabled:opacity-60">
                {packaging ? 'Creating Package...' : `Create Package (${totalSelected})`}
              </button>
            </div>
            <ProgressPanel messages={packageMessages} active={packaging} />
            {packageError ? <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{packageError}</p> : null}
          </div>
        ) : null}

        {packageXml && zipBase64 ? (
          <div className="card p-5 mb-6">
            <h2 className="text-sm font-bold text-slate-900">3. Package Ready</h2>
            <p className="text-xs text-slate-500 mt-1">{fileCount} file(s) retrieved from the source org.</p>
            <CollapsibleSection title="View package.xml manifest" defaultOpen={false}>
              <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{packageXml}</pre>
            </CollapsibleSection>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => downloadDataUri('package.xml', `data:text/xml;charset=utf-8,${encodeURIComponent(packageXml)}`)}
                className="btn-ghost text-sm py-1.5 px-3">Download package.xml</button>
              <button onClick={() => downloadDataUri('package.zip', `data:application/zip;base64,${zipBase64}`)}
                className="btn-ghost text-sm py-1.5 px-3">Download package.zip</button>
            </div>
          </div>
        ) : null}

        {packageXml && zipBase64 ? (
          <div className="mb-6 space-y-3">
            {targetConnection.connected ? (
              <ConnectionForm onConnected={setTargetConnection} apiEndpoint="/api/deployment/target-connection"
                rememberKey="sfdc.targetConnection.remember.v1" title="Connect Target Org" />
            ) : (
              <>
                <OAuthConnectCard oauthError={oauthError} />
                <div className="text-center">
                  <button type="button" onClick={() => setShowPasswordFallback((s) => !s)}
                    className="text-xs text-slate-500 hover:text-slate-800 underline">
                    {showPasswordFallback ? 'Hide' : 'Or connect with username & password instead'}
                  </button>
                </div>
                {showPasswordFallback ? (
                  <ConnectionForm onConnected={setTargetConnection} apiEndpoint="/api/deployment/target-connection"
                    rememberKey="sfdc.targetConnection.remember.v1" title="Connect Target Org (Username & Password)" />
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {packageXml && zipBase64 && targetConnection.connected ? (
          <div className="card p-5 mb-6">
            <h2 className="text-sm font-bold text-slate-900">4. Validate Deploy (Dry Run)</h2>
            <p className="text-xs text-slate-500 mt-1">Runs a checkOnly validation against the target org - nothing actually changes yet. Always required before a real deploy.</p>
            <div className="mt-3 flex items-center justify-end">
              <button onClick={() => runDeploy(true)} disabled={validating} className="btn-primary text-sm disabled:opacity-60">
                {validating ? 'Validating...' : 'Validate (Dry Run)'}
              </button>
            </div>
            <ProgressPanel messages={validateMessages} active={validating} />
            {validateError ? <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{validateError}</p> : null}
            {validation ? (
              <div className={`mt-3 rounded-lg border p-3 ${validation.success ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                <p className={`text-xs font-bold ${validation.success ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {validation.success ? 'Validation succeeded' : 'Validation failed'} - {validation.numberComponentsDeployed}/{validation.numberComponentsTotal} component(s), {validation.numberComponentErrors} error(s)
                </p>
                {validation.componentFailures.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {validation.componentFailures.map((f, i) => (
                      <li key={i} className="text-[11px] text-rose-700">{f.fullName} ({f.componentType}): {f.problem}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {validation?.success ? (
          <div className="card p-5 mb-6">
            <h2 className="text-sm font-bold text-slate-900">5. Deploy for Real</h2>
            <p className="text-xs text-slate-500 mt-1">Deploys the validated request above into the target org - this is the one step that actually changes the target org.</p>
            <div className="mt-3 flex items-center justify-end">
              <button onClick={() => runDeploy(false, validation.id)} disabled={deploying} className="btn-primary text-sm disabled:opacity-60 bg-rose-600 hover:bg-rose-700">
                {deploying ? 'Deploying...' : 'Deploy for Real'}
              </button>
            </div>
            <ProgressPanel messages={deployMessages} active={deploying} />
            {deployError ? <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{deployError}</p> : null}
            {deployResult ? (
              <div className={`mt-3 rounded-lg border p-3 ${deployResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                <p className={`text-xs font-bold ${deployResult.success ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {deployResult.success ? 'Deploy succeeded' : 'Deploy failed'} - {deployResult.numberComponentsDeployed}/{deployResult.numberComponentsTotal} component(s), {deployResult.numberComponentErrors} error(s)
                </p>
                {deployResult.componentFailures.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {deployResult.componentFailures.map((f, i) => (
                      <li key={i} className="text-[11px] text-rose-700">{f.fullName} ({f.componentType}): {f.problem}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <footer className="py-6 text-center text-xs text-slate-500">
        Not affiliated with Salesforce.
      </footer>
    </main>
  );
}
