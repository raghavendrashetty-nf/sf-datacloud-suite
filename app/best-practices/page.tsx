'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '@/components/Header';
import { useBestPractices } from '@/lib/bestPractices';
import type { BestPractice, BestPracticeStage } from '@/lib/bestPractices';

// Static, literal class strings per color (not template-constructed) so Tailwind's build-time
// scanner can see and keep them - the same reason PhaseTheme.tsx's own color set is a fixed union
// rather than a free string.
const STAGE_STYLES: Record<BestPracticeStage['color'], { chip: string; border: string; dot: string; text: string }> = {
  sky: { chip: 'bg-sky-100 text-sky-800', border: 'border-sky-200', dot: 'bg-sky-500', text: 'text-sky-700' },
  indigo: { chip: 'bg-indigo-100 text-indigo-800', border: 'border-indigo-200', dot: 'bg-indigo-500', text: 'text-indigo-700' },
  violet: { chip: 'bg-violet-100 text-violet-800', border: 'border-violet-200', dot: 'bg-violet-500', text: 'text-violet-700' },
  rose: { chip: 'bg-rose-100 text-rose-800', border: 'border-rose-200', dot: 'bg-rose-500', text: 'text-rose-700' },
  emerald: { chip: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  amber: { chip: 'bg-amber-100 text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500', text: 'text-amber-700' },
  slate: { chip: 'bg-slate-100 text-slate-800', border: 'border-slate-200', dot: 'bg-slate-500', text: 'text-slate-700' }
};

function matchesQuery(p: BestPractice, q: string): boolean {
  if (!q) return true;
  const haystack = `${p.title} ${p.summary} ${p.points.map((pt) => pt.text).join(' ')}`.toLowerCase();
  return haystack.includes(q.toLowerCase());
}

// Source attribution is deliberately tucked behind a click, not shown by default - this library
// is meant to read as this app's own curated best practices, each just quietly backed by a real,
// checkable source rather than presented as a re-post of someone else's article.
function SourceInfo({ practice }: { practice: BestPractice }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="View source"
        title="Source"
        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-full mt-1.5 z-10 w-60 rounded-lg border border-slate-200 bg-white shadow-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Source</p>
          <a href={practice.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline">
            {practice.sourceName}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          {practice.publishDate ? <p className="mt-1 text-[11px] text-slate-400">Published {practice.publishDate}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function PracticeCard({ practice, stageStyle }: { practice: BestPractice; stageStyle: typeof STAGE_STYLES[keyof typeof STAGE_STYLES] }) {
  const [expanded, setExpanded] = useState(false);
  const isRecent = (Date.now() - new Date(practice.addedDate).getTime()) < 30 * 24 * 60 * 60 * 1000;

  return (
    <div className={`card p-5 border-l-4 ${stageStyle.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900">{practice.title}</h3>
            {isRecent ? <span className="chip bg-amber-100 text-amber-800 font-semibold text-[10px]">New</span> : null}
          </div>
          <p className="mt-1.5 text-sm text-slate-600">{practice.summary}</p>
          <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
            <span>{practice.points.length} practice{practice.points.length !== 1 ? 's' : ''}</span>
            <span>Added {new Date(practice.addedDate).toLocaleDateString()}</span>
          </div>
        </div>
        <SourceInfo practice={practice} />
      </div>

      <button type="button" onClick={() => setExpanded((e) => !e)}
        className={`mt-3 text-xs font-semibold ${stageStyle.text} hover:underline`}>
        {expanded ? 'Hide practices ▲' : 'Show all practices ▼'}
      </button>

      {expanded ? (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {practice.points.map((pt, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${stageStyle.dot}`} />
              <span>
                {pt.text}
                {pt.impact ? <span className={`ml-2 inline-block chip ${stageStyle.chip} font-semibold text-[10px] align-middle`}>{pt.impact}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function BestPracticesPage() {
  const { config } = useBestPractices();
  const [query, setQuery] = useState('');

  const stagesWithPractices = useMemo(() => {
    const sortedStages = [...config.stages].sort((a, b) => a.order - b.order);
    return sortedStages.map((stage) => ({
      stage,
      practices: config.practices.filter((p) => p.stage === stage.key && matchesQuery(p, query))
    }));
  }, [config, query]);

  const totalMatching = stagesWithPractices.reduce((sum, s) => sum + s.practices.length, 0);

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold">
            Reference Library
          </div>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">Data Cloud Best Practices</h1>
          <p className="mt-2 text-slate-600 max-w-2xl">
            A curated, growing library of real, sourced Salesforce Data Cloud best practices - grouped by project stage, each one linking back to its original guide for the full detail.
          </p>
        </div>

        <div className="mb-6">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search best practices..."
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
          {query ? <p className="mt-1.5 text-xs text-slate-500">{totalMatching} matching practice{totalMatching !== 1 ? 's' : ''}</p> : null}
        </div>

        <div className="space-y-8">
          {stagesWithPractices.map(({ stage, practices }) => {
            if (practices.length === 0) return null;
            const style = STAGE_STYLES[stage.color];
            return (
              <section key={stage.key}>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                  <h2 className="text-lg font-bold text-slate-900">{stage.label}</h2>
                  <span className={`chip ${style.chip} font-semibold`}>{practices.length}</span>
                </div>
                <div className="space-y-3">
                  {practices.map((p) => <PracticeCard key={p.id} practice={p} stageStyle={style} />)}
                </div>
              </section>
            );
          })}
          {totalMatching === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">No best practices match &quot;{query}&quot;.</div>
          ) : null}
        </div>
      </div>
      <footer className="py-6 text-center text-xs text-slate-500">
        Not affiliated with Salesforce.
      </footer>
    </main>
  );
}
