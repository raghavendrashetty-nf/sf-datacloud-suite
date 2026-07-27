'use client';

import { useMemo, useState } from 'react';
import type { RateItem, Skill, SkillsConfig } from '@/lib/types';
import { PHASES, getPhaseTheme } from '@/components/PhaseTheme';
import CollapsibleSection from '@/components/CollapsibleSection';

interface Props {
  skills: SkillsConfig;
  rateItems: RateItem[];
  onSave: (next: SkillsConfig) => void;
  onReset: () => void;
  onClose: () => void;
}

function newBlankSkill(phase: string): Skill {
  const now = new Date().toISOString();
  return {
    id: `skill_${Math.random().toString(36).slice(2, 10)}`,
    name: '', phase, summary: '', whenToUse: '', bestPractices: '',
    relatedRateItemKeys: [], docs: [], createdAt: now, updatedAt: now
  };
}

const PHASE_STARTERS: Record<string, { summary: string; whenToUse: string; bestPractices: string }> = {
  ingestion: {
    summary: 'One-line description of the ingestion capability this skill recommends.',
    whenToUse: 'Name the SOW/RFP keywords that should trigger this (e.g. source system names, "real-time", "warehouse", "Zero Copy").',
    bestPractices: 'State the concrete rule: when to prefer this approach over alternatives, and any hard constraint (latency, source support, refresh mode) worth flagging.'
  },
  realtime: {
    summary: 'One-line description of the real-time processing pattern this skill recommends.',
    whenToUse: 'Name the SOW/RFP keywords (e.g. "sub-second", "event-triggered") that should trigger this.',
    bestPractices: 'State when to use this pattern vs. a scheduled/batch alternative, and the latency guarantee it actually provides.'
  },
  insights: {
    summary: 'One-line description of the analytics/prediction capability this skill recommends.',
    whenToUse: 'Name the SOW/RFP keywords (e.g. "propensity", "lifetime value", "predictive score") that should trigger this.',
    bestPractices: 'State the concrete rule for when this is the right modeling approach, and what it costs to run at the customer\'s expected volume.'
  },
  act: {
    summary: 'One-line description of the action/query capability this skill recommends.',
    whenToUse: 'Name the SOW/RFP keywords (e.g. "personalization endpoint", "real-time lookup") that should trigger this.',
    bestPractices: 'State when this is the right pattern vs. a batch export, and what drives its cost (peak traffic, not average).'
  },
  activation: {
    summary: 'One-line description of the activation/segmentation capability this skill recommends.',
    whenToUse: 'Name the SOW/RFP keywords (e.g. "same-day activation", target platform names) that should trigger this.',
    bestPractices: 'State the concrete rule for when the faster/more expensive cadence is actually justified.'
  },
  compute: {
    summary: 'One-line description of the compute/transform capability this skill recommends.',
    whenToUse: 'Name the SOW/RFP keywords (e.g. "custom aggregation", "on-demand transform") that should trigger this.',
    bestPractices: 'State when to reach for this vs. a simpler built-in transform, and what drives compute cost.'
  }
};

function checklistItems(draft: Skill) {
  return [
    { label: 'Name is set', pass: draft.name.trim().length > 0 },
    { label: 'Summary is set and concise (≤ 140 chars)', pass: draft.summary.trim().length > 0 && draft.summary.length <= 140 },
    { label: 'When To Use names a concrete trigger (≥ 20 chars)', pass: draft.whenToUse.trim().length >= 20 },
    { label: 'Best Practices guidance is written', pass: draft.bestPractices.trim().length > 0 },
    { label: 'At least one doc link, or none needed', pass: draft.docs.length > 0 || draft.docs.length === 0 }
  ];
}

type View = { mode: 'list' } | { mode: 'edit'; draft: Skill; isNew: boolean };

