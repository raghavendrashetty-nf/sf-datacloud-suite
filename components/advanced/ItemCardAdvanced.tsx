'use client';

import { useState } from 'react';
import type { Environment, ItemResult, Period, RateItem, RatesConfig } from '@/lib/types';
import { fmtCredits, fmtUSD } from '@/lib/formatters';
import { getPhaseTheme } from '../PhaseTheme';
import NumberSpinner from '../NumberSpinner';
import CollapsibleSection from '../CollapsibleSection';
import InfoTooltip from '../InfoTooltip';
import { getPhaseRefreshConfig, REFRESH_MODE_META, runsPerYearFor, RUN_FREQUENCY_META, type PipelineType, type RefreshMode, type RunFrequency } from '@/lib/refreshModes';
import { PIPELINE_DRIVEN_ITEM_KEYS } from '@/lib/pipeline';
import PipelineSection from './PipelineBuilder';
import type { useCalculatorAdvanced } from '@/hooks/useCalculatorAdvanced';

const PERIOD_LABEL_PER: Record<Period, string> = { day: '/ day', week: '/ week', month: '/ month', year: '/ year' };
const PERIOD_WORD: Record<Period, string> = { day: 'day', week: 'week', month: 'month', year: 'year' };
const MULTIPLIER: Record<Period, number> = { day: 365, week: 52, month: 12, year: 1 };
const MULTIPLIER_NOTE: Record<Period, string> = {
  day: '365 days per year', week: '52 weeks per year', month: '12 months per year', year: 'input is already annual'
};

interface Props {
  item: RateItem;
  environment: Environment;
  costPerCreditUSD: number;
  result: ItemResult;
  adv: ReturnType<typeof useCalculatorAdvanced>;
  rates: RatesConfig;
}

export default function ItemCardAdvanced({ item, environment, costPerCreditUSD, result, adv, rates }: Props) {
  const [expanded, setExpanded] = useState(false);
  const theme = getPhaseTheme(item.phase);
  const rate = item.credits[environment] ?? 0;
  const isFree = rate === 0;
  const cfg = getPhaseRefreshConfig(item.phase);
  const isPipelineDriven = item.key === PIPELINE_DRIVEN_ITEM_KEYS.batch || item.key === PIPELINE_DRIVEN_ITEM_KEYS.streaming;

  return (
    <div className={`card p-3 relative border-t-4 border-t-${theme.color}-500 ${isFree ? 'bg-emerald-50/30' : ''}`}>
      <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}
        className="w-full flex items-center gap-2 text-left -m-1 p-1 rounded-lg hover:bg-slate-50 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <h3 className="text-sm font-semibold text-slate-900 flex-1 min-w-0 leading-snug truncate">{item.label}</h3>
        {isFree ? <span className="chip bg-emerald-500 text-white font-bold shrink-0" title="This item is free">FREE</span> : null}
        {!expanded ? (
          <span className="text-xs text-slate-500 tabular-nums shrink-0">
            {isFree ? 'free' : `${fmtCredits(result.annualCredits)} cr/yr`}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <>
          <p className="text-[11px] text-slate-500 mt-2 leading-snug">{item.description}</p>

          {isPipelineDriven ? (
            <PipelineDrivenBlock item={item} adv={adv} rates={rates} result={result} isFree={isFree} />
          ) : cfg.hasRefreshControls ? (
            <RefreshControlledInputs item={item} adv={adv} cfg={cfg} result={result} isFree={isFree} />
          ) : (
            <LegacyPeriodInputs item={item} adv={adv} result={result} costPerCreditUSD={costPerCreditUSD} isFree={isFree} streamingNote={cfg.streamingNote} />
          )}

          {item.supportsInitial ? (
            <div className={`mt-2 rounded-lg bg-${theme.color}-50 border border-${theme.color}-100 p-2`}>
              <label className="block text-[11px] font-semibold text-slate-800 mb-1">{item.initialLabel} (Day 0, one-time)</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <NumberSpinner value={adv.state.itemInitials[item.key] ?? 0} onChange={(v) => adv.setItemInitial(item.key, v)} ariaLabel={`${item.label} — ${item.initialLabel}`} suffix={item.unitLabel} />
                </div>
                <div className="text-right min-w-[90px] shrink-0">
                  <div className="text-[9px] uppercase tracking-wide text-slate-500">Credits</div>
                  <div className={`text-sm font-semibold tabular-nums ${isFree ? 'text-emerald-700' : 'text-slate-900'}`}>{isFree ? 'FREE' : fmtCredits(result.initialCredits)}</div>
                  <div className="text-[10px] text-slate-500 tabular-nums">{fmtUSD(result.initialCostUSD)}</div>
                </div>
              </div>
            </div>
          ) : null}

          <CollapsibleSection title="Example Breakdown">
            <ExampleBreakdownSection item={item} adv={adv} cfg={cfg} result={result} isPipelineDriven={isPipelineDriven} />
          </CollapsibleSection>

          <CollapsibleSection title="Usage Details">
            <div className="space-y-1">
              <div><strong>Processing Rate:</strong> {item.processingRateNote}</div>
              <div><strong>Note:</strong> {item.usageNote}</div>
            </div>
          </CollapsibleSection>
        </>
      ) : null}
    </div>
  );
}

