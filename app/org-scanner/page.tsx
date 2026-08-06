'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import CollapsibleSection from '@/components/CollapsibleSection';
import ConnectionForm from '@/components/data-readiness/ConnectionForm';
import SavedConnectionQuickConnect from '@/components/SavedConnectionQuickConnect';
import { useSkills } from '@/hooks/useSkills';
import { useRates } from '@/hooks/useRates';
import { extractPdfText } from '@/lib/pdfParser';
import { calculate } from '@/lib/calculator';
import type { ConnectionInfo } from '@/lib/dataReadiness';
import type { ImplementationReview } from '@/lib/orgReview';
import type { CalculatorInputs, Period } from '@/lib/types';
import {
  computeDloVolumeSignal, computeConfigFootprint, extractSegmentVolumeSignal, extractDigitalWalletRollup,
  buildBasicHandoff, buildAdvancedHandoff, buildFlexHandoff,
  BASIC_HANDOFF_KEY, ADVANCED_HANDOFF_KEY, FLEX_HANDOFF_KEY,
  type PipelineBucket
} from '@/lib/orgScanCreditEstimate';

interface ScanCategoryResult {
  category: string;
  status: 'ok' | 'error';
  items?: { name: string; displayName?: string; [key: string]: unknown }[];
  error?: string;
  note?: string;
}

type Stage = 'idle' | 'scanning' | 'done' | 'error';
type ReviewMode = 'best_practices' | 'sow';
type ReviewStage = 'idle' | 'extracting' | 'reviewing' | 'done' | 'error';

const ORG_SCANNER_SESSION_KEY = 'sfdc.orgScanner.session.v1';

