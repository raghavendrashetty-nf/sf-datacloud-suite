'use client';

import { useState } from 'react';
import type { Environment, RatesConfig } from '@/lib/types';
import { fmtCredits, fmtCreditsLabel, fmtUSD } from '@/lib/formatters';
import { pipelineBreakdown, pipelineDisplayName, type Pipeline } from '@/lib/pipeline';
import {
  connectionsFor, findConnection, getPhaseRefreshConfig, PIPELINE_TYPE_DOCS,
  REFRESH_MODE_META, runsPerYearFor, RUN_FREQUENCY_META, type PipelineType, type RefreshMode, type RunFrequency
} from '@/lib/refreshModes';
import InfoTooltip from '../InfoTooltip';
import NumberSpinner from '../NumberSpinner';
import { useSelectAllOnFocus } from '@/hooks/useSelectAllOnFocus';

interface Props {
  pipelines: Pipeline[];
  rates: RatesConfig;
  environment: Environment;
  overheadPct: number;
  onAdd: (connectionKey: string, section: PipelineType) => void;
  onUpdate: (id: string, patch: Partial<Pipeline>) => void;
  onRemove: (id: string) => void;
}

const BATCH_RUN_MODES = getPhaseRefreshConfig('ingestion').modes.filter((m) => m !== 'streaming');
const BATCH_FREQUENCIES = getPhaseRefreshConfig('ingestion').frequenciesByMode;

