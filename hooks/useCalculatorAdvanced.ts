'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculate } from '@/lib/calculator';
import type { CalculatorInputs, Environment, Period, RatesConfig } from '@/lib/types';
import {
  DEFAULT_MANUAL_RUNS_PER_YEAR, getPhaseRefreshConfig, runsPerYearFor,
  type RefreshMode, type RunFrequency
} from '@/lib/refreshModes';
import {
  aggregatePipelines, annualRowsForPipeline, newPipeline,
  PIPELINE_DRIVEN_ITEM_KEYS, type Pipeline
} from '@/lib/pipeline';

interface AdvancedState {
  environment: Environment;
  costPerCreditUSD: number;
  overheadPct: number;
  itemInitials: Record<string, number>;
  itemVolumePerRun: Record<string, number>;
  itemRefreshModes: Record<string, RefreshMode>;
  itemFrequencies: Record<string, RunFrequency>;
  itemManualRuns: Record<string, number>;
  legacyVolumes: Record<string, number>;
  legacyPeriods: Record<string, Period>;
  pipelines: Pipeline[];
}

function buildDefaultState(rates: RatesConfig): AdvancedState {
  const itemInitials: Record<string, number> = {};
  const itemVolumePerRun: Record<string, number> = {};
  const itemRefreshModes: Record<string, RefreshMode> = {};
  const itemFrequencies: Record<string, RunFrequency> = {};
  const itemManualRuns: Record<string, number> = {};
  const legacyVolumes: Record<string, number> = {};
  const legacyPeriods: Record<string, Period> = {};

  for (const item of rates.items) {
    itemInitials[item.key] = 0;
    const cfg = getPhaseRefreshConfig(item.phase);
    if (cfg.hasRefreshControls) {
      const defaultMode = cfg.modes[0];
      itemRefreshModes[item.key] = defaultMode;
      const freqs = cfg.frequenciesByMode[defaultMode] ?? [];
      itemFrequencies[item.key] = freqs[0] ?? 'daily';
      itemVolumePerRun[item.key] = 0;
      itemManualRuns[item.key] = DEFAULT_MANUAL_RUNS_PER_YEAR;
    } else {
      legacyVolumes[item.key] = 0;
      legacyPeriods[item.key] = 'year';
    }
  }

  return {
    environment: 'Production', costPerCreditUSD: rates.settings.costPerCreditUSD, overheadPct: 0,
    itemInitials, itemVolumePerRun, itemRefreshModes, itemFrequencies, itemManualRuns,
    legacyVolumes, legacyPeriods, pipelines: []
  };
}

function deriveInputs(state: AdvancedState, rates: RatesConfig): CalculatorInputs {
  const itemVolumes: Record<string, number> = {};
  const itemPeriods: Record<string, Period> = {};
  const pipelineAgg = aggregatePipelines(state.pipelines);

  for (const item of rates.items) {
    if (item.key === PIPELINE_DRIVEN_ITEM_KEYS.batch) {
      itemVolumes[item.key] = pipelineAgg.batchAnnualRows;
      itemPeriods[item.key] = 'year';
      continue;
    }
    if (item.key === PIPELINE_DRIVEN_ITEM_KEYS.streaming) {
      itemVolumes[item.key] = pipelineAgg.streamingAnnualRows;
      itemPeriods[item.key] = 'year';
      continue;
    }
    const cfg = getPhaseRefreshConfig(item.phase);
    if (cfg.hasRefreshControls) {
      const volumePerRun = state.itemVolumePerRun[item.key] ?? 0;
      const mode = state.itemRefreshModes[item.key];
      const freq = state.itemFrequencies[item.key];
      const runs = mode === 'streaming' ? 365 : runsPerYearFor(freq, state.itemManualRuns[item.key]);
      itemVolumes[item.key] = volumePerRun * runs;
      itemPeriods[item.key] = 'year';
    } else {
      itemVolumes[item.key] = state.legacyVolumes[item.key] ?? 0;
      itemPeriods[item.key] = state.legacyPeriods[item.key] ?? 'year';
    }
  }

  return {
    environment: state.environment, costPerCreditUSD: state.costPerCreditUSD, overheadPct: state.overheadPct,
    itemVolumes, itemInitials: state.itemInitials, itemPeriods
  };
}

