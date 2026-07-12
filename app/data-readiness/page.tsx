'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import StepIndicator from '@/components/data-readiness/StepIndicator';
import SearchableSelect from '@/components/data-readiness/SearchableSelect';
import CheckResults from '@/components/data-readiness/CheckResults';
import ConnectionForm from '@/components/data-readiness/ConnectionForm';
import catalog from '@/config/dataReadinessCatalog.json';
import type { Catalog, CheckKey, CheckResult, ConnectionInfo, SystemKey } from '@/lib/dataReadiness';

const CAT = catalog as unknown as Catalog;

function SystemCard({ systemKey, onClick }: { systemKey: SystemKey; onClick: () => void }) {
  const sys = CAT.systems[systemKey];
  return (
    <button type="button" onClick={onClick}
      className="text-left rounded-2xl border-2 border-slate-200 hover:border-emerald-300 hover:shadow-sm bg-white p-5 transition-all">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm text-white"
             style={{ background: sys.hex }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">{sys.name}</h3>
          <p className="text-xs text-slate-500">{Object.keys(sys.objects).length} objects available</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">{sys.description}</p>
    </button>
  );
}

function CheckCard({ checkKey, onClick, disabled }: { checkKey: CheckKey; onClick: () => void; disabled?: boolean }) {
  const chk = CAT.checks[checkKey];
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`text-left rounded-2xl border-2 p-4 transition-all ${
        disabled
          ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
          : 'border-slate-200 hover:border-emerald-300 hover:shadow-sm bg-white'
      }`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="chip bg-emerald-100 text-emerald-700 text-[10px]">{chk.shortName}</span>
      </div>
      <h3 className="text-sm font-bold text-slate-900">{chk.name}</h3>
      <p className="mt-1 text-xs text-slate-500 leading-snug">{chk.description}</p>
    </button>
  );
}