export default function SkillManager({ skills, rateItems, onSave, onReset, onClose }: Props) {
  const [working, setWorking] = useState<SkillsConfig>(() => JSON.parse(JSON.stringify(skills)));
  const [view, setView] = useState<View>({ mode: 'list' });
  const [ackNoDoc, setAckNoDoc] = useState(false);

const grouped = useMemo(() => {
    const byPhase: Record<string, Skill[]> = {};
    for (const s of working.skills) {
      if (!byPhase[s.phase]) byPhase[s.phase] = [];
      byPhase[s.phase].push(s);
    }
    return byPhase;
  }, [working.skills]);
  // Render every phase group actually present in the data - not just the 6 fixed
  // PHASES - so "__general__" (and any other custom phase key) still shows up.
  const phaseKeysToRender = useMemo(() => {
    const known = PHASES.map((p) => p.key);
    const extra = Object.keys(grouped).filter((k) => !known.includes(k));
    return [...known, ...extra.sort((a, b) => getPhaseTheme(a).order - getPhaseTheme(b).order)];
  }, [grouped]);

  function startNew() {
    const phase = PHASES[0].key;
    const blank = newBlankSkill(phase);
    const starter = PHASE_STARTERS[phase];
    if (starter) Object.assign(blank, starter);
    setAckNoDoc(false);
    setView({ mode: 'edit', draft: blank, isNew: true });
  }
  function startEdit(skill: Skill) {
    setAckNoDoc(skill.docs.length === 0);
    setView({ mode: 'edit', draft: JSON.parse(JSON.stringify(skill)), isNew: false });
  }
  function removeSkill(id: string) {
    setWorking((w) => ({ ...w, skills: w.skills.filter((s) => s.id !== id) }));
  }
  function onPhaseChange(phase: string) {
    if (view.mode !== 'edit') return;
    const starter = PHASE_STARTERS[phase];
    const isBlank = !view.draft.summary && !view.draft.whenToUse && !view.draft.bestPractices;
    setView({
      mode: 'edit',
      isNew: view.isNew,
      draft: { ...view.draft, phase, ...(isBlank && starter ? starter : {}) }
    });
  }
  function suggestFromRateItem(key: string) {
    if (view.mode !== 'edit') return;
    const item = rateItems.find((r) => r.key === key);
    if (!item) return;
    const already = view.draft.relatedRateItemKeys.includes(key);
    setView({
      mode: 'edit',
      isNew: view.isNew,
      draft: {
        ...view.draft,
        relatedRateItemKeys: already ? view.draft.relatedRateItemKeys : [...view.draft.relatedRateItemKeys, key],
        name: view.draft.name || `Guidance for ${item.label}`,
        summary: view.draft.summary || `When to reach for ${item.label} and what drives its cost.`
      }
    });
  }
  function toggleRateItem(key: string) {
    if (view.mode !== 'edit') return;
    const has = view.draft.relatedRateItemKeys.includes(key);
    setView({
      mode: 'edit', isNew: view.isNew,
      draft: { ...view.draft, relatedRateItemKeys: has ? view.draft.relatedRateItemKeys.filter((k) => k !== key) : [...view.draft.relatedRateItemKeys, key] }
    });
  }
  function addDocLink() {
    if (view.mode !== 'edit') return;
    setView({ mode: 'edit', isNew: view.isNew, draft: { ...view.draft, docs: [...view.draft.docs, { label: '', url: '' }] } });
  }
  function updateDocLink(idx: number, patch: Partial<{ label: string; url: string }>) {
    if (view.mode !== 'edit') return;
    setView({ mode: 'edit', isNew: view.isNew, draft: { ...view.draft, docs: view.draft.docs.map((d, i) => i === idx ? { ...d, ...patch } : d) } });
  }
  function removeDocLink(idx: number) {
    if (view.mode !== 'edit') return;
    setView({ mode: 'edit', isNew: view.isNew, draft: { ...view.draft, docs: view.draft.docs.filter((_, i) => i !== idx) } });
  }
  function saveDraft() {
    if (view.mode !== 'edit') return;
    const draft = { ...view.draft, updatedAt: new Date().toISOString() };
    setWorking((w) => {
      const exists = w.skills.some((s) => s.id === draft.id);
      return { ...w, skills: exists ? w.skills.map((s) => (s.id === draft.id ? draft : s)) : [...w.skills, draft] };
    });
    setView({ mode: 'list' });
  }
  function saveAll() { onSave(working); onClose(); }

  const checklist = view.mode === 'edit' ? checklistItems(view.draft) : [];
  const checklistDocsOk = view.mode === 'edit' ? (view.draft.docs.length > 0 || ackNoDoc) : true;
  const allChecksPass = view.mode === 'edit' && checklist.every((c) => c.pass) && checklistDocsOk && view.draft.name.trim().length > 0;

  return (
    <div className="modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Data 360 Skills Manager</h2>
            <p className="text-sm text-slate-500 mt-1">Create and maintain the best-practice skills that ground AI solution recommendations.</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
          <CollapsibleSection title="How to write a good skill" defaultOpen={working.skills.length === 0}>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Scope it to one capability.</strong> A skill should recommend one specific pattern (e.g. "streaming ingestion"), not a whole phase.</li>
              <li><strong>Name concrete triggers.</strong> "When To Use" should list the actual words/phrases a SOW would contain (source names, latency requirements, platform names) - not vague language like "when needed".</li>
              <li><strong>Cite official capabilities and limits, don't guess.</strong> If you have a verified Salesforce Help link, add it. If you don't, that's fine - just don't invent one.</li>
              <li><strong>Map to a rate item when cost matters.</strong> Linking a skill to the Credit Calculator rate item(s) it drives lets the recommendation point at a concrete cost signal instead of a vague estimate.</li>
            </ul>
          </CollapsibleSection>

          {view.mode === 'list' ? (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Skills ({working.skills.length})</h3>
                <button onClick={startNew} className="btn-ghost text-sm py-1 px-3">+ New Skill</button>
              </div>
              <div className="space-y-4">
                {phaseKeysToRender.map((phaseKey) => {
                  const items = grouped[phaseKey];
                  if (!items || items.length === 0) return null;
                  const theme = getPhaseTheme(phaseKey);
                  return (
                    <div key={phaseKey}>
                      <div className={`chip font-semibold bg-${theme.color}-100 text-${theme.color}-700 mb-2`}>{theme.label}</div>
                      <div className="space-y-2">
                        {items.map((s) => (
                          <div key={s.id} className={`rounded-lg border border-${theme.color}-100 bg-${theme.color}-50/40 p-3 flex items-start justify-between gap-3`}>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">{s.name || '(untitled skill)'}</div>
                              <div className="text-xs text-slate-600 mt-0.5">{s.summary}</div>
                              {s.relatedRateItemKeys.length ? (
                                <div className="text-[11px] text-slate-500 mt-1">Rate items: {s.relatedRateItemKeys.join(', ')}</div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => startEdit(s)} className="btn-ghost text-xs py-1 px-2.5">Edit</button>
                              <button onClick={() => removeSkill(s.id)} className="btn-danger text-[11px] py-1 px-2.5">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {working.skills.length === 0 ? <p className="text-sm text-slate-500">No skills yet. Click "+ New Skill" to create your first one.</p> : null}
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phase</label>
                  <select value={view.draft.phase} onChange={(e) => onPhaseChange(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    <option value="__general__">General / Cross-Phase</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
                  <input value={view.draft.name} onChange={(e) => setView({ mode: 'edit', isNew: view.isNew, draft: { ...view.draft, name: e.target.value } })}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" placeholder="e.g. Streaming Ingestion via Ingestion API" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Summary <span className="text-slate-400 font-normal">({view.draft.summary.length}/140)</span></label>
                <input value={view.draft.summary} onChange={(e) => setView({ mode: 'edit', isNew: view.isNew, draft: { ...view.draft, summary: e.target.value } })}
                  maxLength={140} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">When To Use <span className="text-slate-400 font-normal">(name concrete SOW keywords/triggers)</span></label>
                <textarea value={view.draft.whenToUse} onChange={(e) => setView({ mode: 'edit', isNew: view.isNew, draft: { ...view.draft, whenToUse: e.target.value } })}
                  rows={2} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Best Practices <span className="text-slate-400 font-normal">(the guidance actually sent to the model)</span></label>
                <textarea value={view.draft.bestPractices} onChange={(e) => setView({ mode: 'edit', isNew: view.isNew, draft: { ...view.draft, bestPractices: e.target.value } })}
                  rows={4} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Related Rate Items <span className="text-slate-400 font-normal">(for cost mapping - click to pre-fill name/summary)</span></label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2">
                  {rateItems.map((item) => {
                    const active = view.draft.relatedRateItemKeys.includes(item.key);
                    return (
                      <button key={item.key} type="button"
                        onClick={() => (active ? toggleRateItem(item.key) : suggestFromRateItem(item.key))}
                        className={`chip text-[11px] font-medium border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-600">Doc Links <span className="text-slate-400 font-normal">(official Salesforce Help articles only)</span></label>
                  <button onClick={addDocLink} className="btn-ghost text-[11px] py-1 px-2">+ Add link</button>
                </div>
                <div className="space-y-1.5">
                  {view.draft.docs.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input value={d.label} onChange={(e) => updateDocLink(idx, { label: e.target.value })} placeholder="Label"
                        className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-xs" />
                      <input value={d.url} onChange={(e) => updateDocLink(idx, { url: e.target.value })} placeholder="https://help.salesforce.com/..."
                        className="flex-[2] border border-slate-300 rounded-lg px-2 py-1 text-xs" />
                      <button onClick={() => removeDocLink(idx)} className="btn-danger text-[11px] py-1 px-2">Remove</button>
                    </div>
                  ))}
                  {view.draft.docs.length === 0 ? (
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={ackNoDoc} onChange={(e) => setAckNoDoc(e.target.checked)} />
                      No official doc link available yet - I confirm I didn't fabricate one.
                    </label>
                  ) : null}
                </div>
              </div>

              <div className={`rounded-lg border p-3 ${allChecksPass ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="text-xs font-semibold text-slate-800 mb-1.5">Skill quality checklist</div>
                <ul className="space-y-1">
                  {checklist.map((c, i) => (
                    <li key={i} className={`text-xs flex items-center gap-1.5 ${c.pass ? 'text-emerald-700' : 'text-amber-700'}`}>
                      <span aria-hidden="true">{c.pass ? '✓' : '○'}</span> {c.label}
                    </li>
                  ))}
                  <li className={`text-xs flex items-center gap-1.5 ${checklistDocsOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <span aria-hidden="true">{checklistDocsOk ? '✓' : '○'}</span> Doc link added, or "no doc yet" acknowledged
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setView({ mode: 'list' })} className="btn-ghost text-sm">Cancel</button>
                <button onClick={saveDraft} disabled={!view.draft.name.trim()} className="btn-primary text-sm disabled:opacity-60">Save Skill</button>
              </div>
            </section>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex items-center justify-between">
          <button onClick={() => { onReset(); onClose(); }} className="text-sm text-rose-600 hover:underline">Reset to built-in defaults</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button onClick={saveAll} className="btn-primary text-sm">Save &amp; Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
