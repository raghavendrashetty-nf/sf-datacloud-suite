'use client';

import type { CheckResult } from '@/lib/dataReadiness';
import { useState } from 'react';

const SEV_COLOR: Record<string, { bg: string; text: string; ring: string; hex: string; label: string }> = {
  good: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', hex: '#10b981', label: 'Healthy' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', hex: '#f59e0b', label: 'Warning' },
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200', hex: '#f43f5e', label: 'Critical' }
};

function fmt(n: number): string { return new Intl.NumberFormat('en-US').format(Math.round(n)); }

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 tabular-nums">{sub}</div> : null}
    </div>
  );
}

function HeadlineCard({ result }: { result: CheckResult }) {
  const sev = SEV_COLOR[result.severity];
  return (
    <div className={`rounded-2xl border ${sev.bg} p-6 ring-1 ${sev.ring}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`inline-flex items-center gap-1.5 chip ${sev.bg} ${sev.text}`}>
              <span className="w-2 h-2 rounded-full" style={{ background: sev.hex }} />{sev.label}
            </div>
            {result.liveConnection ? (
              <span className="chip bg-emerald-600 text-white font-bold">LIVE</span>
            ) : (
              <span className="chip bg-slate-200 text-slate-700 font-bold">MOCK</span>
            )}
            {(result as any).fullTableAnalyzed ? (
              <span className="chip bg-sky-100 text-sky-700 font-semibold" title="Every row in the table was analyzed (no LIMIT applied)">FULL SCAN</span>
            ) : null}
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{result.headlineMetric.label}</div>
          <div className="mt-1 text-5xl font-black tabular-nums text-slate-900 leading-none">{result.headlineMetric.value}</div>
          {result.headlineMetric.hint ? <div className="mt-2 text-xs text-slate-600">{result.headlineMetric.hint}</div> : null}
        </div>
        <div className="text-right text-[11px] text-slate-500 space-y-0.5">
          <div><strong className="text-slate-700">{fmt(result.totalRecords)}</strong> records in table</div>
          <div><strong className="text-slate-700">{fmt(result.scannedRecords)}</strong> records scanned</div>
          <div>Executed in <strong className="text-slate-700">{result.durationMs} ms</strong></div>
        </div>
      </div>
    </div>
  );
}

export default function CheckResults({ result }: { result: CheckResult }) {
  const [showQuery, setShowQuery] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const r = result as any;
  const backendLog: string[] | undefined = r.backendLog;

  return (
    <div className="space-y-4">
      <HeadlineCard result={result} />

      {result.checkType === 'duplicate' ? (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Duplicate examples</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <MiniStat label="Duplicate rows" value={fmt(r.duplicateRecords)} />
            <MiniStat label="Duplicate groups" value={fmt(r.duplicateGroups)} />
            <MiniStat label="Unique values" value={fmt(r.uniqueValues)} />
          </div>
          {r.examples?.length ? (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="text-left px-3 py-2">Value</th><th className="text-right px-3 py-2">Count</th></tr></thead>
                <tbody>{r.examples.map((ex: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1.5 font-mono">{ex.value}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmt(ex.count)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {result.checkType === 'null_empty' ? (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Populated vs empty</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <MiniStat label="Populated" value={fmt(r.populatedCount)} sub={`${(100 - r.nullPercent).toFixed(1)}%`} />
            <MiniStat label="NULL" value={fmt(r.nullCount)} sub={`${r.nullPercent.toFixed(1)}%`} />
            <MiniStat label="Empty string" value={fmt(r.emptyCount || 0)} sub="typically 0 in Salesforce" />
          </div>
          <p className="text-[11px] italic text-slate-500 mt-2 leading-snug">
            Note: In Salesforce SOQL, empty text values are stored as NULL. The tool reports NULL and empty-string counts separately without adding them, so percentages will not exceed 100%.
          </p>
        </div>
      ) : null}

      {result.checkType === 'value_distribution' ? (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Top values (cardinality {fmt(r.cardinality)})</h3>
          <div className="mt-3 space-y-1.5">
            {r.topValues.map((v: any, i: number) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-700 truncate mr-2 font-mono">{v.value}</span>
                  <span className="tabular-nums text-slate-500 shrink-0">{fmt(v.count)} ({v.percent}%)</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${v.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result.checkType === 'completeness' ? (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Completeness: {r.score}/100</h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Populated" value={fmt(r.populated)} />
            <MiniStat label="Missing" value={fmt(r.missing)} />
          </div>
        </div>
      ) : null}

      {result.checkType === 'format_validation' ? (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">{r.formatKind.toUpperCase()} format</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MiniStat label="Valid" value={fmt(r.validCount)} />
            <MiniStat label="Invalid" value={fmt(r.invalidCount)} sub={`${r.invalidPercent.toFixed(1)}%`} />
          </div>
          {r.invalidExamples?.length ? (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Invalid samples</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {r.invalidExamples.map((v: string, i: number) => (
                  <div key={i} className="rounded border border-rose-100 bg-rose-50/50 px-2 py-1 text-[11px] font-mono text-rose-800 truncate">{v}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {result.checkType === 'referential_integrity' ? (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Referential integrity</h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Distinct refs scanned" value={fmt(r.scannedRecords)} />
            <MiniStat label="Orphans" value={fmt(r.orphanCount)} sub={`${r.orphanPercent.toFixed(1)}%`} />
          </div>
          {r.orphanExamples?.length ? (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Sample orphan IDs</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {r.orphanExamples.map((id: string, i: number) => (
                  <div key={i} className="rounded border border-rose-100 bg-rose-50/50 px-2 py-1 text-[11px] font-mono text-rose-800 truncate">{id}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Query & Backend consoles */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Query used</h3>
          <button type="button" onClick={() => setShowQuery((s) => !s)} className="text-xs text-emerald-600 hover:underline">
            {showQuery ? 'Hide' : 'Show'}
          </button>
        </div>
        {showQuery ? (
          <pre className="mt-2 bg-slate-900 text-emerald-200 rounded-lg p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
            {result.sampleQuery}
          </pre>
        ) : null}
      </div>

      {backendLog?.length ? (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Backend operations console</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Timestamped log of every SOQL query, pagination step, and calculation the server executed.</p>
            </div>
            <button type="button" onClick={() => setShowLog((s) => !s)} className="text-xs text-emerald-600 hover:underline shrink-0">
              {showLog ? 'Hide' : 'Show'} ({backendLog.length})
            </button>
          </div>
          {showLog ? (
            <pre className="mt-3 bg-slate-950 text-sky-200 rounded-lg p-3 text-[10px] font-mono overflow-auto max-h-96 whitespace-pre-wrap leading-tight">
              {backendLog.join('\n')}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