export default function DataReadinessPage() {
  const [system, setSystem] = useState<SystemKey | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo>({ connected: false });
  const [checkType, setCheckType] = useState<CheckKey | null>(null);
  const [objectName, setObjectName] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, fetch existing connection status so refresh keeps you signed in
  useEffect(() => {
    fetch('/api/data-readiness/connection')
      .then((r) => r.json())
      .then((j) => { if (j?.info?.connected) setConnection(j.info); })
      .catch(() => {});
  }, []);

  // Steps depend on system. Salesforce has 5 steps (with Connect); Zendesk has 4.
  const STEPS = system === 'zendesk'
    ? [
        { key: 'system', label: 'System' },
        { key: 'check', label: 'Check' },
        { key: 'target', label: 'Object & Field' },
        { key: 'result', label: 'Results' }
      ]
    : [
        { key: 'system', label: 'System' },
        { key: 'connect', label: 'Connect' },
        { key: 'check', label: 'Check' },
        { key: 'target', label: 'Object & Field' },
        { key: 'result', label: 'Results' }
      ];

  const currentStep = useMemo(() => {
    if (result) return STEPS.length - 1;
    if (system === 'salesforce') {
      if (!connection.connected) return 1;         // Connect step
      if (!checkType) return 2;                    // Check step
      return 3;                                    // Target step
    }
    if (system === 'zendesk') {
      if (!checkType) return 1;
      return 2;
    }
    return 0;
  }, [system, connection.connected, checkType, result, STEPS.length]);

  const systemObj = system ? CAT.systems[system] : null;
  const currentCheck = checkType ? CAT.checks[checkType] : null;
  const objectDef = system && objectName ? CAT.systems[system].objects[objectName] : null;
  const fieldDef = objectDef && fieldName ? objectDef.fields[fieldName] : null;

  const objectItems = useMemo(() => {
    if (!systemObj) return [];
    return Object.entries(systemObj.objects).map(([key, o]) => ({
      value: key, label: o.label, description: o.description,
      badge: `${Object.keys(o.fields).length} fields`
    }));
  }, [systemObj]);

  const fieldItems = useMemo(() => {
    if (!objectDef || !currentCheck) return [];
    return Object.entries(objectDef.fields)
      .filter(([, f]) => currentCheck.appliesToTypes.includes(f.type as any))
      .map(([key, f]) => ({
        value: key, label: f.label,
        description: `${key} · ${f.description}`, badge: f.type
      }));
  }, [objectDef, currentCheck]);

  function chooseSystem(s: SystemKey) {
    setSystem(s);
    setCheckType(null); setObjectName(null); setFieldName(null); setResult(null); setError(null);
  }
  function chooseCheck(c: CheckKey) {
    setCheckType(c); setFieldName(null); setResult(null); setError(null);
  }
  function chooseObject(v: string | null) { setObjectName(v); setFieldName(null); setResult(null); }
  function chooseField(v: string | null) { setFieldName(v); setResult(null); }

  function startOver() {
    setSystem(null); setCheckType(null); setObjectName(null); setFieldName(null); setResult(null); setError(null);
  }

  async function runCheck() {
    if (!system || !checkType || !objectName || !fieldName) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const resp = await fetch('/api/data-readiness/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, checkType, object: objectName, field: fieldName })
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${resp.status}`);
      }
      const j = await resp.json();
      setResult(j.result as CheckResult);
    } catch (e: any) {
      setError(e?.message ?? 'Check failed');
    } finally {
      setLoading(false);
    }
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
          <p className="text-sm text-slate-600 mt-1">
            Connect to a live Salesforce org and run real data quality checks.
          </p>
        </div>

        <div className="mb-6">
          <StepIndicator steps={STEPS} currentIndex={currentStep} />
        </div>

        {/* STEP 1: system */}
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

        {/* System summary */}
        {system ? (
          <div className="card p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                   style={{ background: CAT.systems[system].hex }}>
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
            <button type="button" onClick={startOver}
              className="text-xs text-slate-500 hover:text-rose-600 underline">
              Change system
            </button>
          </div>
        ) : null}

        {/* STEP 2 (Salesforce only): Connect */}
        {system === 'salesforce' && needsConnection ? (
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">2. Connect to Salesforce</h2>
            <ConnectionForm onConnected={(info) => setConnection(info)} />
          </section>
        ) : null}

        {/* Connection summary (once connected) */}
        {system === 'salesforce' && connection.connected && !result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-600">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="font-semibold text-emerald-800">Connected as {connection.displayName || connection.username}</span>
              <span className="text-emerald-600">- {connection.organizationName || 'Salesforce'}</span>
            </div>
            <button type="button" onClick={async () => {
              await fetch('/api/data-readiness/connection', { method: 'DELETE' });
              setConnection({ connected: false });
            }} className="text-xs text-rose-600 hover:underline">
              Disconnect
            </button>
          </div>
        ) : null}

        {/* STEP 3: check */}
        {system && (!needsConnection) && !checkType ? (
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              {system === 'salesforce' ? '3.' : '2.'} Select a data quality check
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.keys(CAT.checks) as CheckKey[]).map((c) => (
                <CheckCard key={c} checkKey={c} onClick={() => chooseCheck(c)} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Check summary */}
        {system && (!needsConnection) && checkType ? (
          <div className="card p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="chip bg-emerald-100 text-emerald-700 shrink-0">{CAT.checks[checkType].shortName}</span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Check</div>
                <div className="text-sm font-semibold text-slate-900">{CAT.checks[checkType].name}</div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{CAT.checks[checkType].description}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setCheckType(null); setFieldName(null); setResult(null); }}
              className="text-xs text-slate-500 hover:text-rose-600 underline shrink-0">
              Change check
            </button>
          </div>
        ) : null}

        {/* STEP 4: object + field */}
        {system && (!needsConnection) && checkType ? (
          <section className="card p-5 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              {system === 'salesforce' ? '4.' : '3.'} Choose the object &amp; field to check
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect label={`${CAT.systems[system].name} object`}
                placeholder="Start typing an object name..."
                items={objectItems} value={objectName} onChange={chooseObject}
                emptyMessage="No matching objects" />
              <SearchableSelect label="Field"
                placeholder={objectName ? 'Start typing a field name...' : 'Select an object first'}
                items={fieldItems} value={fieldName} onChange={chooseField}
                disabled={!objectName}
                emptyMessage={objectName ? `No fields on ${objectName} match this check` : 'Pick an object first'} />
            </div>

            {fieldDef ? (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-slate-700">
                <strong>{fieldDef.label}</strong>
                <span className="ml-1 chip bg-white text-slate-600 border border-slate-200">{fieldDef.type}</span>
                <p className="mt-1 text-slate-600">{fieldDef.description}</p>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
              <button type="button" onClick={startOver}
                className="text-sm text-slate-500 hover:text-rose-600 underline">
                Start over
              </button>
              <button type="button" onClick={runCheck} disabled={!canRun}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  canRun
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow hover:shadow-md'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}>
                {loading ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 animate-spin">
                      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                    </svg>
                    Running check...
                  </>
                ) : (
                  <>
                    Run check
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            {error ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {error}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* STEP 5: results */}
        {result ? (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {system === 'salesforce' ? '5.' : '4.'} Results
              </h2>
              <button type="button" onClick={() => { setResult(null); setFieldName(null); }}
                className="text-xs text-emerald-600 hover:underline">
                Run another check
              </button>
            </div>
            <CheckResults result={result} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