const SEVERITY_STYLE: Record<string, string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-sky-200 bg-sky-50 text-sky-700',
  info: 'border-slate-200 bg-slate-50 text-slate-600'
};
const SOW_GAP_STYLE: Record<string, string> = {
  met: 'bg-emerald-100 text-emerald-700',
  partially_met: 'bg-amber-100 text-amber-700',
  not_met: 'bg-rose-100 text-rose-700',
  not_determinable: 'bg-slate-100 text-slate-600'
};

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
  const router = useRouter();
  const { skills } = useSkills();
  const { rates } = useRates();
  const [connection, setConnection] = useState<ConnectionInfo>({ connected: false });
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanCategoryResult[] | null>(null);
  const [scanMessages, setScanMessages] = useState<string[]>([]);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Ticks once a second while scanning, purely to drive the elapsed-time display - independent
  // of how often progress messages actually arrive (some steps take a while between messages).
  useEffect(() => {
    if (stage !== 'scanning') return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);
  const elapsedSec = scanStartedAt ? Math.max(0, Math.floor((nowTick - scanStartedAt) / 1000)) : 0;

  const [pipelineBucket, setPipelineBucket] = useState<PipelineBucket>('external');
  const [pipelinePeriod, setPipelinePeriod] = useState<Period>('month');

  const [reviewMode, setReviewMode] = useState<ReviewMode>('best_practices');
  const [sowText, setSowText] = useState('');
  const [sowFileName, setSowFileName] = useState<string | null>(null);
  const [reviewStage, setReviewStage] = useState<ReviewStage>('idle');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [review, setReview] = useState<ImplementationReview | null>(null);

  // Navigating to a calculator via goToBasicCalculator/goToAdvancedCalculator/goToFlexCredits and
  // back fully unmounts this page (Next.js App Router), which would otherwise lose the scan -
  // forcing a re-scan just to try a second calculator against the same results. Persisted to
  // sessionStorage (not localStorage - throwaway in-progress state, not something to keep across
  // browser sessions) and rehydrated on mount, same pattern already used on Deployment Assistant.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(ORG_SCANNER_SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.results) { setResults(saved.results); setStage('done'); }
      if (saved.pipelineBucket) setPipelineBucket(saved.pipelineBucket);
      if (saved.pipelinePeriod) setPipelinePeriod(saved.pipelinePeriod);
      if (saved.reviewMode) setReviewMode(saved.reviewMode);
      if (saved.sowText) setSowText(saved.sowText);
      if (saved.sowFileName) setSowFileName(saved.sowFileName);
      if (saved.review) setReview(saved.review);
    } catch { /* malformed/absent - ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(ORG_SCANNER_SESSION_KEY, JSON.stringify({
        results, pipelineBucket, pipelinePeriod, reviewMode, sowText, sowFileName, review
      }));
    } catch { /* storage unavailable/full - non-critical, just skip persistence */ }
  }, [results, pipelineBucket, pipelinePeriod, reviewMode, sowText, sowFileName, review]);

  async function runScan() {
    setError(null);
    setResults(null);
    setReview(null);
    setScanMessages([]);
    setScanStartedAt(Date.now());
    setNowTick(Date.now());
    setStage('scanning');
    try {
      const resp = await fetch('/api/org-scanner/scan', { method: 'POST' });
      if (!resp.ok) {
        let message = `Request failed with HTTP ${resp.status}`;
        try { const json = await resp.json(); message = json.error ?? message; } catch { /* body wasn't JSON */ }
        setError(message);
        setStage('error');
        return;
      }
      if (!resp.body) throw new Error('Streaming response body not available in this browser.');

      // The scan streams newline-delimited JSON progress messages, ending in a "done"/"error"
      // line - so real progress can render as it happens instead of a blank spinner.
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === 'progress') {
            setScanMessages((prev) => [...prev, msg.message]);
          } else if (msg.type === 'done') {
            setResults(msg.results as ScanCategoryResult[]);
            setStage('done');
            finished = true;
          } else if (msg.type === 'error') {
            setError(msg.message);
            setStage('error');
            finished = true;
          }
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Request failed');
      setStage('error');
    }
  }

  const dloScanStatus = results?.find((r) => r.category === 'Data Lake Objects (DLOs)')?.status;
  const dloSignal = useMemo(() => (results ? computeDloVolumeSignal(results) : null), [results]);
  const footprint = useMemo(() => (results ? computeConfigFootprint(results) : null), [results]);
  const segmentSignal = useMemo(() => (results ? extractSegmentVolumeSignal(results) : null), [results]);
  const walletRollup = useMemo(() => (results ? extractDigitalWalletRollup(results) : null), [results]);

  const pipelineItemKey = pipelineBucket === 'internal' ? 'internalDataPipeline' : 'externalDataPipelineBatch';
  const estimateInputs: CalculatorInputs = useMemo(() => ({
    environment: 'Production',
    costPerCreditUSD: rates.settings.costPerCreditUSD,
    overheadPct: 0,
    itemVolumes: dloSignal ? { [pipelineItemKey]: dloSignal.totalRows } : {},
    itemInitials: {},
    itemPeriods: dloSignal ? { [pipelineItemKey]: pipelinePeriod } : {}
  }), [rates.settings.costPerCreditUSD, dloSignal, pipelineItemKey, pipelinePeriod]);
  const estimateResult = useMemo(() => calculate(estimateInputs, rates), [estimateInputs, rates]);

  function goToBasicCalculator() {
    if (!dloSignal) return;
    const handoff = buildBasicHandoff(dloSignal.totalRows, pipelineBucket, pipelinePeriod, segmentSignal, footprint);
    try { window.sessionStorage.setItem(BASIC_HANDOFF_KEY, JSON.stringify(handoff)); } catch { /* ignore */ }
    router.push('/credit-calculator');
  }
  function goToAdvancedCalculator() {
    if (!dloSignal) return;
    const handoff = buildAdvancedHandoff(dloSignal.totalRows, pipelineBucket, pipelinePeriod, footprint);
    try { window.sessionStorage.setItem(ADVANCED_HANDOFF_KEY, JSON.stringify(handoff)); } catch { /* ignore */ }
    router.push('/credit-calculator/advanced');
  }
  function goToFlexCredits() {
    if (!dloSignal) return;
    const handoff = buildFlexHandoff(dloSignal.totalRows, pipelinePeriod, footprint);
    try { window.sessionStorage.setItem(FLEX_HANDOFF_KEY, JSON.stringify(handoff)); } catch { /* ignore */ }
    router.push('/credit-calculator?mode=flex_credits');
  }

  async function onSowPdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setReviewError(null);
    setSowFileName(f.name);
    setReviewStage('extracting');
    try {
      const text = await extractPdfText(f);
      setSowText(text);
      setReviewStage('idle');
    } catch (err: any) {
      setReviewError(err?.message ?? 'Failed to extract text from PDF');
      setReviewStage('error');
    }
  }

  async function runReview() {
    if (!results) return;
    if (reviewMode === 'sow' && !sowText.trim()) return;
    setReviewError(null);
    setReview(null);
    setReviewStage('reviewing');
    try {
      const resp = await fetch('/api/org-scanner/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanResults: results,
          skills: skills.skills,
          sowText: reviewMode === 'sow' ? sowText : undefined
        })
      });
      const json = await resp.json();
      if (!resp.ok) {
        setReviewError(json.error ?? `Request failed with HTTP ${resp.status}`);
        setReviewStage('error');
        return;
      }
      setReview(json.review as ImplementationReview);
      setReviewStage('done');
    } catch (err: any) {
      setReviewError(err?.message ?? 'Request failed');
      setReviewStage('error');
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
          {!connection.connected ? <SavedConnectionQuickConnect slot="primary" onConnected={setConnection} /> : null}
          <ConnectionForm onConnected={setConnection} externalInfo={connection} />
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
            {stage === 'scanning' ? (
              <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-teal-800">
                    {scanMessages.length > 0 ? scanMessages[scanMessages.length - 1] : 'Connecting to Data Cloud...'}
                  </span>
                  <span className="text-[11px] text-teal-600 shrink-0 tabular-nums">{elapsedSec}s elapsed</span>
                </div>
                {elapsedSec >= 20 ? (
                  <p className="text-[11px] text-amber-700 mt-1.5">
                    Still working - large orgs with 100+ Data Lake/Model Objects can take a minute or more, since each one is fetched via paginated API calls.
                  </p>
                ) : null}
                {scanMessages.length > 1 ? (
                  <ul className="mt-2 max-h-28 overflow-y-auto space-y-0.5 border-t border-teal-100 pt-1.5">
                    {scanMessages.slice(0, -1).slice(-8).map((m, i) => (
                      <li key={i} className="text-[11px] text-teal-700/80">{m}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
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
              return (
                <CollapsibleSection key={r.category} title={`${r.category} (${r.status === 'ok' ? r.items?.length ?? 0 : 'error'})`} defaultOpen={false}>
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

        {results ? (
          <div className="card p-5 mt-6">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900">Estimated Credit Consumption</h2>
              <span className="chip text-[10px] font-semibold bg-slate-100 text-slate-600">Credit-Based Consumption model</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Sized from what this scan actually found, not a guess - refine in the Credit Calculator once you confirm your real ingestion cadence.
              The figure below uses the Credit-Based Consumption (Data Services Credits) model - use &quot;Refine in Flex Credits&quot; below if your org is on that newer billing model instead.
            </p>

            {walletRollup ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="text-xs font-semibold text-emerald-800">Actual usage found (Digital Wallet)</p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Summed real &quot;{walletRollup.valueField}&quot;{walletRollup.categoryField ? <> grouped by &quot;{walletRollup.categoryField}&quot;</> : null} from the sampled rows above - these are actual reported numbers, not an estimate.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {walletRollup.byCategory.map((c) => (
                    <span key={c.category} className="chip text-[11px] font-medium bg-white border border-emerald-200 text-emerald-800">{c.category}: {c.total.toLocaleString()}</span>
                  ))}
                </div>
                <p className="text-xs font-bold text-emerald-900 mt-2">Total: {walletRollup.grandTotal.toLocaleString()}</p>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Data Lake Volume</div>
                <div className="text-lg font-bold text-slate-900">{(dloSignal?.totalRows ?? 0).toLocaleString()}</div>
                {dloScanStatus === 'error' ? (
                  <div className="text-rose-600">Data Lake Objects scan failed above - volume unavailable, not confirmed zero. The estimate below will be 0 until that's fixed.</div>
                ) : (
                  <div className="text-slate-500">rows across {dloSignal?.dloCount ?? 0} DLOs (real, from this scan)</div>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Segments / Calculated Insights</div>
                <div className="text-lg font-bold text-slate-900">{footprint?.segments ?? 0} / {footprint?.calculatedInsights ?? 0}</div>
                <div className="text-slate-500">configured (counts only, not a volume signal)</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Data Transforms / Activation Platforms</div>
                <div className="text-lg font-bold text-slate-900">{footprint?.dataTransforms ?? 0} / {footprint?.activationPlatforms ?? 0}</div>
                <div className="text-slate-500">configured (counts only, not a volume signal)</div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-semibold text-slate-800 mb-2">Pipeline credit estimate (assumption-based)</p>
              <p className="text-[11px] text-slate-500 mb-3">
                The scan can&apos;t tell whether this data arrives via the Salesforce CRM connector (Internal) or an external connector, or how often it refreshes - pick the closest match to drive the estimate below.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex gap-1.5">
                  {(['internal', 'external'] as const).map((b) => (
                    <button key={b} type="button" onClick={() => setPipelineBucket(b)}
                      className={`chip text-xs font-medium border ${pipelineBucket === b ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                      {b === 'internal' ? 'Salesforce CRM (Internal)' : 'External Connector'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {(['day', 'week', 'month', 'year'] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setPipelinePeriod(p)}
                      className={`chip text-xs font-medium border ${pipelinePeriod === p ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                      Every {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">{Math.round(estimateResult.totals.annualCredits).toLocaleString()}</span>
                <span className="text-xs text-slate-500">credits/year (~${estimateResult.totals.annualCostUSD.toFixed(2)}/year)</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <button onClick={goToFlexCredits} className="btn-ghost text-sm py-1.5 px-3 border border-emerald-300 text-emerald-700 hover:bg-emerald-50">Refine in Flex Credits (New) &rarr;</button>
              <button onClick={goToBasicCalculator} className="btn-ghost text-sm py-1.5 px-3">Refine in Basic Calculator &rarr;</button>
              <button onClick={goToAdvancedCalculator} className="btn-primary text-sm py-1.5 px-3">Refine in Advanced Calculator &rarr;</button>
            </div>
          </div>
        ) : null}

        {results ? (
          <div className="card p-5 mt-6">
            <h2 className="text-sm font-bold text-slate-900">Analyze Implementation</h2>
            <p className="text-xs text-slate-500 mt-1">
              Review the scan above against Data 360 best practices, or against a specific SOW to check whether the implementation matches what was scoped.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <label className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 cursor-pointer text-sm ${reviewMode === 'best_practices' ? 'border-teal-500 bg-teal-50/50' : 'border-slate-200'}`}>
                <input type="radio" name="reviewMode" checked={reviewMode === 'best_practices'} onChange={() => setReviewMode('best_practices')} />
                Against Best Practices
              </label>
              <label className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 cursor-pointer text-sm ${reviewMode === 'sow' ? 'border-teal-500 bg-teal-50/50' : 'border-slate-200'}`}>
                <input type="radio" name="reviewMode" checked={reviewMode === 'sow'} onChange={() => setReviewMode('sow')} />
                Against a Provided SOW
              </label>
            </div>

            {reviewMode === 'sow' ? (
              <div className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Upload PDF</label>
                    <input type="file" accept="application/pdf,.pdf" onChange={onSowPdfFile}
                      className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white file:cursor-pointer hover:file:bg-teal-700" />
                    {sowFileName ? <p className="mt-1 text-[11px] text-slate-500">Loaded: {sowFileName}</p> : null}
                    {reviewStage === 'extracting' ? <p className="mt-1 text-[11px] text-teal-700">Extracting text...</p> : null}
                  </div>
                  <div className="flex items-end">
                    <p className="text-xs text-slate-500">Or paste the SOW text directly in the box below.</p>
                  </div>
                </div>
                <textarea value={sowText} onChange={(e) => setSowText(e.target.value)} rows={6}
                  placeholder="Paste the SOW / Discovery Document text here, or upload a PDF above..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end">
              <button onClick={runReview} disabled={reviewStage === 'reviewing' || (reviewMode === 'sow' && !sowText.trim())}
                className="btn-primary text-sm disabled:opacity-60">
                {reviewStage === 'reviewing' ? 'Analyzing...' : 'Run Analysis'}
              </button>
            </div>
            {reviewStage === 'error' && reviewError ? (
              <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{reviewError}</p>
            ) : null}

            {review ? (
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-700">{review.summary}</p>

                <CollapsibleSection title={`Findings (${review.findings.length})`} defaultOpen>
                  <div className="space-y-2">
                    {review.findings.map((f, i) => (
                      <div key={i} className={`rounded-lg border p-2.5 ${SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.info}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide">{f.area}</span>
                          <span className="chip text-[10px] font-bold bg-white/60">{f.severity}</span>
                        </div>
                        <p className="text-xs mt-1"><strong>Observation:</strong> {f.observation}</p>
                        <p className="text-xs mt-1"><strong>Recommendation:</strong> {f.recommendation}</p>
                      </div>
                    ))}
                    {review.findings.length === 0 ? <p className="text-xs text-slate-500">No findings returned.</p> : null}
                  </div>
                </CollapsibleSection>

                {review.sowGaps.length > 0 ? (
                  <CollapsibleSection title={`SOW Requirement Coverage (${review.sowGaps.length})`} defaultOpen>
                    <div className="space-y-2">
                      {review.sowGaps.map((g, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">{g.requirement}</span>
                            <span className={`chip text-[10px] font-bold ${SOW_GAP_STYLE[g.status] ?? SOW_GAP_STYLE.not_determinable}`}>{g.status.replace(/_/g, ' ')}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{g.detail}</p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <footer className="py-6 text-center text-xs text-slate-500">
        Not affiliated with Salesforce.
      </footer>
    </main>
  );
}
