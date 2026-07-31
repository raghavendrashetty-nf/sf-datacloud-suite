'use client';

import { useMemo } from 'react';
import type { RateItem, SkillsConfig } from '@/lib/types';
import { PHASES, getPhaseTheme } from '@/components/PhaseTheme';

interface Props {
  skills: SkillsConfig;
  rateItems: RateItem[];
  onClose: () => void;
}

/**
 * Read-only viewer for the Data 360 skill library. This library is sourced from
 * github.com/forcedotcom/sf-skills via `npm run sync-skills` (scripts/sync-skills.js)
 * and is intentionally NOT editable from the UI - editing here previously let stale,
 * hand-typed content silently diverge from the real, official skill definitions.
 */
export default function SkillLibraryView({ skills, rateItems, onClose }: Props) {
  const grouped = useMemo(() => {
    const byPhase: Record<string, typeof skills.skills> = {};
    for (const s of skills.skills) {
      if (!byPhase[s.phase]) byPhase[s.phase] = [];
      byPhase[s.phase].push(s);
    }
    return byPhase;
  }, [skills.skills]);
  const phaseKeysToRender = useMemo(() => {
    const known = PHASES.map((p) => p.key);
    const extra = Object.keys(grouped).filter((k) => !known.includes(k as any));
    return [...known, ...extra.sort((a, b) => getPhaseTheme(a).order - getPhaseTheme(b).order)];
  }, [grouped]);

  return (
    <div className="modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Data 360 Skills Library</h2>
            <p className="text-sm text-slate-500 mt-1">
              Read-only - sourced from Salesforce's official{' '}
              {skills.meta.source ? (
                <a href={skills.meta.source} target="_blank" rel="noreferrer" className="underline">forcedotcom/sf-skills</a>
              ) : 'forcedotcom/sf-skills'}
              {' '}repo.
            </p>
            {skills.meta.sourceCommit || skills.meta.syncedAt ? (
              <p className="text-[11px] text-slate-400 mt-1">
                {skills.meta.sourceCommit ? <>Synced against commit <code className="text-[10px]">{skills.meta.sourceCommit.slice(0, 10)}</code></> : null}
                {skills.meta.syncedAt ? <> on {new Date(skills.meta.syncedAt).toLocaleDateString()}</> : null}
              </p>
            ) : null}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {phaseKeysToRender.map((phaseKey) => {
            const items = grouped[phaseKey];
            if (!items || items.length === 0) return null;
            const theme = getPhaseTheme(phaseKey);
            return (
              <div key={phaseKey}>
                <div className={`chip font-semibold bg-${theme.color}-100 text-${theme.color}-700 mb-2`}>{theme.label}</div>
                <div className="space-y-3">
                  {items.map((s) => (
                    <div key={s.id} className={`rounded-lg border border-${theme.color}-100 bg-${theme.color}-50/30 p-3`}>
                      <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                      <p className="text-xs text-slate-600 mt-0.5">{s.summary}</p>
                      <p className="text-[11px] text-slate-500 mt-2"><span className="font-semibold">When to use:</span> {s.whenToUse}</p>
                      <p className="text-[11px] text-slate-500 mt-1.5"><span className="font-semibold">Best practices:</span> {s.bestPractices}</p>
                      {s.relatedRateItemKeys.length ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {s.relatedRateItemKeys.map((key) => {
                            const item = rateItems.find((r) => r.key === key);
                            return <span key={key} className="chip text-[10px] font-medium bg-white border border-slate-200 text-slate-600">{item?.label ?? key}</span>;
                          })}
                        </div>
                      ) : null}
                      {s.docs.length ? (
                        <div className="mt-2 flex flex-wrap gap-3">
                          {s.docs.map((d, i) => (
                            <a key={i} href={d.url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-violet-700 hover:underline">
                              {d.label} &rarr;
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-slate-200 flex items-center justify-end">
          <button onClick={onClose} className="btn-primary text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