function PipelineDrivenBlock({ item, adv, rates, result, isFree }: {
  item: RateItem; adv: ReturnType<typeof useCalculatorAdvanced>; rates: RatesConfig; result: ItemResult; isFree: boolean;
}) {
  const kind: PipelineType = item.key === PIPELINE_DRIVEN_ITEM_KEYS.streaming ? 'streaming' : 'batch';
  return (
    <div className="mt-2 space-y-2">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-indigo-700 font-bold">Annual Credits (from Pipelines below)</span>
        <div className="text-right">
          <div className={`text-sm font-semibold tabular-nums ${isFree ? 'text-emerald-700' : 'text-slate-900'}`}>{isFree ? 'FREE' : fmtCredits(result.annualCredits)}</div>
          <div className="text-[10px] text-slate-500 tabular-nums">{fmtUSD(result.annualCostUSD)}</div>
        </div>
      </div>
      <PipelineSection
        type={kind} title={kind === 'batch' ? 'Batch Pipelines' : 'Streaming Pipelines'}
        pipelines={adv.state.pipelines} rates={rates} environment={adv.state.environment} overheadPct={adv.state.overheadPct}
        onAdd={adv.addPipeline} onUpdate={adv.updatePipeline} onRemove={adv.removePipeline}
      />
    </div>
  );
}

