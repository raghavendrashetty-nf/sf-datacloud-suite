'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import CollapsibleSection from '@/components/CollapsibleSection';
import ConnectionForm from '@/components/data-readiness/ConnectionForm';
import OAuthConnectCard from '@/components/deployment/OAuthConnectCard';
import PasswordOAuthConnectCard from '@/components/deployment/PasswordOAuthConnectCard';
import OAuthClientConfigCard from '@/components/deployment/OAuthClientConfigCard';
import SavedConnectionQuickConnect from '@/components/SavedConnectionQuickConnect';
import { upsertSavedConnection, newSavedConnectionId } from '@/lib/savedConnections';
import { streamNdjson } from '@/lib/streamNdjson';
import type { ConnectionInfo } from '@/lib/dataReadiness';
import { DEPLOYMENT_ORDER_NOTE } from '@/lib/deploymentPackage';
import type { DeployableCategory } from '@/lib/deploymentPackage';

interface DataKitSummary { name: string; label: string; description?: string }

interface DeployComponentFailure {
  fullName: string; componentType?: string; problemType?: string; problem?: string;
  fileName?: string; lineNumber?: number; columnNumber?: number;
}
interface DeployOutcome {
  id: string; done: boolean; success: boolean; status: string;
  numberComponentsDeployed: number; numberComponentsTotal: number; numberComponentErrors: number;
  checkOnly: boolean; errorMessage?: string;
  componentFailures: DeployComponentFailure[];
}

interface MissingDependency { xmlName: string; memberName: string }

// Salesforce's own deploy-time dependency errors consistently take this shape - confirmed live
// across several real, different types: "In field: DeveloperName - no MktDataTranObject named X
// found", "...no CustomObject named Y__dlm found", "...no InternalDataConnector named Z found".
// Parsing this lets the UI offer to include the missing piece directly instead of making the user
// go read the error, find the matching category, and select it by hand every time.
const MISSING_DEPENDENCY_RE = /no ([A-Za-z][\w]*) named ([\w.\-]+) found/i;

