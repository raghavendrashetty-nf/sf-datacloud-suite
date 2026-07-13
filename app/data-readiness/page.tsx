'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import StepIndicator from '@/components/data-readiness/StepIndicator';
import SearchableSelect from '@/components/data-readiness/SearchableSelect';
import CheckResults from '@/components/data-readiness/CheckResults';
import ConnectionForm from '@/components/data-readiness/ConnectionForm';
import CheckCard from '@/components/data-readiness/CheckCard';
import catalog from '@/config/dataReadinessCatalog.json';
import { CHECK_META } from '@/lib/dataReadiness';
import type { Catalog, CheckKey, CheckResult, ConnectionInfo, FieldType, SystemKey } from '@/lib/dataReadiness';

const CAT = catalog as unknown as Catalog;

interface SObjectListItem { name: string; label: string; custom: boolean; queryable: boolean; }
interface SFieldListItem { name: string; label: string; type: string; mappedType: FieldType; referenceTo?: string[]; custom: boolean; }

function SystemCard({ systemKey, onClick }: { systemKey: SystemKey; onClick: () => void }) {
  const sys = CAT.systems[systemKey];
  return (
    <button type="button" onClick={onClick}
      className="text-left rounded-2xl border-2 border-slate-200 hover:border-emerald-300 hover:shadow-sm bg-white p-5 transition-all">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm text-white" style={{ background: sys.hex }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">{sys.name}</h3>
          <p className="text-xs text-slate-500">Connect for live objects &amp; fields</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">{sys.description}</p>
    </button>
  );
}

function rankMatch(query: string, item: { value: string; label: string; description?: string }): number {
  const q = query.trim().toLowerCase();
  if (!q) return 100;
  const label = item.label.toLowerCase();
  const value = item.value.toLowerCase();
  const desc = (item.description ?? '').toLowerCase();

  if (label === q || value === q) return 0;
  if (label.startsWith(q) || value.startsWith(q)) return 1;
  const wordRe = new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (wordRe.test(label) || wordRe.test(value)) return 2;
  if (label.includes(q) || value.includes(q)) return 3;
  if (desc.includes(q)) return 4;
  return 5;
}