function RefreshControlledInputs({ item, adv, cfg, result, isFree }: {
  item: RateItem; adv: ReturnType<typeof useCalculatorAdvanced>; cfg: ReturnType<typeof getPhaseRefreshConfig>;
  result: ItemResult; isFree: boolean;
}) {
  const mode = adv.state.itemRefreshModes[item.key];
  const frequency = adv.state.itemFrequencies[item.key];
  const manualRuns = adv.state.itemManualRuns[item.key] ?? 12;
  const volumePerRun = adv.state.itemVolumePerRun[item.key] ?? 0;
  const availableFrequencies = cfg.frequenciesByMode[mode] ?? [];
  const volumeLabel = cfg.volumeLabelByMode[mode] ?? 'Volume per Run';
  const isStreamingMode = mode === 'streaming';

  return (
    <>
      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] uppercase font-bold tracking-wide text-sky-700">Refresh Mode</label>
          <InfoTooltip description={REFRESH_MODE_META[mode].description} docs={cfg.docs} />
        </div>
        <select
          value={mode}
          onChange={(e) => adv.setItemRefreshMode(item.key, item.phase, e.target.value as RefreshMode)}
          className="w-full border border-sky-300 bg-white rounded-md px-1.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          {cfg.modes.map((m) => <option key={m} value={m}>{REFRESH_MODE_META[m].label}</option>)}
        </select>

        {isStreamingMode ? (
          <p className="text-[10px] text-sky-700 italic">Streaming runs continuously — frequency is not applicable.</p>
        ) : (
          <>
            <label className="block text-[10px] uppercase font-bold tracking-wide text-sky-700">Run Frequency</label>
            <select
              value={frequency}
              onChange={(e) => adv.setItemFrequency(item.key, e.target.value as RunFrequency)}
              className="w-full border border-sky-300 bg-white rounded-md px-1.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {availableFrequencies.map((f) => <option key={f} value={f}>{RUN_FREQUENCY_META[f].label}</option>)}
            </select>
            {frequency === 'manual' ? (
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wide text-sky-700 mb-1">Estimated Runs / Year</label>
                <NumberSpinner value={manualRuns} onChange={(v) => adv.setItemManualRuns(item.key, v)} ariaLabel={`${item.label} — runs per year`} min={1} />
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-2">
        <label className="block text-[11px] font-medium text-slate-700 mb-1">{volumeLabel}</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <NumberSpinner value={volumePerRun} onChange={(v) => adv.setItemVolumePerRun(item.key, v)} ariaLabel={`${item.label} — ${volumeLabel}`} suffix={item.unitLabel} />
          </div>
          <div className="text-right min-w-[90px] shrink-0">
            <div className="text-[9px] uppercase tracking-wide text-slate-500">Credits / Year</div>
            <div className={`text-sm font-semibold tabular-nums ${isFree ? 'text-emerald-700' : 'text-slate-900'}`}>{isFree ? 'FREE' : fmtCredits(result.annualCredits)}</div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtUSD(result.annualCostUSD)}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function LegacyPeriodInputs({ item, adv, result, costPerCreditUSD, isFree, streamingNote }: {
  item: RateItem; adv: ReturnType<typeof useCalculatorAdvanced>; result: ItemResult; costPerCreditUSD: number; isFree: boolean; streamingNote?: string;
}) {
  const period = adv.state.legacyPeriods[item.key] ?? 'year';
  const volume = adv.state.legacyVolumes[item.key] ?? 0;
  const perPeriodCredits =
    period === 'day' ? result.dailyCredits : period === 'week' ? result.weeklyCredits : period === 'month' ? result.monthlyCredits : result.annualCredits;
  const perPeriodCost = perPeriodCredits * costPerCreditUSD;

  return (
    <>
      <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 flex items-start gap-2">
        <InfoTooltip description={streamingNote ?? 'This item runs continuously in real time.'} label="Why no refresh mode?" />
        <p className="text-[11px] text-rose-800 leading-snug">{streamingNote}</p>
      </div>
      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2 flex items-center gap-2 flex-wrap">
        <label className="text-[10px] uppercase font-bold tracking-wide text-sky-700">Input Unit</label>
        <select value={period} onChange={(e) => adv.setLegacyPeriod(item.key, e.target.value as Period)}
          className="border border-sky-300 bg-white rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400">
          <option value="day">Per Day</option>
          <option value="week">Per Week</option>
          <option value="month">Per Month</option>
          <option value="year">Per Year (default)</option>
        </select>
      </div>
      <div className="mt-2">
        <label className="block text-[11px] font-medium text-slate-700 mb-1">{item.unitLabel} {PERIOD_LABEL_PER[period]}</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <NumberSpinner value={volume} onChange={(v) => adv.setLegacyVolume(item.key, v)} ariaLabel={`${item.label} volume`} suffix={item.unitLabel} />
          </div>
          <div className="text-right min-w-[90px] shrink-0">
            <div className="text-[9px] uppercase tracking-wide text-slate-500">Credits</div>
            <div className={`text-sm font-semibold tabular-nums ${isFree ? 'text-emerald-700' : 'text-slate-900'}`}>{isFree ? 'FREE' : fmtCredits(perPeriodCredits)}</div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtUSD(perPeriodCost)}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function ExampleBreakdownSection({ item, adv, cfg, result, isPipelineDriven }: {
  item: RateItem; adv: ReturnType<typeof useCalculatorAdvanced>; cfg: ReturnType<typeof getPhaseRefreshConfig>;
  result: ItemResult; isPipelineDriven: boolean;
}) {
  if (isPipelineDriven) {
    return (
      <div className="space-y-1">
        <div>Sum of every pipeline row's (Volume per Run ÷ {item.unitDivisor.toLocaleString()}) × Rate × Runs/Year assigned to this item below.</div>
        <div>Daily credits: <strong>{fmtCredits(result.dailyCredits)}</strong><span className="text-slate-400"> · {fmtUSD(result.dailyCostUSD)}</span></div>
        <div>Monthly credits: <strong>{fmtCredits(result.monthlyCredits)}</strong><span className="text-slate-400"> · {fmtUSD(result.monthlyCostUSD)}</span></div>
        <div>Annual credits: <strong>{fmtCredits(result.annualCredits)}</strong><span className="text-slate-400"> · {fmtUSD(result.annualCostUSD)}</span></div>
      </div>
    );
  }

  const rate = item.credits[adv.state.environment] ?? 0;
  const overheadFactor = 1 + (adv.state.overheadPct || 0) / 100;
  const showOverhead = adv.state.overheadPct > 0;

  if (cfg.hasRefreshControls) {
    const mode = adv.state.itemRefreshModes[item.key];
    const frequency = adv.state.itemFrequencies[item.key];
    const manualRuns = adv.state.itemManualRuns[item.key] ?? 12;
    const isStreamingMode = mode === 'streaming';
    const runs = isStreamingMode ? 365 : runsPerYearFor(frequency, manualRuns);
    const formulaParts = [`(${item.unitLabel} ÷ ${item.unitDivisor})`, `× ${rate}`, `× ${runs.toLocaleString()} runs/yr`];
    if (showOverhead) formulaParts.push(`× ${overheadFactor.toFixed(2)}`);
    return (
      <div className="space-y-1">
        <div>Rate ({adv.state.environment}): <strong>{rate}</strong> credits per <em>{item.unit.toLowerCase()}</em></div>
        <div>Refresh Mode: <strong>{REFRESH_MODE_META[mode].label}</strong></div>
        {!isStreamingMode ? <div>Frequency: <strong>{RUN_FREQUENCY_META[frequency].label}</strong> ({runs.toLocaleString()} runs/yr)</div> : <div>Runs continuously — <strong>365</strong> day-equivalents/yr</div>}
        {showOverhead ? <div>Overhead multiplier: <strong>{overheadFactor.toFixed(2)}</strong> (from {adv.state.overheadPct}% overhead)</div> : null}
        <div>Formula: <code className="text-[11px]">{formulaParts.join(' ')}</code></div>
        <div>Daily credits: <strong>{fmtCredits(result.dailyCredits)}</strong><span className="text-slate-400"> · {fmtUSD(result.dailyCostUSD)}</span></div>
        <div>Monthly credits: <strong>{fmtCredits(result.monthlyCredits)}</strong><span className="text-slate-400"> · {fmtUSD(result.monthlyCostUSD)}</span></div>
        <div>Annual credits: <strong>{fmtCredits(result.annualCredits)}</strong><span className="text-slate-400"> · {fmtUSD(result.annualCostUSD)}</span></div>
      </div>
    );
  }

  const period = adv.state.legacyPeriods[item.key] ?? 'year';
  const multiplier = MULTIPLIER[period];
  const perPeriodCredits =
    period === 'day' ? result.dailyCredits : period === 'week' ? result.weeklyCredits : period === 'month' ? result.monthlyCredits : result.annualCredits;
  const perPeriodCost = perPeriodCredits * adv.state.costPerCreditUSD;
  const formulaParts = [`(volume ÷ ${item.unitDivisor})`, `× ${rate}`, `× ${multiplier}`];
  if (showOverhead) formulaParts.push(`× ${overheadFactor.toFixed(2)}`);
  return (
    <div className="space-y-1">
      <div>Rate ({adv.state.environment}): <strong>{rate}</strong> credits per <em>{item.unit.toLowerCase()}</em></div>
      <div>Annualizer: <strong>{multiplier}</strong><span className="text-slate-400"> ({MULTIPLIER_NOTE[period]})</span></div>
      {showOverhead ? <div>Overhead multiplier: <strong>{overheadFactor.toFixed(2)}</strong> (from {adv.state.overheadPct}% overhead)</div> : null}
      <div>Formula: <code className="text-[11px]">{formulaParts.join(' ')}</code></div>
      <div>Per-period credits ({PERIOD_WORD[period]}): <strong>{fmtCredits(perPeriodCredits)}</strong><span className="text-slate-400"> · {fmtUSD(perPeriodCost)}</span></div>
      <div>Monthly credits: <strong>{fmtCredits(result.monthlyCredits)}</strong><span className="text-slate-400"> · {fmtUSD(result.monthlyCostUSD)}</span></div>
      <div>Annual credits: <strong>{fmtCredits(result.annualCredits)}</strong><span className="text-slate-400"> · {fmtUSD(result.annualCostUSD)}</span></div>
    </div>
  );
}
