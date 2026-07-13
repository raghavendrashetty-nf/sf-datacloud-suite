'use client';

import { useState } from 'react';
import type { CheckKey, CheckMeta } from '@/lib/dataReadiness';

interface Props {
  meta: CheckMeta;
  shortName: string;
  onClick: () => void;
}

export default function CheckCard({ meta, shortName, onClick }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white overflow-hidden transition-all hover:border-emerald-300 hover:shadow-sm">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="chip bg-emerald-100 text-emerald-700 text-[10px]">{shortName}</span>
          </div>
        </div>
        <h3 className="text-sm font-bold text-slate-900">{meta.headline}</h3>
        <p className="mt-1 text-xs text-slate-500 leading-snug">{meta.what}</p>
      </button>

      <div className="border-t border-slate-100 bg-slate-50/50">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          aria-expanded={open}
          className="w-full flex items-center justify-between text-left px-4 py-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900 uppercase tracking-wide"
        >
          <span>{open ? 'Hide details' : 'How this check works'}</span>
          <span className="text-slate-400 text-sm">{open ? '\u2212' : '+'}</span>
        </button>
        {open ? (
          <div className="px-4 pb-4 space-y-3 text-[11px] text-slate-700 border-t border-slate-100">
            <div>
              <div className="font-semibold text-slate-900 text-[11px] uppercase tracking-wide mt-2 mb-1">What it does</div>
              <p className="leading-snug">{meta.what}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-[11px] uppercase tracking-wide mb-1">How it works</div>
              <p className="leading-snug">{meta.how}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-[11px] uppercase tracking-wide mb-1">Queries executed</div>
              <div className="space-y-1">
                {meta.queries.map((q, i) => (
                  <pre key={i} className="bg-slate-900 text-emerald-200 rounded-md p-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap leading-tight">
                    {q}
                  </pre>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-[11px] uppercase tracking-wide mb-1">Calculation</div>
              <p className="leading-snug font-mono text-[10px] bg-white border border-slate-200 rounded p-2">{meta.calculation}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-[11px] uppercase tracking-wide mb-1">Outcome</div>
              <p className="leading-snug">{meta.outcome}</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-2">
              <div className="font-semibold text-sky-800 text-[11px] uppercase tracking-wide mb-1">Data Cloud discovery use</div>
              <p className="leading-snug text-sky-900">{meta.dataCloudUseCase}</p>
            </div>
            {meta.useCases?.length ? (
              <div>
                <div className="font-semibold text-slate-900 text-[11px] uppercase tracking-wide mb-1">Common use cases</div>
                <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                  {meta.useCases.map((u, i) => <li key={i}>{u}</li>)}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow hover:shadow-md"
            >
              Choose this check
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