function extractMissingDeps(failures: DeployComponentFailure[]): MissingDependency[] {
  const seen = new Set<string>();
  const out: MissingDependency[] = [];
  for (const f of failures) {
    const m = f.problem?.match(MISSING_DEPENDENCY_RE);
    if (!m) continue;
    const key = `${m[1]}::${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ xmlName: m[1], memberName: m[2] });
  }
  return out;
}

// Shown under a failed validate/deploy result, only for the component-selection flow (Data Kit
// mode has no `selected` map to merge into). Filters out anything already in the current
// selection - if it's still failing after being included, it's a different, unresolvable-by-this-
// mechanism problem (e.g. the Segment includeCriteria gap) and re-offering it would just loop.
function MissingDepsPanel({
  failures, categories, selected, retrying, onInclude
}: {
  failures: DeployComponentFailure[]; categories: DeployableCategory[] | null;
  selected: Record<string, Set<string>>; retrying: boolean;
  onInclude: (deps: MissingDependency[]) => void;
}) {
  const deps = extractMissingDeps(failures).filter((d) => !selected[d.xmlName]?.has(d.memberName));
  if (deps.length === 0) return null;

  const annotated = deps.map((d) => {
    const cat = categories?.find((c) => c.xmlName === d.xmlName);
    return { ...d, label: cat?.category ?? d.xmlName, blocked: cat ? !cat.supported : false, reason: cat?.unsupportedReason };
  });
  const includable = annotated.filter((d) => !d.blocked);

  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="text-xs font-bold text-amber-800">Missing dependenc{annotated.length > 1 ? 'ies' : 'y'} detected</p>
      <ul className="mt-1.5 space-y-1">
        {annotated.map((d, i) => (
          <li key={i} className="text-[11px] text-amber-800">
            <span className="font-mono">{d.memberName}</span> ({d.label})
            {d.blocked ? <span className="text-rose-700"> - can&apos;t be auto-included: {d.reason}</span> : null}
          </li>
        ))}
      </ul>
      {includable.length > 0 ? (
        <button onClick={() => onInclude(includable)} disabled={retrying}
          className="mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg font-semibold text-xs bg-amber-600 text-white shadow hover:shadow-md disabled:opacity-60">
          {retrying ? 'Including & retrying...' : `Include ${includable.length} missing component(s) & retry`}
        </button>
      ) : null}
    </div>
  );
}

function buildDeployLogText(kind: string, messages: string[], outcome: DeployOutcome | null, error: string | null): string {
  const lines: string[] = [];
  lines.push(`# ${kind} log - ${new Date().toISOString()}`, '');
  lines.push('## Progress', ...messages.map((m) => `- ${m}`), '');
  if (error) lines.push('## Request Error', error, '');
  if (outcome) {
    lines.push('## Outcome', JSON.stringify({
      id: outcome.id, status: outcome.status, success: outcome.success, checkOnly: outcome.checkOnly,
      numberComponentsDeployed: outcome.numberComponentsDeployed, numberComponentsTotal: outcome.numberComponentsTotal,
      numberComponentErrors: outcome.numberComponentErrors, errorMessage: outcome.errorMessage
    }, null, 2), '');
    if (outcome.componentFailures.length > 0) {
      lines.push('## Component Failures', JSON.stringify(outcome.componentFailures, null, 2), '');
    }
  }
  return lines.join('\n');
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
const OAUTH_REDIRECT_REMEMBER_KEY = 'sfdc.targetConnection.oauthRedirect.remember.v1';
const OAUTH_PASSWORD_REMEMBER_KEY = 'sfdc.targetConnection.oauthPassword.remember.v1';

function downloadDataUri(name: string, uri: string) {
  const a = document.createElement('a');
  a.href = uri; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function DeploymentAssistantPage() {
  const [sourceConnection, setSourceConnection] = useState<ConnectionInfo>({ connected: false });
  const [targetConnection, setTargetConnection] = useState<ConnectionInfo>({ connected: false });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [targetConnectMode, setTargetConnectMode] = useState<'password_oauth' | 'redirect_oauth' | 'legacy_password'>('password_oauth');

  // Picks up ?oauth_error=... or ?target_connected=1 (and, if "Remember this connection" was
  // checked, ?token_handoff=...) after the OAuth redirect round-trip lands back here, then cleans
  // the URL so a refresh doesn't re-show a stale error or re-consume an already-used handoff code.
  // Also checks target-connection status directly (rather than relying on ConnectionForm's own
  // mount-time check) since ConnectionForm isn't always mounted here - it's hidden behind the
  // OAuth card until connected, so something has to detect "already connected via OAuth"
  // independently. If not connected, falls back to silently reconnecting from a remembered OAuth
  // Redirect refresh token, if one was saved on this device - this is what lets that connection
  // survive a server restart (server-memory cache alone wouldn't survive one).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('oauth_error');
    const handoffCode = params.get('token_handoff');
    if (err) setOauthError(err);
    if (err || params.get('target_connected') || handoffCode) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    (async () => {
      let handoffRefreshToken: string | null = null;
      let handoffInstanceUrl: string | null = null;
      if (handoffCode) {
        try {
          const resp = await fetch(`/api/deployment/oauth/token-handoff?code=${encodeURIComponent(handoffCode)}`);
          const j = await resp.json();
          if (resp.ok && j.refreshToken) {
            handoffRefreshToken = j.refreshToken;
            handoffInstanceUrl = j.instanceUrl;
            window.localStorage.setItem(OAUTH_REDIRECT_REMEMBER_KEY, JSON.stringify({ refreshToken: j.refreshToken, instanceUrl: j.instanceUrl }));
          }
        } catch { /* handoff is best-effort - connection already succeeded either way */ }
      }

      try {
        const resp = await fetch('/api/deployment/target-connection');
        const j = await resp.json();
        if (j?.info?.connected) {
          setTargetConnection(j.info);
          // A fresh "Remember this connection" handoff just landed - also add it to the named
          // Saved Connections list (not just the single fixed remember slot above), so it's
          // reusable by name from Org Scanner or as a source connection too, not only as this
          // one deployment target.
          if (handoffRefreshToken) {
            upsertSavedConnection({
              id: newSavedConnectionId(),
              name: j.info.organizationName ? `${j.info.organizationName} (OAuth)` : (j.info.username || 'OAuth Connection'),
              authMethod: 'oauth_redirect',
              createdAt: new Date().toISOString(),
              lastUsedAt: new Date().toISOString(),
              refreshToken: handoffRefreshToken,
              instanceUrl: handoffInstanceUrl || j.info.instanceUrl,
              lastKnownOrgName: j.info.organizationName,
              lastKnownUsername: j.info.username,
              lastKnownInstanceUrl: j.info.instanceUrl
            });
          }
          return;
        }
      } catch { /* fall through to remembered-connection attempt below */ }

      try {
        const raw = window.localStorage.getItem(OAUTH_REDIRECT_REMEMBER_KEY);
        if (!raw) return;
        const { refreshToken, instanceUrl } = JSON.parse(raw);
        const resp = await fetch('/api/deployment/oauth/reconnect', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken, instanceUrl })
        });
        const j = await resp.json();
        if (resp.ok && j.info) setTargetConnection(j.info);
        else window.localStorage.removeItem(OAUTH_REDIRECT_REMEMBER_KEY);
      } catch { /* no remembered connection, or reconnect failed - user just connects manually */ }
    })();
  }, []);

  const [packageMode, setPackageMode] = useState<'components' | 'datakit'>('components');

  const [discovering, setDiscovering] = useState(false);
  const [discoverMessages, setDiscoverMessages] = useState<string[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [categories, setCategories] = useState<DeployableCategory[] | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const [dataKits, setDataKits] = useState<DataKitSummary[] | null>(null);
  const [loadingDataKits, setLoadingDataKits] = useState(false);
  const [dataKitsError, setDataKitsError] = useState<string | null>(null);
  const [selectedDataKit, setSelectedDataKit] = useState<string>('');

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

  const [retryingDeps, setRetryingDeps] = useState(false);

  // Adds each missing dependency straight into the existing selection (so it also shows checked
  // in "2. Select Components to Package" if that category is displayed) and re-packages +
  // re-validates - confirmed live this is exactly what resolves the recurring "no X named Y
  // found" failures. Naturally supports a dependency chain: if the new validation surfaces
  // another missing piece, the same panel reappears offering to include that one too.
  async function includeMissingDepsAndRetry(deps: MissingDependency[]) {
    setRetryingDeps(true);
    try {
      const merged: Record<string, Set<string>> = {};
      for (const [k, v] of Object.entries(selected)) merged[k] = new Set(v);
      for (const d of deps) {
        const existing = new Set(merged[d.xmlName] ?? []);
        existing.add(d.memberName);
        merged[d.xmlName] = existing;
      }
      setSelected(merged);
      const selections = Object.entries(merged).filter(([, s]) => s.size > 0).map(([xmlName, s]) => ({ xmlName, members: Array.from(s) }));
      const newZip = await packageSelections(selections);
      if (newZip) await runDeploy(true, newZip);
    } finally {
      setRetryingDeps(false);
    }
  }

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

  // A Data Stream stores only a reference (by DeveloperName) to its Data Lake Object, not a
  // copy - confirmed live, repeatedly: deploying a Data Stream without its matching DLO selected
  // fails with "no MktDataTranObject named X found". Auto-selecting the same-named DLO whenever
  // a Data Stream is checked removes this recurring miss instead of relying on a user remembering
  // to select both every time.
  const STREAM_XML_NAME = 'DataStreamDefinition';
  const DLO_XML_NAME = 'MktDataTranObject';

  function autoSelectMatchingDlo(next: Record<string, Set<string>>, fullNames: string[]) {
    const dloCategory = categories?.find((c) => c.xmlName === DLO_XML_NAME);
    if (!dloCategory) return;
    const dloExisting = new Set(next[DLO_XML_NAME] ?? []);
    for (const fn of fullNames) {
      if (dloCategory.items.some((it) => it.fullName === fn)) dloExisting.add(fn);
    }
    next[DLO_XML_NAME] = dloExisting;
  }

  function toggleCategory(xmlName: string, allFullNames: string[], on: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      next[xmlName] = on ? new Set(allFullNames) : new Set();
      if (on && xmlName === STREAM_XML_NAME) autoSelectMatchingDlo(next, allFullNames);
      return next;
    });
  }
  function toggleItem(xmlName: string, fullName: string, on: boolean) {
    setSelected((prev) => {
      const existing = new Set(prev[xmlName] ?? []);
      if (on) existing.add(fullName); else existing.delete(fullName);
      const next = { ...prev, [xmlName]: existing };
      if (on && xmlName === STREAM_XML_NAME) autoSelectMatchingDlo(next, [fullName]);
      return next;
    });
  }

  useEffect(() => {
    if (packageMode === 'datakit' && sourceConnection.connected && dataKits === null && !loadingDataKits) {
      loadDataKits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageMode, sourceConnection.connected]);

  const totalSelected = Object.values(selected).reduce((sum, s) => sum + s.size, 0);

  // Returns the fresh zipBase64 directly (in addition to updating state for display) so a caller
  // can immediately chain into runDeploy() without racing React's async state updates - reading
  // the `zipBase64` state variable right after calling setZipBase64() in the same tick would still
  // see the OLD value, since state updates aren't applied synchronously.
  async function packageSelections(selections: { xmlName: string; members: string[] }[]): Promise<string | null> {
    setPackageError(null);
    setPackageXml(null);
    setZipBase64(null);
    setFileCount(null);
    setPackageMessages([]);
    setValidation(null);
    setDeployResult(null);
    setPackaging(true);
    let resultZip: string | null = null;
    try {
      await streamNdjson('/api/deployment/package', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections })
      }, (msg) => {
        if (msg.type === 'progress') setPackageMessages((prev) => [...prev, msg.message]);
        else if (msg.type === 'done') { setPackageXml(msg.packageXml); setZipBase64(msg.zipBase64); setFileCount(msg.fileCount); resultZip = msg.zipBase64; }
        else if (msg.type === 'error') setPackageError(msg.message);
      });
    } catch (e: any) {
      setPackageError(e?.message ?? 'Request failed');
    } finally {
      setPackaging(false);
    }
    return resultZip;
  }

  async function createPackage() {
    const selections = Object.entries(selected)
      .filter(([, s]) => s.size > 0)
      .map(([xmlName, s]) => ({ xmlName, members: Array.from(s) }));
    await packageSelections(selections);
  }

  async function loadDataKits() {
    setDataKitsError(null);
    setLoadingDataKits(true);
    try {
      const resp = await fetch('/api/deployment/datakits');
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
      setDataKits(j.dataKits as DataKitSummary[]);
    } catch (e: any) {
      setDataKitsError(e?.message ?? 'Failed to list Data Kits');
    } finally {
      setLoadingDataKits(false);
    }
  }

  async function packageDataKit() {
    if (!selectedDataKit) return;
    setPackageError(null);
    setPackageXml(null);
    setZipBase64(null);
    setFileCount(null);
    setPackageMessages([]);
    setValidation(null);
    setDeployResult(null);
    setPackaging(true);
    try {
      await streamNdjson('/api/deployment/datakits/package', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataKitName: selectedDataKit })
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

  // Always re-submits the zip directly (checkOnly true for validate, false for the real deploy) -
  // confirmed live against a real org that Salesforce's "quick deploy" shortcut
  // (deployRecentValidation, reusing the checkOnly validation's ID instead of re-uploading)
  // fails with "Source validate did not run tests in the org" regardless of testLevel, while a
  // direct real deploy with the identical zip succeeds cleanly. Re-uploading costs one extra
  // retrieve-sized POST but actually works, which quick deploy did not.
  async function runDeploy(checkOnly: boolean, zipOverride?: string) {
    const setMsgs = checkOnly ? setValidateMessages : setDeployMessages;
    const setErr = checkOnly ? setValidateError : setDeployError;
    const setBusy = checkOnly ? setValidating : setDeploying;
    const setResult = checkOnly ? setValidation : setDeployResult;
    setErr(null);
    setResult(null);
    setMsgs([]);
    setBusy(true);
    try {
      const body = { zipBase64: zipOverride ?? zipBase64, checkOnly };
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
          {!sourceConnection.connected ? <SavedConnectionQuickConnect slot="primary" onConnected={setSourceConnection} /> : null}
          <ConnectionForm onConnected={setSourceConnection} title="Connect Source Org" />
        </div>

        {sourceConnection.connected ? (
          <div className="mb-6 flex rounded-lg border border-slate-300 overflow-hidden w-fit">
            {([
              { key: 'components', label: 'Select Individual Components' },
              { key: 'datakit', label: 'Deploy via Data Kit' }
            ] as const).map((opt) => (
              <button key={opt.key} type="button" onClick={() => setPackageMode(opt.key)}
                className={`px-3 py-2 text-xs font-semibold ${packageMode === opt.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}

        {sourceConnection.connected && packageMode === 'components' ? (
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

        {sourceConnection.connected && packageMode === 'datakit' ? (
          <div className="card p-5 mb-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">1. Choose a Data Kit</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Meant to deploy an already-authored Data Kit (built in Data Cloud Setup &rarr; Data Kit Studio) as one atomic bundle. Confirmed live, twice: Salesforce&apos;s Data Kit manifest endpoint only returns its own internal component-listing format, not a deployable package.xml, and explicitly rejects requesting XML instead (HTTP 406). There is currently no documented way to convert that format into a safe deploy, so packaging will fail here - use &quot;Select Individual Components&quot; instead, which now auto-selects a Data Stream&apos;s matching Data Lake Object for you.
                </p>
              </div>
              <button onClick={loadDataKits} disabled={loadingDataKits} className="btn-ghost text-sm disabled:opacity-60 shrink-0">
                {loadingDataKits ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            {dataKitsError ? <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{dataKitsError}</p> : null}
            {dataKits && dataKits.length === 0 ? (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No Data Kits found in this org. Create one in Data Cloud Setup &rarr; Data Kit Studio, add your Data Stream and its dependencies to it, then come back and hit Refresh.
              </p>
            ) : null}
            {dataKits && dataKits.length > 0 ? (
              <div className="mt-3 space-y-2">
                {dataKits.map((dk) => (
                  <label key={dk.name} className={`flex items-start gap-2 rounded-lg border-2 p-2.5 cursor-pointer transition-colors ${
                    selectedDataKit === dk.name ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300'
                  }`}>
                    <input type="radio" name="data-kit" checked={selectedDataKit === dk.name} onChange={() => setSelectedDataKit(dk.name)} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{dk.label}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{dk.name}</div>
                      {dk.description ? <div className="text-[11px] text-slate-500 mt-0.5">{dk.description}</div> : null}
                    </div>
                  </label>
                ))}
                <div className="pt-2 flex items-center justify-end">
                  <button onClick={packageDataKit} disabled={packaging || !selectedDataKit} className="btn-primary text-sm disabled:opacity-60">
                    {packaging ? 'Packaging...' : 'Package This Data Kit'}
                  </button>
                </div>
              </div>
            ) : null}
            <ProgressPanel messages={packageMessages} active={packaging} />
            {packageError ? <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{packageError}</p> : null}
          </div>
        ) : null}

        {packageMode === 'components' && categories ? (
          <div className="card p-5 mb-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900">2. Select Components to Package</h2>
              <p className="text-xs text-slate-500">{totalSelected} component(s) selected</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">{DEPLOYMENT_ORDER_NOTE}</p>
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
                rememberKey="sfdc.targetConnection.remember.v1"
                additionalRememberKeys={[OAUTH_PASSWORD_REMEMBER_KEY, OAUTH_REDIRECT_REMEMBER_KEY]}
                title="Connect Target Org" />
            ) : (
              <>
                <SavedConnectionQuickConnect slot="target" onConnected={setTargetConnection} />
                <div className="flex rounded-lg border border-slate-300 overflow-hidden w-fit">
                  {([
                    { key: 'password_oauth', label: 'URL + Username/Password (Recommended)' },
                    { key: 'redirect_oauth', label: 'OAuth Redirect' },
                    { key: 'legacy_password', label: 'Legacy (SOAP)' }
                  ] as const).map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setTargetConnectMode(opt.key)}
                      className={`px-3 py-2 text-xs font-semibold ${targetConnectMode === opt.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {targetConnectMode === 'password_oauth' ? <PasswordOAuthConnectCard onConnected={setTargetConnection} /> : null}
                {targetConnectMode === 'redirect_oauth' ? (
                  <>
                    <OAuthClientConfigCard />
                    <OAuthConnectCard oauthError={oauthError} />
                  </>
                ) : null}
                {targetConnectMode === 'legacy_password' ? (
                  <ConnectionForm onConnected={setTargetConnection} apiEndpoint="/api/deployment/target-connection"
                    rememberKey="sfdc.targetConnection.remember.v1" title="Connect Target Org (Username & Password, SOAP - older orgs only)" />
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {packageXml && zipBase64 && targetConnection.connected ? (
          <div className="card p-5 mb-6">
            <h2 className="text-sm font-bold text-slate-900">4. Validate Deploy (Dry Run)</h2>
            <p className="text-xs text-slate-500 mt-1">Runs a checkOnly validation against the target org - nothing actually changes yet. Always required before a real deploy.</p>
            <div className="mt-3 flex items-center justify-end gap-2">
              {validation || validateError ? (
                <button onClick={() => downloadDataUri('validation-log.txt', `data:text/plain;charset=utf-8,${encodeURIComponent(buildDeployLogText('Validation', validateMessages, validation, validateError))}`)}
                  className="btn-ghost text-xs py-1.5 px-3">Download Log</button>
              ) : null}
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
                      <li key={i} className="text-[11px] text-rose-700">
                        {f.fullName} ({f.componentType}){f.problemType ? ` [${f.problemType}]` : ''}: {f.problem}
                        {f.fileName ? <span className="text-rose-500"> - {f.fileName}{f.lineNumber ? `:${f.lineNumber}` : ''}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {packageMode === 'components' ? (
                  <MissingDepsPanel failures={validation.componentFailures} categories={categories} selected={selected} retrying={retryingDeps} onInclude={includeMissingDepsAndRetry} />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {validation?.success ? (
          <div className="card p-5 mb-6">
            <h2 className="text-sm font-bold text-slate-900">5. Deploy for Real</h2>
            <p className="text-xs text-slate-500 mt-1">Deploys the validated request above into the target org - this is the one step that actually changes the target org.</p>
            <div className="mt-3 flex items-center justify-end gap-2">
              {deployResult || deployError ? (
                <button onClick={() => downloadDataUri('deploy-log.txt', `data:text/plain;charset=utf-8,${encodeURIComponent(buildDeployLogText('Deploy', deployMessages, deployResult, deployError))}`)}
                  className="btn-ghost text-xs py-1.5 px-3">Download Log</button>
              ) : null}
              <button onClick={() => runDeploy(false)} disabled={deploying} className="btn-primary text-sm disabled:opacity-60 bg-rose-600 hover:bg-rose-700">
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
                      <li key={i} className="text-[11px] text-rose-700">
                        {f.fullName} ({f.componentType}){f.problemType ? ` [${f.problemType}]` : ''}: {f.problem}
                        {f.fileName ? <span className="text-rose-500"> - {f.fileName}{f.lineNumber ? `:${f.lineNumber}` : ''}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {packageMode === 'components' ? (
                  <MissingDepsPanel failures={deployResult.componentFailures} categories={categories} selected={selected} retrying={retryingDeps} onInclude={includeMissingDepsAndRetry} />
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
