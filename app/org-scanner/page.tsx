'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import CollapsibleSection from '@/components/CollapsibleSection';
import ConnectionForm from '@/components/data-readiness/ConnectionForm';
import type { ConnectionInfo } from '@/lib/dataReadiness';

interface ScanCategoryResult {
  category: string;
  status: 'ok' | 'error';
  items?: { name: string; displayName?: string; [key: string]: unknown }[];
  error?: string;
  note?: string;
}

type Stage = 'idle' | 'scanning' | 'done' | 'error';

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function ScanItemRow({ item }: { item: { name: string; displayName?: string; [key: string]: unknown } }) {
  const [open, setOpen] = useState(false);
  const title = item.displayName || item.name;
  const detailEntries = Object.entries(item).filter(([k]) => k !== 'name' && k !== 'displayName');
  return (
    <li className="text-xs border border-slate-200 rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300">
        <span>
          <span className="font-semibold text-slate-900">{title}</span>
          {item.displayName && item.name !== item.displayName ? <span className="text-slate-500"> ({item.name})</span> : null}
        </span>
        <span className="text-slate-400 text-[10px] shrink-0">{open ? 'Hide details' : 'View details'}</span>
      </button>
      {open ? (
        detailEntries.length > 0 ? (
          <dl className="px-2.5 pb-2 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50/60">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-700 break-words">{formatValue(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="px-2.5 pb-2 pt-2 border-t border-slate-100 text-slate-500 bg-slate-50/60">No additional fields returned for this item.</p>
        )
      ) : null}
    </li>
  );
}

export default function OrgScannerPage() {
  const [connection, setConnection] = useState<ConnectionInfo>({ connected: false });
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanCategoryResult[] | null>(null);

  async function runScan() {
    setError(null);
    setResults(null);
    setStage('scanning');
    try {
      const resp = await fetch('/api/org-scanner/scan', { method: 'POST' });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error ?? `Request failed with HTTP ${resp.status}`);
        setStage('error');
        return;
      }
      setResults(json.results as ScanCategoryResult[]);
      setStage('done');
    } catch (err: any) {
      setError(err?.message ?? 'Request failed');
      setStage('error');
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">
            Stage 3 &middot; Implementation Review
          </div>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">AI-Assisted Org Scanner</h1>
          <p className="mt-2 text-slate-600 max-w-2xl">
            Connect to a live org and inventory its existing Data Cloud configuration - Data Model Objects, Data Lake Objects, Calculated Insights, Segments, and Identity Resolution Rulesets.
          </p>
        </div>

        <div className="mb-6">
          <ConnectionForm onConnected={setConnection} />
        </div>

        {connection.connected ? (
          <div className="card p-5 mb-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Scan Configuration</h2>
                <p className="text-xs text-slate-500 mt-1">Fetches configuration metadata from Data Cloud. This does not read or modify any customer data.</p>
              </div>
              <button onClick={runScan} disabled={stage === 'scanning'} className="btn-primary text-sm disabled:opacity-60 shrink-0">
                {stage === 'scanning' ? 'Scanning...' : 'Run Scan'}
              </button>
            </div>
            {stage === 'error' && error ? (
              <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
            ) : null}
          </div>
        ) : null}

        {results ? (
          <div className="card p-5 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Scan Results</h2>
              <p className="text-[11px] text-slate-500">{results.length} categories checked, ordered by Data Cloud pipeline stage (Ingestion &rarr; Harmonize &amp; Unify &rarr; Insights &rarr; Activation)</p>
            </div>
            {results.map((r) => {
              const hasContent = r.status === 'error' || (r.items?.length ?? 0) > 0 || !!r.note;
              return (
                <CollapsibleSection key={r.category} title={`${r.category} (${r.status === 'ok' ? r.items?.length ?? 0 : 'error'})`} defaultOpen={hasContent}>
                  {r.status === 'error' ? (
                    <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{r.error}</p>
                  ) : (
                    <>
                      {r.items && r.items.length > 0 ? (
                        <ul className="space-y-1">
                          {r.items.map((item, i) => <ScanItemRow key={i} item={item} />)}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-500">None found in this org.</p>
                      )}
                      {r.note ? <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">{r.note}</p> : null}
                    </>
                  )}
                </CollapsibleSection>
              );
            })}
            <p className="mt-3 text-[11px] text-slate-500 italic">
              Categories beyond the core set are discovered dynamically from this org&apos;s Metadata API - what shows up depends on what&apos;s actually configured. Click any item for its full returned configuration.
            </p>
          </div>
        ) : null}
      </div>
      <footer className="py-6 text-center text-xs text-slate-500">
        Not affiliated with Salesforce.
      </footer>
    </main>
  );
}
