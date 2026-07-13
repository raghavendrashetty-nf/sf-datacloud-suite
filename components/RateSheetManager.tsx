'use client';

import { useMemo, useState } from 'react';
import type { RateItem, RatesConfig } from '@/lib/types';
import november2025 from '@/config/rateCardPresets/november2025.json';
import { extractPdfText, parseRateItems, parsedToRateItems, ParsedItem } from '@/lib/pdfParser';

interface Props { rates: RatesConfig; onSave: (next: RatesConfig) => void; onReset: () => void; onClose: () => void; }

function newBlankItem(): RateItem {
  return {
    key: `custom_${Math.random().toString(36).slice(2, 8)}`,
    phase: 'ingestion', label: 'New Rate Item',
    unit: 'Per 1 Million Rows Processed', unitDivisor: 1000000,
    unitLabel: 'rows', unitSingular: 'row',
    initialLabel: 'Initial Load Rows', supportsInitial: false,
    credits: { Production: 0, Sandbox: 0 },
    description: 'Describe this rate item.',
    processingRateNote: 'Per 1 Million Rows Processed', usageNote: ''
  };
}

type Stage = 'idle' | 'extracting' | 'parsing' | 'done' | 'error';

export default function RateSheetManager({ rates, onSave, onReset, onClose }: Props) {
  const [draft, setDraft] = useState<RatesConfig>(() => JSON.parse(JSON.stringify(rates)));
  const [pdfUrl, setPdfUrl] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedItem[]>([]);
  const items = draft.items;

  const uniquePhases = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) s.add(i.phase);
    return Array.from(s);
  }, [items]);

  function updateItem(idx: number, patch: Partial<RateItem>) {
    setDraft((d) => ({ ...d, items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function updateCredits(idx: number, env: 'Production' | 'Sandbox', v: number) {
    setDraft((d) => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, credits: { ...it.credits, [env]: Math.max(0, v) } } : it) }));
  }
  function addItem() { setDraft((d) => ({ ...d, items: [...d.items, newBlankItem()] })); }
  function removeItem(idx: number) { setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) })); }
  function loadNovemberDefault() { setDraft(JSON.parse(JSON.stringify(november2025))); }

  async function processPdf(source: File | ArrayBuffer, sourceUrl?: string) {
    setPdfError(null); setParsed([]); setStage('extracting');
    try {
      const text = await extractPdfText(source);
      setStage('parsing');
      const items = parseRateItems(text);
      setParsed(items);
      if (sourceUrl) setDraft((d) => ({ ...d, meta: { ...d.meta, url: sourceUrl } }));
      setStage('done');
    } catch (e: any) { setPdfError(e?.message ?? 'Failed to parse PDF'); setStage('error'); }
  }
  async function onPdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    await processPdf(f);
  }
  async function onFetchUrl() {
    if (!pdfUrl) return;
    setPdfError(null); setStage('extracting');
    try {
      const resp = await fetch('/api/fetch-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: pdfUrl }) });
      if (!resp.ok) { const j = await resp.json().catch(() => ({})); throw new Error(j.error || `HTTP ${resp.status}`); }
      await processPdf(await resp.arrayBuffer(), pdfUrl);
    } catch (e: any) { setPdfError(e?.message ?? 'Fetch failed'); setStage('error'); }
  }
  function applyParsedItems() { if (parsed.length) setDraft((d) => ({ ...d, items: parsedToRateItems(parsed) })); }
  function save() { onSave(draft); onClose(); }

  return (
    <div className="modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Rate Sheet Manager</h2>
            <p className="text-sm text-slate-500 mt-1">View, edit, upload, or fetch a new rate sheet.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="p-5 space-y-6">
          <section className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Import from PDF</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Upload PDF file</label>
                <input type="file" accept="application/pdf,.pdf" onChange={onPdfFile}
                  className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sky-600 file:text-white file:cursor-pointer hover:file:bg-sky-700" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Or fetch by URL</label>
                <div className="flex items-center gap-2">
                  <input type="url" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)}
                    placeholder="https://www.salesforce.com/.../rate-sheet.pdf"
                    className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                  <button onClick={onFetchUrl} disabled={!pdfUrl || stage === 'extracting' || stage === 'parsing'}
                    className="btn-primary text-xs py-1.5 px-3 disabled:opacity-60">Fetch & Parse</button>
                </div>
              </div>
            </div>
            {stage === 'extracting' ? <p className="text-xs text-sky-700 mt-3">⏳ Extracting...</p> : null}
            {stage === 'parsing' ? <p className="text-xs text-sky-700 mt-3">⏳ Parsing...</p> : null}
            {stage === 'error' && pdfError ? <p className="text-xs text-rose-600 mt-3">Error: {pdfError}</p> : null}
            {stage === 'done' ? (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-emerald-700 font-semibold">✓ Parsed {parsed.length} rate items</p>
                <button onClick={applyParsedItems} disabled={!parsed.length} className="btn-primary text-xs py-1 px-3">
                  Apply parsed items →
                </button>
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rate Sheet Source</label>
              <input type="text" value={draft.meta.source}
                onChange={(e) => setDraft((d) => ({ ...d, meta: { ...d.meta, source: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rate Sheet URL</label>
              <input type="url" value={draft.meta.url}
                onChange={(e) => setDraft((d) => ({ ...d, meta: { ...d.meta, url: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Version</label>
              <input type="text" value={draft.meta.version}
                onChange={(e) => setDraft((d) => ({ ...d, meta: { ...d.meta, version: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={loadNovemberDefault} className="btn-ghost text-sm py-1.5 px-3">Load November 2025 defaults</button>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">Rate Items ({items.length})</h3>
              <button onClick={addItem} className="btn-ghost text-sm py-1 px-3">+ Add item</button>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-[900px] w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-2 py-2">Key</th>
                    <th className="text-left px-2 py-2">Phase</th>
                    <th className="text-left px-2 py-2">Label</th>
                    <th className="text-right px-2 py-2">Prod</th>
                    <th className="text-right px-2 py-2">Sandbox</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-2 py-1"><input value={it.key} onChange={(e) => updateItem(idx, { key: e.target.value })} className="w-32 border border-slate-200 rounded px-1 py-1 text-xs" /></td>
                      <td className="px-2 py-1">
                        <input list={`phases-list-${idx}`} value={it.phase} onChange={(e) => updateItem(idx, { phase: e.target.value })} className="w-28 border border-slate-200 rounded px-1 py-1 text-xs" />
                        <datalist id={`phases-list-${idx}`}>{uniquePhases.map((p) => <option key={p} value={p} />)}</datalist>
                      </td>
                      <td className="px-2 py-1"><input value={it.label} onChange={(e) => updateItem(idx, { label: e.target.value })} className="w-64 border border-slate-200 rounded px-1 py-1 text-xs" /></td>
                      <td className="px-2 py-1 text-right"><input type="number" value={it.credits.Production} onChange={(e) => updateCredits(idx, 'Production', Number(e.target.value))} className="w-20 border border-slate-200 rounded px-1 py-1 text-xs text-right" /></td>
                      <td className="px-2 py-1 text-right"><input type="number" value={it.credits.Sandbox} onChange={(e) => updateCredits(idx, 'Sandbox', Number(e.target.value))} className="w-20 border border-slate-200 rounded px-1 py-1 text-xs text-right" /></td>
                      <td className="px-2 py-1 text-right"><button onClick={() => removeItem(idx)} className="text-rose-500 hover:text-rose-700 text-xs">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div className="p-5 border-t border-slate-200 flex items-center justify-between">
          <button onClick={() => { onReset(); onClose(); }} className="text-sm text-rose-600 hover:underline">Reset to built-in defaults</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button onClick={save} className="btn-primary text-sm">Save & Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}