export default function DataReadinessPage() {
  const [system, setSystem] = useState<SystemKey | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo>({ connected: false });
  const [checkType, setCheckType] = useState<CheckKey | null>(null);
  const [objectName, setObjectName] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState<string | null>(null);
  const [objectSearchQuery, setObjectSearchQuery] = useState<string>('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live backend log
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const runStartRef = useRef<number>(0);

  const [liveObjects, setLiveObjects] = useState<SObjectListItem[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [objectsError, setObjectsError] = useState<string | null>(null);
  const [liveFields, setLiveFields] = useState<SFieldListItem[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/data-readiness/connection').then((r) => r.json()).then((j) => { if (j?.info?.connected) setConnection(j.info); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (system !== 'salesforce' || !connection.connected) { setLiveObjects([]); return; }
    setLoadingObjects(true); setObjectsError(null);
    fetch('/api/data-readiness/objects')
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; })
      .then((j) => setLiveObjects(j.items ?? []))
      .catch((e) => setObjectsError(e?.message ?? 'Failed to load objects'))
      .finally(() => setLoadingObjects(false));
  }, [system, connection.connected]);

  useEffect(() => {
    if (system !== 'salesforce' || !connection.connected || !objectName) { setLiveFields([]); return; }
    setLoadingFields(true); setFieldsError(null);
    fetch(`/api/data-readiness/objects/${encodeURIComponent(objectName)}/fields`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; })
      .then((j) => setLiveFields(j.fields ?? []))
      .catch((e) => setFieldsError(e?.message ?? 'Failed to load fields'))
      .finally(() => setLoadingFields(false));
  }, [system, connection.connected, objectName]);

  const STEPS = system === 'zendesk'
    ? [{ key: 'system', label: 'System' }, { key: 'check', label: 'Check' }, { key: 'target', label: 'Object & Field' }, { key: 'result', label: 'Results' }]
    : [{ key: 'system', label: 'System' }, { key: 'connect', label: 'Connect' }, { key: 'check', label: 'Check' }, { key: 'target', label: 'Object & Field' }, { key: 'result', label: 'Results' }];

  const currentStep = useMemo(() => {
    if (result) return STEPS.length - 1;
    if (system === 'salesforce') {
      if (!connection.connected) return 1;
      if (!checkType) return 2;
      return 3;
    }
    if (system === 'zendesk') { if (!checkType) return 1; return 2; }
    return 0;
  }, [system, connection.connected, checkType, result, STEPS.length]);

  const currentCheck = checkType ? CAT.checks[checkType] : null;

  const objectItems = useMemo(() => {
    if (system === 'salesforce' && connection.connected) {
      const raw = liveObjects.map((o) => ({
        value: o.name, label: o.label, description: o.name, badge: o.custom ? 'Custom' : 'Standard'
      }));
      const q = objectSearchQuery.trim();
      if (!q) {
        return raw.sort((a, b) => {
          const aBadge = a.badge === 'Standard' ? 0 : 1;
          const bBadge = b.badge === 'Standard' ? 0 : 1;
          if (aBadge !== bBadge) return aBadge - bBadge;
          return a.label.localeCompare(b.label);
        });
      }
      const withRank = raw.map((item) => ({ item, rank: rankMatch(q, item) }));
      withRank.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const aBadge = a.item.badge === 'Standard' ? 0 : 1;
        const bBadge = b.item.badge === 'Standard' ? 0 : 1;
        if (aBadge !== bBadge) return aBadge - bBadge;
        return a.item.label.localeCompare(b.item.label);
      });
      return withRank.map(({ item }) => item);
    }
    if (system && system !== 'salesforce') {
      const sys = CAT.systems[system];
      return Object.entries(sys.objects).map(([key, o]) => ({
        value: key, label: o.label, description: o.description, badge: `${Object.keys(o.fields).length} fields`
      }));
    }
    return [];
  }, [system, connection.connected, liveObjects, objectSearchQuery]);

  const fieldItems = useMemo(() => {
    if (!currentCheck || !objectName) return [];
    if (system === 'salesforce' && connection.connected) {
      return liveFields
        .filter((f) => currentCheck.appliesToTypes.includes(f.mappedType))
        .map((f) => ({
          value: f.name, label: f.label,
          description: `${f.name} \u00b7 ${f.type}${f.referenceTo?.length ? ' \u2192 ' + f.referenceTo.join(', ') : ''}`,
          badge: f.mappedType
        }));
    }
    if (system && system !== 'salesforce') {
      const sys = CAT.systems[system];
      const objectDef = sys.objects[objectName];
      if (!objectDef) return [];
      return Object.entries(objectDef.fields)
        .filter(([, f]) => currentCheck.appliesToTypes.includes(f.type as any))
        .map(([key, f]) => ({ value: key, label: f.label, description: `${key} \u00b7 ${f.description}`, badge: f.type }));
    }
    return [];
  }, [system, connection.connected, currentCheck, objectName, liveFields]);

  const selectedFieldInfo = useMemo(() => {
    if (!fieldName || !objectName || !system) return null;
    if (system === 'salesforce' && connection.connected) {
      const f = liveFields.find((x) => x.name === fieldName);
      if (!f) return null;
      return { label: f.label, type: f.mappedType, rawType: f.type, description: `${f.name}${f.referenceTo?.length ? ' - references ' + f.referenceTo.join(', ') : ''}` };
    }
    const sys = CAT.systems[system];
    const objectDef = sys.objects[objectName];
    const fld = objectDef?.fields[fieldName];
    if (!fld) return null;
    return { label: fld.label, type: fld.type, rawType: fld.type, description: fld.description };
  }, [system, connection.connected, objectName, fieldName, liveFields]);

  function chooseSystem(s: SystemKey) {
    setSystem(s); setCheckType(null); setObjectName(null); setFieldName(null); setResult(null); setError(null);
  }
  function chooseCheck(c: CheckKey) { setCheckType(c); setFieldName(null); setResult(null); setError(null); }
  function chooseObject(v: string | null) { setObjectName(v); setFieldName(null); setResult(null); }
  function chooseField(v: string | null) { setFieldName(v); setResult(null); }
  function startOver() { setSystem(null); setCheckType(null); setObjectName(null); setFieldName(null); setResult(null); setError(null); }

  function appendLog(msg: string) {
    const dt = Date.now() - runStartRef.current;
    setLiveLog((prev) => [...prev, `[+${String(dt).padStart(6, ' ')} ms] ${msg}`]);
  }

  async function runCheck() {
    if (!system || !checkType || !objectName || !fieldName) return;
    setLoading(true); setError(null); setResult(null); setLiveLog([]);
    runStartRef.current = Date.now();

    // Animated stage log while the server runs
    const stages = [
      `Connecting to ${system} check runner...`,
      `Counting rows in ${objectName}...`,
      `Iterating ${fieldName} values via queryMore (no LIMIT)...`,
      `Building in-memory frequency map...`,
      `Computing severity, examples, and metrics...`
    ];
    let stageIdx = 0;
    const interval = setInterval(() => {
      if (stageIdx < stages.length) appendLog(stages[stageIdx++]);
    }, 900);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('/api/data-readiness/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, checkType, object: objectName, field: fieldName }),
        signal: controller.signal
      });
      clearInterval(interval);
      if (!resp.ok) { const j = await resp.json().catch(() => ({})); throw new Error(j.error || `HTTP ${resp.status}`); }
      const j = await resp.json();
      appendLog('Response received. Rendering results...');
      setResult(j.result as CheckResult);
      setLiveLog([]);
    } catch (e: any) {
      clearInterval(interval);
      if (e?.name === 'AbortError') {
        setError('Check aborted by user.');
        appendLog('*** ABORTED by user ***');
      } else {
        setError(e?.message ?? 'Check failed');
        appendLog(`*** ERROR: ${e?.message ?? e} ***`);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function abortCheck() {
    abortRef.current?.abort();
  }

  const canRun = !!(system && checkType && objectName && fieldName) && !loading;
  const needsConnection = system === 'salesforce' && !connection.connected;

  return (
    <main className="min-h-screen">
      <Header />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-900">Home</Link>
            <span>/</span>
            <span className="text-slate-700 font-medium">Data Readiness</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Data Readiness Assessment</h1>
          <p className="text-sm text-slate-600 mt-1">Connect to a live Salesforce org and run real data quality checks.</p>
        </div>

        <div className="mb-6"><StepIndicator steps={STEPS} currentIndex={currentStep} /></div>

        {!system ? (
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">1. Select a source system</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(Object.keys(CAT.systems) as SystemKey[]).map((s) => (
                <SystemCard key={s} systemKey={s} onClick={() => chooseSystem(s)} />
              ))}
            </div>
          </section>
        ) : null}

        {system ? (
          <div className="card p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: CAT.systems[system].hex }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">System</div>
                <div className="text-sm font-semibold text-slate-900">{CAT.systems[system].name}</div>
              </div>
              {connection.connected && system === 'salesforce' ? (
                <span className={`chip ${connection.isSandbox ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'} font-semibold`}>
                  {connection.isSandbox ? 'SANDBOX' : 'PRODUCTION'} - {connection.organizationName || connection.username}
                </span>
              ) : null}
            </div>
            <button type="button" onClick={startOver} className="text-xs text-slate-500 hover:text-rose-600 underline">Change system</button>
          </div>
        ) : null}

        {system === 'salesforce' && needsConnection ? (
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">2. Connect to Salesforce</h2>
            <ConnectionForm onConnected={(info) => setConnection(info)} />
          </section>
        ) : null}

        {system === 'salesforce' && connection.connected && !result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-600">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="font-semibold text-emerald-800">Connected as {connection.displayName || connection.username}</span>
              <span className="text-emerald-600">- {connection.organizationName || 'Salesforce'}</span>
            </div>
            <button type="button" onClick={async () => { await fetch('/api/data-readiness/connection', { method: 'DELETE' }); setConnection({ connected: false }); }}
              className="text-xs text-rose-600 hover:underline">Disconnect</button>
          </div>
        ) : null}

        {system && (!needsConnection) && !checkType ? (
          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">{system === 'salesforce' ? '3.' : '2.'} Select a data quality check</h2>
              <p className="text-xs text-slate-500 mt-1">
                Six pre-built Data Cloud discovery checks. Click <em>How this check works</em> on any card to see the exact queries, calculations, outcomes, and use cases.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(CAT.checks) as CheckKey[]).map((c) => (
                <CheckCard
                  key={c}
                  meta={CHECK_META[c]}
                  shortName={CAT.checks[c].shortName}
                  onClick={() => chooseCheck(c)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {system && (!needsConnection) && checkType ? (
          <div className="card p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="chip bg-emerald-100 text-emerald-700 shrink-0">{CAT.checks[checkType].shortName}</span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Check</div>
                <div className="text-sm font-semibold text-slate-900">{CHECK_META[checkType].headline}</div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{CHECK_META[checkType].what}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setCheckType(null); setFieldName(null); setResult(null); }}
              className="text-xs text-slate-500 hover:text-rose-600 underline shrink-0">Change check</button>
          </div>
        ) : null}

        {system && (!needsConnection) && checkType ? (
          <section className="card p-5 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">{system === 'salesforce' ? '4.' : '3.'} Choose the object &amp; field to check</h2>

            {system === 'salesforce' && connection.connected ? (
              <div className="mb-3 text-[11px] text-slate-500 flex items-center gap-2">
                {loadingObjects ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 animate-spin">
                      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                    </svg>
                    Loading objects from your org...
                  </>
                ) : objectsError ? (
                  <span className="text-rose-600">Failed to load objects: {objectsError}</span>
                ) : (
                  <span>{liveObjects.length} objects available. Exact matches float to the top.</span>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect label={`${CAT.systems[system].name} object`}
                placeholder={loadingObjects ? 'Loading...' : 'Start typing an object name...'}
                items={objectItems} value={objectName} onChange={chooseObject}
                onQueryChange={setObjectSearchQuery}
                disabled={loadingObjects} emptyMessage="No matching objects" />
              <SearchableSelect label="Field"
                placeholder={!objectName ? 'Select an object first' : loadingFields ? 'Loading fields...' : 'Start typing a field name...'}
                items={fieldItems} value={fieldName} onChange={chooseField}
                disabled={!objectName || loadingFields}
                emptyMessage={!objectName ? 'Pick an object first' : loadingFields ? 'Loading...' : fieldsError ? `Error: ${fieldsError}` : `No fields match this check`} />
            </div>

            {system === 'salesforce' && connection.connected && objectName ? (
              <div className="mt-2 text-[11px] text-slate-500">
                {loadingFields ? null :
                 fieldsError ? <span className="text-rose-600">Failed: {fieldsError}</span> :
                 liveFields.length > 0 ? <span>{liveFields.length} total fields, {fieldItems.length} match this check</span> : null}
              </div>
            ) : null}

            {selectedFieldInfo ? (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-slate-700">
                <strong>{selectedFieldInfo.label}</strong>
                <span className="ml-1 chip bg-white text-slate-600 border border-slate-200">{selectedFieldInfo.type}</span>
                {selectedFieldInfo.rawType && selectedFieldInfo.rawType !== selectedFieldInfo.type ? (
                  <span className="ml-1 text-slate-400 text-[10px]">({selectedFieldInfo.rawType})</span>
                ) : null}
                <p className="mt-1 text-slate-600">{selectedFieldInfo.description}</p>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
              <button type="button" onClick={startOver} className="text-sm text-slate-500 hover:text-rose-600 underline">Start over</button>
              {loading ? (
                <button type="button" onClick={abortCheck}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-rose-500 hover:bg-rose-600 text-white shadow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  Abort check
                </button>
              ) : (
                <button type="button" onClick={runCheck} disabled={!canRun}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    canRun ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow hover:shadow-md' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}>
                  Run check
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              )}
            </div>

            {loading ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 animate-spin text-emerald-600">
                    <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-slate-900">Live backend log</h4>
                    <p className="text-[11px] text-slate-500">
                      Running against every row in your table via queryMore pagination. Large tables (millions of rows) may take 30-60 seconds.
                    </p>
                  </div>
                </div>
                <pre className="bg-slate-950 text-sky-200 rounded-lg p-3 text-[10px] font-mono overflow-auto max-h-64 whitespace-pre-wrap leading-tight">
                  {liveLog.length === 0 ? '(waiting for server...)' : liveLog.join('\n')}
                </pre>
              </div>
            ) : null}

            {error ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}
          </section>
        ) : null}

        {result ? (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">{system === 'salesforce' ? '5.' : '4.'} Results</h2>
              <button type="button" onClick={() => { setResult(null); setFieldName(null); }}
                className="text-xs text-emerald-600 hover:underline">Run another check</button>
            </div>
            <CheckResults result={result} />
          </section>
        ) : null}
      </div>
    </main>
  );
}