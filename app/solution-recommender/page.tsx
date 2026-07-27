'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import CollapsibleSection from '@/components/CollapsibleSection';
import SkillManager from '@/components/skills/SkillManager';
import { getPhaseTheme } from '@/components/PhaseTheme';
import { useSkills } from '@/hooks/useSkills';
import { useRates } from '@/hooks/useRates';
import { extractPdfText } from '@/lib/pdfParser';
import type { Recommendation } from '@/lib/llmProviders';

type Stage = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error';

export default function SolutionRecommenderPage() {
  const { skills, setSkills, resetSkills } = useSkills();
  const { rates } = useRates();
  const [showSkillManager, setShowSkillManager] = useState(false);
  const [sowText, setSowText] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onPdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setFileName(f.name);
    setStage('extracting');
    try {
      const text = await extractPdfText(f);
      setSowText(text);
      setStage('idle');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to extract text from PDF');
      setStage('error');
    }
  }

  async function analyze() {
    if (!sowText.trim()) return;
    setError(null);
    setRecommendation(null);
    setStage('analyzing');
    try {
      const resp = await fetch('/api/solution-recommender/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sowText, skills: skills.skills })
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error ?? `Request failed with HTTP ${resp.status}`);
        setStage('error');
        return;
      }
      setRecommendation(json.recommendation as Recommendation);
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">
            Stage 2 &middot; Solution Design
          </div>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">AI-Assisted Solution Recommendation</h1>
          <p className="mt-2 text-slate-600 max-w-2xl">
            Upload or paste a Statement of Work / Discovery Document. The recommendation is grounded entirely in the Data 360 Skills you maintain below - no fabricated capabilities.
          </p>
        </div>

        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900">Data 360 Skills Library ({skills.skills.length})</h2>
            <button onClick={() => setShowSkillManager(true)} className="btn-ghost text-sm py-1.5 px-3">Manage Skills</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skills.skills.map((s) => {
              const theme = getPhaseTheme(s.phase);
              return (
                <span key={s.id} className={`chip text-[11px] font-medium bg-${theme.color}-100 text-${theme.color}-700`}>{s.name}</span>
              );
            })}
            {skills.skills.length === 0 ? <p className="text-xs text-slate-500">No skills yet - click "Manage Skills" to add some.</p> : null}
          </div>
        </div>

        <div className="card p-5 mb-6">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Statement of Work</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Upload PDF</label>
              <input type="file" accept="application/pdf,.pdf" onChange={onPdfFile}
                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-violet-600 file:text-white file:cursor-pointer hover:file:bg-violet-700" />
              {fileName ? <p className="mt-1 text-[11px] text-slate-500">Loaded: {fileName}</p> : null}
              {stage === 'extracting' ? <p className="mt-1 text-[11px] text-violet-700">Extracting text...</p> : null}
            </div>
            <div className="flex items-end">
              <p className="text-xs text-slate-500">Or paste the text directly in the box below - no PDF required.</p>
            </div>
          </div>
          <textarea value={sowText} onChange={(e) => setSowText(e.target.value)} rows={8}
            placeholder="Paste SOW / Discovery Document text here, or upload a PDF above..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              Analyzed locally via Ollama (free) - requires Ollama running with a model pulled (e.g. <code className="text-[10px]">ollama pull llama3.2</code>).
            </p>
            <button onClick={analyze} disabled={!sowText.trim() || stage === 'analyzing'} className="btn-primary text-sm disabled:opacity-60">
              {stage === 'analyzing' ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
          {stage === 'error' && error ? (
            <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
          ) : null}
        </div>

        {recommendation ? (
          <div className="card p-5 space-y-2">
            <h2 className="text-sm font-bold text-slate-900">Recommendation</h2>

            <CollapsibleSection title="Proposed Architecture" defaultOpen>
              <div className="space-y-2">
                {recommendation.architecture.map((a, i) => {
                  const theme = getPhaseTheme(a.phase);
                  return (
                    <div key={i} className={`rounded-lg border border-${theme.color}-100 bg-${theme.color}-50/50 p-2`}>
                      <div className={`chip text-[10px] font-bold bg-${theme.color}-100 text-${theme.color}-700 mb-1`}>{a.phase}</div>
                      <p className="text-xs text-slate-700">{a.recommendation}</p>
                    </div>
                  );
                })}
                {recommendation.architecture.length === 0 ? <p className="text-xs text-slate-500">No architecture guidance returned.</p> : null}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Matched Skills" defaultOpen>
              <div className="space-y-2">
                {recommendation.matchedSkills.map((m, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-2">
                    <div className="text-xs font-semibold text-slate-900">{m.skillName}</div>
                    <p className="text-xs text-slate-600 mt-0.5">{m.rationale}</p>
                  </div>
                ))}
                {recommendation.matchedSkills.length === 0 ? <p className="text-xs text-slate-500">No skills matched this SOW.</p> : null}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="SWOT Analysis" defaultOpen>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {([
                  ['Strengths', recommendation.swot.strengths, 'emerald'],
                  ['Weaknesses', recommendation.swot.weaknesses, 'rose'],
                  ['Opportunities', recommendation.swot.opportunities, 'sky'],
                  ['Threats', recommendation.swot.threats, 'amber']
                ] as const).map(([label, items, color]) => (
                  <div key={label} className={`rounded-lg border border-${color}-100 bg-${color}-50/40 p-2`}>
                    <div className={`text-[11px] font-bold text-${color}-700 mb-1`}>{label}</div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {items.map((it, i) => <li key={i} className="text-xs text-slate-700">{it}</li>)}
                      {items.length === 0 ? <li className="text-xs text-slate-400 list-none -ml-4">None noted.</li> : null}
                    </ul>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Cost Signal" defaultOpen>
              <p className="text-xs text-slate-700 mb-2">{recommendation.costSignal.note}</p>
              {recommendation.costSignal.rateItemKeys.length ? (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {recommendation.costSignal.rateItemKeys.map((key) => {
                    const item = rates.items.find((r) => r.key === key);
                    return <span key={key} className="chip text-[11px] font-medium bg-slate-100 text-slate-700">{item?.label ?? key}</span>;
                  })}
                </div>
              ) : null}
              <a href="/credit-calculator/advanced" className="text-xs font-semibold text-violet-700 hover:underline">
                Open Advanced Calculator to build out a full estimate &rarr;
              </a>
            </CollapsibleSection>
          </div>
        ) : null}
      </div>

      {showSkillManager ? (
        <SkillManager
          skills={skills}
          rateItems={rates.items}
          onSave={setSkills}
          onReset={resetSkills}
          onClose={() => setShowSkillManager(false)}
        />
      ) : null}

      <footer className="py-6 text-center text-xs text-slate-500">
        Not affiliated with Salesforce.
      </footer>
    </main>
  );
}