export function useCalculatorAdvanced(rates: RatesConfig) {
  const [state, setState] = useState<AdvancedState>(() => buildDefaultState(rates));

  useEffect(() => {
    setState((s) => {
      const known = new Set(rates.items.map((i) => i.key));
      const fresh = buildDefaultState(rates);
      const merge = <T,>(existing: Record<string, T>, defaults: Record<string, T>) => {
        const next: Record<string, T> = {};
        for (const k of Object.keys(defaults)) next[k] = k in existing ? existing[k] : defaults[k];
        return next;
      };
      return {
        ...s,
        itemInitials: merge(s.itemInitials, fresh.itemInitials),
        itemVolumePerRun: merge(s.itemVolumePerRun, fresh.itemVolumePerRun),
        itemRefreshModes: merge(s.itemRefreshModes, fresh.itemRefreshModes),
        itemFrequencies: merge(s.itemFrequencies, fresh.itemFrequencies),
        itemManualRuns: merge(s.itemManualRuns, fresh.itemManualRuns),
        legacyVolumes: merge(s.legacyVolumes, fresh.legacyVolumes),
        legacyPeriods: merge(s.legacyPeriods, fresh.legacyPeriods),
        pipelines: s.pipelines.filter(() => known.size > 0)
      };
    });
  }, [rates.items]);

  const inputs = useMemo(() => deriveInputs(state, rates), [state, rates]);
  const result = useMemo(() => calculate(inputs, rates), [inputs, rates]);
  const pipelineAgg = useMemo(() => aggregatePipelines(state.pipelines), [state.pipelines]);

  return {
    state, inputs, result, pipelineAgg,

    setEnvironment: (environment: Environment) => setState((s) => ({ ...s, environment })),
    setCost: (costPerCreditUSD: number) => setState((s) => ({ ...s, costPerCreditUSD: Math.max(0, costPerCreditUSD) })),
    setOverhead: (overheadPct: number) => setState((s) => ({ ...s, overheadPct: Math.max(0, overheadPct) })),

    setItemInitial: (key: string, v: number) => setState((s) => ({ ...s, itemInitials: { ...s.itemInitials, [key]: Math.max(0, v) } })),
    setItemVolumePerRun: (key: string, v: number) => setState((s) => ({ ...s, itemVolumePerRun: { ...s.itemVolumePerRun, [key]: Math.max(0, v) } })),
    setItemRefreshMode: (key: string, phase: string, mode: RefreshMode) => setState((s) => {
      const cfg = getPhaseRefreshConfig(phase);
      const freqs = cfg.frequenciesByMode[mode] ?? [];
      return {
        ...s,
        itemRefreshModes: { ...s.itemRefreshModes, [key]: mode },
        itemFrequencies: { ...s.itemFrequencies, [key]: freqs[0] ?? s.itemFrequencies[key] }
      };
    }),
    setItemFrequency: (key: string, freq: RunFrequency) => setState((s) => ({ ...s, itemFrequencies: { ...s.itemFrequencies, [key]: freq } })),
    setItemManualRuns: (key: string, v: number) => setState((s) => ({ ...s, itemManualRuns: { ...s.itemManualRuns, [key]: Math.max(1, v) } })),

    setLegacyVolume: (key: string, v: number) => setState((s) => ({ ...s, legacyVolumes: { ...s.legacyVolumes, [key]: Math.max(0, v) } })),
    setLegacyPeriod: (key: string, p: Period) => setState((s) => ({ ...s, legacyPeriods: { ...s.legacyPeriods, [key]: p } })),

    addPipeline: (connectionKey: string, section: 'batch' | 'streaming') => setState((s) => ({ ...s, pipelines: [...s.pipelines, newPipeline(connectionKey, section)] })),
    updatePipeline: (id: string, patch: Partial<Pipeline>) => setState((s) => ({ ...s, pipelines: s.pipelines.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    removePipeline: (id: string) => setState((s) => ({ ...s, pipelines: s.pipelines.filter((p) => p.id !== id) })),
    annualRowsForPipeline,

    reset: () => setState(buildDefaultState(rates))
  };
}
