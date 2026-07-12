'use client';

import type { CheckResult } from '@/lib/dataReadiness';
import { useState } from 'react';

const SEV_COLOR: Record<string, { bg: string; text: string; ring: string; hex: string; label: string }> = {
  good:     { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', hex: '#10b981', label: 'Healthy' },
  warning:  { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   hex: '#f59e0b', label: 'Warning' },
  critical: { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-200',    hex: '#f43f5e', label: 'Critical' }
};

function fmt(n: number): string { return new Intl.NumberFormat('en-US').format(Math.round(n)); }

function HeadlineCard({ result }: { result: CheckResult }) {
  const sev = SEV_COLOR[result.severity];
  return (
    <div className={`rounded-2xl border ${sev.bg} p-6 ring-1 ${sev.ring}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`inline-flex items-center gap-1.5 chip ${sev.bg} ${sev.text}`}>
              <span className="w-2 h-2 rounded-full" style={{ background: sev.hex }} />
              {sev.label}
            </div>
            {result.liveConnection ? (
              <span className="chip bg-emerald-600 text-white font-bold" title="Data came from a live Salesforce connection">
                LIVE
              </span>
            ) : (
              <span className="chip bg-slate-200 text-slate-700 font-bold" title="Mock result — connect to Salesforce for real data">
                MOCK
              </span>
            )}
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {result.headlineMetric.label}
          </div>
          <div className="mt-1 text-5xl font-black tabular-nums text-slate-900 leading-none">
            {result.headlineMetric.value}
          </div>
          {result.headlineMetric.hint ? (
            <div className="mt-2 text-xs text-slate-600">{result.headlineMetric.hint}</div>
          ) : null}
        </div>
        <div className="text-right text-[11px] text-slate-500 space-y-0.5">
          <div><strong className="text-slate-700">{fmt(result.totalRecords)}</strong> records scanned</div>
          <div>Executed in <strong className="text-slate-700">{result.durationMs} ms</strong></div>
          <div>{new Date(result.executedAt).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

function DuplicateBlock({ r }: { r: any }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">Duplicate value examples</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <MiniStat label="Duplicate rows" value={fmt(r.duplicateRecords)} />
        <MiniStat label="Duplicate groups" value={fmt(r.duplicateGroups)} />
        <MiniStat label="Unique values" value={fmt(r.uniqueValues)} />
      </div>
      {r.examples?.length ? (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Value</th>
                <th className="text-right px-3 py-2">Occurrences</th>
              </tr>
            </thead>
            <tbody>
              {r.examples.map((ex: any, i: number) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-mono">{ex.value}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(ex.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">No duplicate examples in the top 100.</p>
      )}
    </div>
  );
}

function NullBlock({ r }: { r: any }) {
  const populatedPct = 100 - r.nullPercent;
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">Populated vs empty</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <MiniStat label="Populated" value={fmt(r.populatedCount)} sub={`${populatedPct.toFixed(1)}%`} />
        <MiniStat label="NULL" value={fmt(r.nullCount - (r.emptyCount || 0))} />
        <MiniStat label="Empty string" value={fmt(r.emptyCount || 0)} />
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-slate-100">
        <div style={{ width: `${populatedPct}%`, background: '#10b981' }} />
        <div style={{ width: `${r.nullPercent}%`, background: '#f43f5e' }} />
      </div>
      <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-2">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />Populated</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500" />NULL / empty</span>
      </div>
    </div>
  );
}

function CompletenessBlock({ r }: { r: any }) {
  const sev = SEV_COLOR[r.severity];
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">Completeness components</h3>
      <div className="flex items-center gap-6 flex-wrap">
        <CircularScore score={r.score} color={sev.hex} />
        <div className="flex-1 min-w-[240px] space-y-2">
          {(r.components || []).map((c: any, i: number) => (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-slate-700">{c.label}</span>
                <span className="tabular-nums text-slate-500">{c.score}/100</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: sev.hex }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <MiniStat label="Populated" value={fmt(r.populated)} />
        <MiniStat label="Missing" value={fmt(r.missing)} />
        <MiniStat label="Default values" value={fmt(r.defaulted || 0)} />
      </div>
    </div>
  );
}

function DistributionBlock({ r }: { r: any }) {
  const max = Math.max(1, ...r.topValues.map((v: any) => v.count));
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Top values</h3>
      <p className="text-xs text-slate-500 mb-3">
        Cardinality: <strong>{fmt(r.cardinality)}</strong> distinct values
      </p>
      <div className="space-y-1.5">
        {r.topValues.map((v: any, i: number) => (
          <div key={i}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-slate-700 truncate mr-2 font-mono">{v.value}</span>
              <span className="tabular-nums text-slate-500 shrink-0">
                {fmt(v.count)} <span className="text-slate-400">({v.percent}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(v.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormatBlock({ r }: { r: any }) {
  const validPct = 100 - r.invalidPercent;
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {r.formatKind.toUpperCase()} format validation
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <MiniStat label="Valid" value={fmt(r.validCount)} sub={`${validPct.toFixed(1)}%`} />
        <MiniStat label="Invalid" value={fmt(r.invalidCount)} sub={`${r.invalidPercent.toFixed(1)}%`} />
        <MiniStat label="Format kind" value={r.formatKind} />
      </div>
      {r.invalidExamples?.length ? (
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-2">Invalid samples</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {r.invalidExamples.map((v: string, i: number) => (
              <div key={i} className="rounded border border-rose-100 bg-rose-50/50 px-2 py-1 text-[11px] font-mono text-rose-800 truncate">
                {v}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RefIntegrityBlock({ r }: { r: any }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">Orphan references</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <MiniStat label="Total references" value={fmt(r.totalReferences)} />
        <MiniStat label="Orphans" value={fmt(r.orphanCount)} sub={`${r.orphanPercent.toFixed(1)}%`} />
        <MiniStat label="Valid" value={fmt(r.totalReferences - r.orphanCount)} />
      </div>
      {r.orphanExamples?.length ? (
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-2">Sample orphan IDs</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {r.orphanExamples.map((id: string, i: number) => (
              <div key={i} className="rounded border border-rose-100 bg-rose-50/50 px-2 py-1 text-[11px] font-mono text-rose-800 truncate">
                {id}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 tabular-nums">{sub}</div> : null}
    </div>
  );
}

function CircularScore({ score, color }: { score: number; color: string }) {
  const size = 120, stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize="22" fontWeight="800" fill="#0f172a">
        {score}
      </text>
    </svg>
  );
}

export default function CheckResults({ result }: { result: CheckResult }) {
  const [showQuery, setShowQuery] = useState(false);
  return (
    <div className="space-y-4">
      <HeadlineCard result={result} />
      {result.checkType === 'duplicate' ? <DuplicateBlock r={result} /> : null}
      {result.checkType === 'null_empty' ? <NullBlock r={result} /> : null}
      {result.checkType === 'completeness' ? <CompletenessBlock r={result} /> : null}
      {result.checkType === 'value_distribution' ? <DistributionBlock r={result} /> : null}
      {result.checkType === 'format_validation' ? <FormatBlock r={result} /> : null}
      {result.checkType === 'referential_integrity' ? <RefIntegrityBlock r={result} /> : null}

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Query used</h3>
          <button type="button" onClick={() => setShowQuery((s) => !s)}
            className="text-xs text-emerald-600 hover:underline">
            {showQuery ? 'Hide' : 'Show'}
          </button>
        </div>
        {showQuery ? (
          <pre className="mt-2 bg-slate-900 text-emerald-200 rounded-lg p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
            {result.sampleQuery}
          </pre>
        ) : null}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
          <div><span className="text-slate-500">System:</span> <strong>{result.system}</strong></div>
          <div><span className="text-slate-500">Object:</span> <strong>{result.object}</strong></div>
          <div><span className="text-slate-500">Field:</span> <strong>{result.field}</strong></div>
          <div><span className="text-slate-500">Type:</span> <strong>{result.fieldType}</strong></div>
        </div>
      </div>
    </div>
  );
}
