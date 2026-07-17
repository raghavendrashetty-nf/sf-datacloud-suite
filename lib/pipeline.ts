import type { Environment, RatesConfig } from './types';
import type { RefreshMode, RunFrequency } from './refreshModes';
import { REFRESH_MODE_META, runsPerYearFor } from './refreshModes';

export const PIPELINE_DRIVEN_ITEM_KEYS = {
  batch: 'externalDataPipelineBatch',
  streaming: 'externalDataPipelineStreaming'
} as const;

export interface Pipeline {
  id: string;
  connectionKey: string;
  customConnectionName?: string;
  name: string;
  nameIsCustom?: boolean;
  object: string;
  volumePerRun: number;
  runMode: RefreshMode;
  frequency: RunFrequency;
  manualRunsPerYear?: number;
}

export function newPipeline(connectionKey: string, section: 'batch' | 'streaming'): Pipeline {
  return {
    id: `pl_${Math.random().toString(36).slice(2, 9)}`,
    connectionKey,
    name: '',
    nameIsCustom: false,
    object: '',
    volumePerRun: 0,
    runMode: section === 'streaming' ? 'streaming' : 'incremental',
    frequency: 'daily'
  };
}

// Auto-generated pipeline name following a "Source -> Object (Mode)" convention, e.g.
// "Salesforce CRM -> Contact (Incremental)". Regenerates live as Connection/Object/Mode
// change, until the user renames it (nameIsCustom), which pins the name in place.
export function autoPipelineName(p: Pipeline, connectionLabel: string): string {
  const object = p.object.trim() || 'All Objects';
  const modeLabel = REFRESH_MODE_META[p.runMode].label;
  return `${connectionLabel} → ${object} (${modeLabel})`;
}

export function pipelineDisplayName(p: Pipeline, connectionLabel: string): string {
  return p.nameIsCustom && p.name.trim() ? p.name.trim() : autoPipelineName(p, connectionLabel);
}

export function annualRowsForPipeline(p: Pipeline): number {
  if (p.runMode === 'streaming') return p.volumePerRun * 365;
  return p.volumePerRun * runsPerYearFor(p.frequency, p.manualRunsPerYear);
}

export interface PipelineAggregate { batchAnnualRows: number; streamingAnnualRows: number; }

export function aggregatePipelines(pipelines: Pipeline[]): PipelineAggregate {
  let batchAnnualRows = 0;
  let streamingAnnualRows = 0;
  for (const p of pipelines) {
    const annual = annualRowsForPipeline(p);
    if (p.runMode === 'streaming') streamingAnnualRows += annual;
    else batchAnnualRows += annual;
  }
  return { batchAnnualRows, streamingAnnualRows };
}

export interface PipelineBreakdown {
  annualRows: number;
  rate: number;
  annualCredits: number; monthlyCredits: number; dailyCredits: number;
  annualCostUSD: number; monthlyCostUSD: number; dailyCostUSD: number;
}

export function pipelineBreakdown(p: Pipeline, rates: RatesConfig, environment: Environment, overheadPct: number): PipelineBreakdown {
  const itemKey = p.runMode === 'streaming' ? PIPELINE_DRIVEN_ITEM_KEYS.streaming : PIPELINE_DRIVEN_ITEM_KEYS.batch;
  const item = rates.items.find((i) => i.key === itemKey);
  const rate = item?.credits[environment] ?? 0;
  const unitDivisor = item?.unitDivisor ?? 1000000;
  const overheadFactor = 1 + (overheadPct || 0) / 100;
  const annualRows = annualRowsForPipeline(p);
  const annualCredits = (annualRows / unitDivisor) * rate * overheadFactor;
  const monthlyCredits = annualCredits / 12;
  const dailyCredits = annualCredits / 365;
  const costPerCreditUSD = rates.settings.costPerCreditUSD;
  return {
    annualRows, rate,
    annualCredits, monthlyCredits, dailyCredits,
    annualCostUSD: annualCredits * costPerCreditUSD,
    monthlyCostUSD: monthlyCredits * costPerCreditUSD,
    dailyCostUSD: dailyCredits * costPerCreditUSD
  };
}

export function aggregatePipelineCredits(pipelines: Pipeline[], rates: RatesConfig, environment: Environment, overheadPct: number): number {
  return pipelines.reduce((sum, p) => sum + pipelineBreakdown(p, rates, environment, overheadPct).annualCredits, 0);
}