// Embedded directly inside the (External) Data Pipeline - Batch/Streaming item cards
// (see ItemCardAdvanced.tsx) rather than in a separate section - keeps pipeline
// configuration next to the credit line it actually feeds, no page-jump required.
export default function PipelineSection({ type, title, pipelines, rates, environment, overheadPct, onAdd, onUpdate, onRemove }: Props & { type: PipelineType; title: string }) {
  const connections = connectionsFor(type);
  const [pendingConnection, setPendingConnection] = useState(connections[0].key);
  const sectionPipelines = pipelines.filter((p) => (p.runMode === 'streaming') === (type === 'streaming'));
  const subtotalCredits = sectionPipelines.reduce((sum, p) => sum + pipelineBreakdown(p, rates, environment, overheadPct).annualCredits, 0);
  const accent = type === 'batch' ? 'sky' : 'rose';

  return (
    <div className={`card p-3 border-t-4 border-t-${accent}-500`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <InfoTooltip
            description={type === 'batch'
              ? 'Full or Incremental Refresh pipelines that run on a schedule. Rolls up into the "(External) Data Pipeline - Batch" credit line.'
              : 'Continuous, always-on pipelines (Web/Mobile SDK, Kafka, Ingestion API Streaming). Rolls up into the "(External) Data Pipeline - Streaming" credit line.'}
            docs={PIPELINE_TYPE_DOCS[type]}
          />
        </div>
        {sectionPipelines.length > 0 ? (
          <span className="chip bg-slate-100 text-slate-600">{sectionPipelines.length} pipeline{sectionPipelines.length === 1 ? '' : 's'} · {fmtCredits(subtotalCredits)} credits/yr</span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <select value={pendingConnection} onChange={(e) => setPendingConnection(e.target.value)}
          aria-label={`Connection for new ${type} pipeline`}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400">
          {connections.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button type="button" onClick={() => onAdd(pendingConnection, type)} className="btn-primary text-xs py-1.5 px-3">+ Add Pipeline</button>
      </div>

      {sectionPipelines.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500 italic">No {type} pipelines configured yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {sectionPipelines.map((p) => (
            <PipelineCard key={p.id} pipeline={p} type={type} rates={rates} environment={environment} overheadPct={overheadPct} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineCard({ pipeline, type, rates, environment, overheadPct, onUpdate, onRemove }: {
  pipeline: Pipeline; type: PipelineType; rates: RatesConfig; environment: Environment; overheadPct: number;
  onUpdate: Props['onUpdate']; onRemove: Props['onRemove'];
}) {
  const [expanded, setExpanded] = useState(false);
  const conn = findConnection(pipeline.connectionKey);
  const isOther = conn?.isOther === true;
  const connLabel = isOther ? (pipeline.customConnectionName || 'Other Connection') : (conn?.label ?? pipeline.connectionKey);
  const displayName = pipelineDisplayName(pipeline, connLabel);
  const breakdown = pipelineBreakdown(pipeline, rates, environment, overheadPct);
  const availableFrequencies = BATCH_FREQUENCIES[pipeline.runMode] ?? [];
  const selectAllConn = useSelectAllOnFocus();
  const selectAllObject = useSelectAllOnFocus();
  const selectAllManualRuns = useSelectAllOnFocus();

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="p-2 bg-slate-50 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}
            className="w-6 h-6 rounded-full bg-indigo-100 hover:bg-indigo-200 flex items-center justify-center shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
            aria-label={expanded ? `Collapse pipeline ${displayName}` : `Expand pipeline ${displayName}`}
            title={expanded ? 'Click to collapse' : 'Click to expand'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true" className={`w-3.5 h-3.5 text-indigo-700 transition-transform ${expanded ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isOther ? (
            <input value={pipeline.customConnectionName ?? ''} onChange={(e) => onUpdate(pipeline.id, { customConnectionName: e.target.value })}
              onFocus={selectAllConn.onFocus} onMouseUp={selectAllConn.onMouseUp}
              aria-label="Custom connection name" placeholder="Specify connection name"
              className="w-40 border border-slate-200 rounded px-1.5 py-1 text-xs shrink-0 focus:outline-none focus:ring-2 focus:ring-sky-400" />
          ) : null}

          <EditablePipelineName pipeline={pipeline} connLabel={connLabel} onUpdate={onUpdate} />

          <div className="ml-auto text-right shrink-0">
            <div className="text-[9px] uppercase tracking-wide text-slate-500">Annual Credits</div>
            <div className="text-sm font-semibold tabular-nums text-slate-900">{fmtCreditsLabel(breakdown.annualCredits)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pl-8">
          <input value={pipeline.object} onChange={(e) => onUpdate(pipeline.id, { object: e.target.value })}
            onFocus={selectAllObject.onFocus} onMouseUp={selectAllObject.onMouseUp}
            aria-label="Object" placeholder="Object (e.g. Contact)"
            className="w-28 border border-slate-200 rounded px-1.5 py-1 text-xs shrink-0 focus:outline-none focus:ring-2 focus:ring-sky-400" />
          <div className="w-36 shrink-0">
            <NumberSpinner value={pipeline.volumePerRun} onChange={(v) => onUpdate(pipeline.id, { volumePerRun: v })}
              ariaLabel={`${connLabel} ${type === 'streaming' ? 'rows per day' : 'volume per run'}`}
              suffix={type === 'streaming' ? 'rows/day' : 'rows/run'} />
          </div>

          {type === 'batch' ? (
            <>
              <select value={pipeline.runMode}
                onChange={(e) => {
                  const runMode = e.target.value as RefreshMode;
                  const freqs = BATCH_FREQUENCIES[runMode] ?? [];
                  onUpdate(pipeline.id, { runMode, frequency: freqs[0] ?? pipeline.frequency });
                }}
                aria-label="Run Mode"
                className="w-32 shrink-0 border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400">
                {BATCH_RUN_MODES.map((m) => <option key={m} value={m}>{REFRESH_MODE_META[m].label}</option>)}
              </select>
              <select value={pipeline.frequency} onChange={(e) => onUpdate(pipeline.id, { frequency: e.target.value as RunFrequency })}
                aria-label="Run Frequency"
                className="w-32 shrink-0 border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400">
                {availableFrequencies.map((f) => <option key={f} value={f}>{RUN_FREQUENCY_META[f].label}</option>)}
              </select>
              {pipeline.frequency === 'manual' ? (
                <input type="number" min={1} value={pipeline.manualRunsPerYear ?? 12}
                  onChange={(e) => onUpdate(pipeline.id, { manualRunsPerYear: Math.max(1, Number(e.target.value)) })}
                  onFocus={selectAllManualRuns.onFocus} onMouseUp={selectAllManualRuns.onMouseUp}
                  aria-label="Estimated runs per year" title="Runs per year"
                  className="w-20 shrink-0 border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400" />
              ) : null}
            </>
          ) : (
            <span className="chip bg-rose-100 text-rose-700">Continuous</span>
          )}

          <button onClick={() => onRemove(pipeline.id)} className="btn-danger text-[11px] py-1 px-2.5 shrink-0 ml-auto"
            aria-label={`Remove pipeline ${displayName}`}>Remove</button>
        </div>
      </div>

      {expanded ? (
        <div className="p-3 border-t border-slate-200 bg-white space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <BreakdownStat label="Daily" credits={breakdown.dailyCredits} cost={breakdown.dailyCostUSD} />
            <BreakdownStat label="Monthly" credits={breakdown.monthlyCredits} cost={breakdown.monthlyCostUSD} />
            <BreakdownStat label="Annual" credits={breakdown.annualCredits} cost={breakdown.annualCostUSD} />
          </div>

          <div className="text-[11px] text-slate-500 space-y-0.5">
            <div>Pipeline Name: <strong className="text-slate-700">{displayName}</strong>
              <span className="text-slate-500"> ({pipeline.nameIsCustom ? 'custom' : 'auto-generated'} - click the name above to rename)</span>
            </div>
            <div>Connection: <strong className="text-slate-700">{connLabel}</strong></div>
            <div>
              Formula: <code className="text-[11px]">
                ({fmtCredits(pipeline.volumePerRun)} {pipeline.runMode === 'streaming' ? 'rows/day' : 'rows/run'} ÷ 1,000,000) × {breakdown.rate} credits
                {pipeline.runMode === 'streaming' ? ' × 365 (continuous)' : ` × ${fmtCredits(runsPerYearFor(pipeline.frequency, pipeline.manualRunsPerYear))} runs/yr`}
                {overheadPct > 0 ? ` × ${(1 + overheadPct / 100).toFixed(2)} overhead` : ''}
              </code>
            </div>
            <div>Annual Rows Processed: <strong className="text-slate-700">{fmtCredits(breakdown.annualRows)}</strong></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditablePipelineName({ pipeline, connLabel, onUpdate }: { pipeline: Pipeline; connLabel: string; onUpdate: Props['onUpdate'] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const displayName = pipelineDisplayName(pipeline, connLabel);
  const selectAllName = useSelectAllOnFocus();

  function startEdit() {
    setDraft(pipeline.nameIsCustom && pipeline.name ? pipeline.name : displayName);
    setEditing(true);
  }
  function commit() {
    const trimmed = draft.trim();
    onUpdate(pipeline.id, trimmed ? { name: trimmed, nameIsCustom: true } : { name: '', nameIsCustom: false });
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onFocus={selectAllName.onFocus} onMouseUp={selectAllName.onMouseUp}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
        aria-label="Pipeline name"
        className="min-w-0 flex-1 font-semibold text-sm text-slate-900 border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
    );
  }
  return (
    <button type="button" onClick={startEdit} title="Click to rename"
      aria-label={`Rename pipeline, currently ${displayName}`}
      className="min-w-0 flex-1 text-left font-semibold text-sm text-slate-900 hover:text-indigo-700 hover:underline truncate focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded">
      {displayName}
    </button>
  );
}

function BreakdownStat({ label, credits, cost }: { label: string; credits: number; cost: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-slate-900">{fmtCreditsLabel(credits)}</div>
      <div className="text-[10px] text-slate-500 tabular-nums">{fmtUSD(cost)}</div>
    </div>
  );
}
