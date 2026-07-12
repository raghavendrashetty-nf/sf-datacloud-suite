'use client';

import { useMemo, useState } from 'react';
import type { RateItem, RatesConfig } from '@/lib/types';
import november2025 from '@/config/rateCardPresets/november2025.json';
import { extractPdfText, parseRateItems, parsedToRateItems, ParsedItem } from '@/lib/pdfParser';

interface Props {
  rates: RatesConfig;
  onSave: (next: RatesConfig) => void;
  onReset: () => void;
  onClose: () => void;
}

function newBlankItem(): RateItem {
  return {
    key: `custom_${Math.random().toString(36).slice(2, 8)}`,
    phase: 'ingestion',
    label: 'New Rate Item',
    unit: 'Per 1,000,000 rows processed',
    unitDivisor: 1000000,
    unitLabel: 'rows',
    unitSingular: 'row',
    initialLabel: 'Initial Load Rows',
    supportsInitial: false,
    credits: { Production: 0, Sandbox: 0 },
    description: 'Describe this rate item.',
    processingRateNote: 'Per 1,000,000 rows processed',
    usageNote: ''
  };
}

type Stage = 'idle' | 'extracting' | 'parsing' | 'done' | 'error';

export default function RateSheetManager({ rates, onSave, onReset, onClose }: Props) {
  const [draft, setDraft] = useState<RatesConfig>(() => JSON.parse(JSON.stringify(rates)));
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const [pdfUrl, setPdfUrl] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedItem[]>([]);
  const [showText, setShowText] = useState(false);

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
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) =>
        i === idx ? { ...it, credits: { ...it.credits, [env]: Math.max(0, v) } } : it
      )
    }));
  }

  function addItem() { setDraft((d) => ({ ...d, items: [...d.items, newBlankItem()] })); }
  function removeItem(idx: number) { setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) })); }
  function loadNovemberDefault() { setDraft(JSON.parse(JSON.stringify(november2025))); }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sf-datacloud-rates-${draft.meta.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function tryImportJSON() {
    setImportError(null);
    try {
      const parsedJson = JSON.parse(importText);
      if (!parsedJson || typeof parsedJson !== 'object') throw new Error('Not a JSON object');
      if (!Array.isArray(parsedJson.items) || parsedJson.items.length === 0) {
        throw new Error('Missing "items" array');
      }
      const next: RatesConfig = {
        meta: { ...draft.meta, ...(parsedJson.meta ?? {}) },
        settings: { ...draft.settings, ...(parsedJson.settings ?? {}) },
        items: parsedJson.items
      };
      setDraft(next);
      setImportText('');
    } catch (e: any) {
      setImportError(e.message ?? 'Invalid JSON');
    }
  }

  async function processPdf(source: File | ArrayBuffer, sourceUrl?: string) {
    setPdfError(null);
    setExtractedText('');
    setParsed([]);
    setStage('extracting');
    try {
      const text = await extractPdfText(source);
      setExtractedText(text);
      setStage('parsing');
      const items = parseRateItems(text);
      setParsed(items);
      if (sourceUrl) {
        setDraft((d) => ({ ...d, meta: { ...d.meta, url: sourceUrl } }));
      }
      setStage('done');
    } catch (e: any) {
      setPdfError(e?.message ?? 'Failed to parse PDF');
      setStage('error');
    }
  }

  async function onPdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    await processPdf(f);
  }

  async function onFetchUrl() {
    if (!pdfUrl) return;
    setPdfError(null);
    setStage('extracting');
    try {
      const resp = await fetch('/api/fetch-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pdfUrl })
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${resp.status}`);
      }
      const buf = await resp.arrayBuffer();
      await processPdf(buf, pdfUrl);
    } catch (e: any) {
      setPdfError(e?.message ?? 'Fetch failed');
      setStage('error');
    }
  }

  function applyParsedItems() {
    if (parsed.length === 0) return;
    const newItems = parsedToRateItems(parsed);
    setDraft((d) => ({ ...d, items: newItems }));
  }

  function save() { onSave(draft); onClose(); }

  return (
    <div className="modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Rate Sheet Manager</h2>
            <p className="text-sm text-slate-500 mt-1">
              View, edit, upload, or fetch a new Salesforce Data Cloud rate sheet.
              Changes persist in your browser (localStorage) and drive all calculations.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="p-5 space-y-6">
          <section className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Import from Salesforce PDF</h3>
            <p className="text-xs text-slate-600 mb-3">
              Upload the latest Salesforce Data Cloud Platform Services rate sheet PDF, or paste its URL.
              The site will extract and parse rate items automatically.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Upload PDF file</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={onPdfFile}
                  className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sky-600 file:text-white file:cursor-pointer hover:file:bg-sky-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Or fetch by URL</label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={pdfUrl}
                    onChange={(e) => setPdfUrl(e.target.value)}
                    placeholder="https://www.salesforce.com/.../rate-sheet.pdf"
                    className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={onFetchUrl}
                    disabled={!pdfUrl || stage === 'extracting' || stage === 'parsing'}
                    className="btn-primary text-xs py-1.5 px-3 disabled:opacity-60"
                  >
                    Fetch & Parse
                  </button>
                </div>
              </div>
            </div>

            {stage === 'extracting' ? <p className="text-xs text-sky-700 mt-3">⏳ Extracting text from PDF...</p> : null}
            {stage === 'parsing' ? <p className="text-xs text-sky-700 mt-3">⏳ Parsing rate items...</p> : null}
            {stage === 'error' && pdfError ? <p className="text-xs text-rose-600 mt-3">Error: {pdfError}</p> : null}

            {stage === 'done' ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-emerald-700 font-semibold">
                    ✓ Parsed {parsed.length} candidate rate item{parsed.length === 1 ? '' : 's'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowText((s) => !s)} className="text-xs text-slate-500 underline">
                      {showText ? 'Hide' : 'Show'} extracted text
                    </button>
                    <button
                      onClick={applyParsedItems}
                      disabled={parsed.length === 0}
                      className="btn-primary text-xs py-1 px-3 disabled:opacity-60"
                    >
                      Apply parsed items ({parsed.length}) →
                    </button>
                  </div>
                </div>

                {parsed.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="text-left px-2 py-1.5">#</th>
                          <th className="text-left px-2 py-1.5">Label</th>
                          <th className="text-right px-2 py-1.5">Production</th>
                          <th className="text-right px-2 py-1.5">Sandbox</th>
                          <th className="text-left px-2 py-1.5">Unit hint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 25).map((p, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                            <td className="px-2 py-1">{p.label}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{p.production.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{p.sandbox.toLocaleString()}</td>
                            <td className="px-2 py-1 text-slate-500">{p.unitHint ?? '—'}</td>
                          </tr>
                        ))}
                        {parsed.length > 25 ? (
                          <tr>
                            <td colSpan={5} className="px-2 py-1 text-center text-slate-400 italic">
                              + {parsed.length - 25} more...
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {showText ? (
                  <pre className="mt-2 max-h-60 overflow-auto bg-white border border-slate-200 rounded p-2 text-[10px] whitespace-pre-wrap font-mono">
                    {extractedText.slice(0, 20000)}
                    {extractedText.length > 20000 ? '\n\n[truncated]' : ''}
                  </pre>
                ) : null}
                <p className="text-[11px] italic text-slate-500">
                  Heuristic parser — please verify parsed values against the source PDF before saving.
                </p>
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rate Sheet Source (name)</label>
              <input
                type="text"
                value={draft.meta.source}
                onChange={(e) => setDraft((d) => ({ ...d, meta: { ...d.meta, source: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rate Sheet PDF URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={draft.meta.url}
                  onChange={(e) => setDraft((d) => ({ ...d, meta: { ...d.meta, url: e.target.value } }))}
                  className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                />
                <a href={draft.meta.url} target="_blank" rel="noreferrer" className="text-xs text-sky-600 underline whitespace-nowrap">Open PDF</a>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Version tag</label>
              <input
                type="text"
                value={draft.meta.version}
                onChange={(e) => setDraft((d) => ({ ...d, meta: { ...d.meta, version: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={loadNovemberDefault}
                className="btn-ghost text-sm py-1.5 px-3"
                title="Restore the built-in Nov 2025 rate sheet"
              >
                Load November 2025 defaults
              </button>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">Rate Items ({items.length})</h3>
              <button onClick={addItem} className="btn-ghost text-sm py-1 px-3">+ Add item</button>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-[1100px] w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-2 py-2">Key</th>
                    <th className="text-left px-2 py-2">Phase</th>
                    <th className="text-left px-2 py-2">Label</th>
                    <th className="text-left px-2 py-2">Unit</th>
                    <th className="text-right px-2 py-2">Divisor</th>
                    <th className="text-left px-2 py-2">Unit Label</th>
                    <th className="text-right px-2 py-2">Prod. Credits</th>
                    <th className="text-right px-2 py-2">Sandbox Credits</th>
                    <th className="text-center px-2 py-2">Initial?</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-2 py-1"><input value={it.key} onChange={(e) => updateItem(idx, { key: e.target.value })} className="w-32 border border-slate-200 rounded px-1 py-1 text-xs" /></td>
                      <td className="px-2 py-1">
                        <input list={`phases-list-${idx}`} value={it.phase} onChange={(e) => updateItem(idx, { phase: e.target.value })} className="w-32 border border-slate-200 rounded px-1 py-1 text-xs" />
                        <datalist id={`phases-list-${idx}`}>{uniquePhases.map((p) => <option key={p} value={p} />)}</datalist>
                      </td>
                      <td className="px-2 py-1"><input value={it.label} onChange={(e) => updateItem(idx, { label: e.target.value })} className="w-48 border border-slate-200 rounded px-1 py-1 text-xs" /></td>
                      <td className="px-2 py-1"><input value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} className="w-44 border border-slate-200 rounded px-1 py-1 text-xs" /></td>
                      <td className="px-2 py-1 text-right"><input type="number" value={it.unitDivisor} onChange={(e) => updateItem(idx, { unitDivisor: Math.max(1, Number(e.target.value) || 1) })} className="w-24 border border-slate-200 rounded px-1 py-1 text-xs text-right" /></td>
                      <td className="px-2 py-1"><input value={it.unitLabel} onChange={(e) => updateItem(idx, { unitLabel: e.target.value })} className="w-24 border border-slate-200 rounded px-1 py-1 text-xs" /></td>
                      <td className="px-2 py-1 text-right"><input type="number" value={it.credits.Production} onChange={(e) => updateCredits(idx, 'Production', Number(e.target.value))} className="w-24 border border-slate-200 rounded px-1 py-1 text-xs text-right" /></td>
                      <td className="px-2 py-1 text-right"><input type="number" value={it.credits.Sandbox} onChange={(e) => updateCredits(idx, 'Sandbox', Number(e.target.value))} className="w-24 border border-slate-200 rounded px-1 py-1 text-xs text-right" /></td>
                      <td className="px-2 py-1 text-center"><input type="checkbox" checked={it.supportsInitial} onChange={(e) => updateItem(idx, { supportsInitial: e.target.checked })} /></td>
                      <td className="px-2 py-1 text-right"><button onClick={() => removeItem(idx)} className="text-rose-500 hover:text-rose-700 text-xs" title="Remove item">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Import JSON</h3>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)}
                placeholder='{"meta": {...}, "settings": {...}, "items": [...] }'
                className="w-full h-28 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono" />
              {importError ? <p className="text-xs text-rose-600 mt-1">Error: {importError}</p> : null}
              <button onClick={tryImportJSON} className="btn-ghost text-sm py-1 px-3 mt-2">Import</button>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Export</h3>
              <p className="text-xs text-slate-500 mb-2">Download the current rate sheet as JSON for versioning or sharing.</p>
              <button onClick={exportJSON} className="btn-ghost text-sm py-1 px-3">Download JSON</button>
            </div>
          </section>
        </div>

        <div className="p-5 border-t border-slate-200 flex items-center justify-between">
          <button onClick={() => { onReset(); onClose(); }} className="text-sm text-rose-600 hover:underline">
            Reset to built-in defaults
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button onClick={save} className="btn-primary text-sm">Save & Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}
