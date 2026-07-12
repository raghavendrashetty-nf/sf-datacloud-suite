'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculate } from '@/lib/calculator';
import type { CalculatorInputs, Environment, Period, RatesConfig } from '@/lib/types';

function buildDefaultInputs(rates: RatesConfig): CalculatorInputs {
  const volumes: Record<string, number> = {};
  const initials: Record<string, number> = {};
  const periods: Record<string, Period> = {};
  for (const item of rates.items) {
    volumes[item.key] = 0;
    initials[item.key] = 0;
    periods[item.key] = 'year';
  }
  return {
    environment: 'Production',
    costPerCreditUSD: rates.settings.costPerCreditUSD,
    overheadPct: 0,
    itemVolumes: volumes,
    itemInitials: initials,
    itemPeriods: periods
  };
}

export function useCalculator(rates: RatesConfig) {
  const [inputs, setInputs] = useState<CalculatorInputs>(() => buildDefaultInputs(rates));

  useEffect(() => {
    setInputs((s) => {
      const volumes = { ...s.itemVolumes };
      const initials = { ...s.itemInitials };
      const periods = { ...s.itemPeriods };
      const knownKeys = new Set(rates.items.map((i) => i.key));
      for (const item of rates.items) {
        if (!(item.key in volumes)) volumes[item.key] = 0;
        if (!(item.key in initials)) initials[item.key] = 0;
        if (!(item.key in periods)) periods[item.key] = 'year';
      }
      for (const k of Object.keys(volumes)) if (!knownKeys.has(k)) delete volumes[k];
      for (const k of Object.keys(initials)) if (!knownKeys.has(k)) delete initials[k];
      for (const k of Object.keys(periods)) if (!knownKeys.has(k)) delete periods[k];
      return { ...s, itemVolumes: volumes, itemInitials: initials, itemPeriods: periods };
    });
  }, [rates.items]);

  const result = useMemo(() => calculate(inputs, rates), [inputs, rates]);

  return {
    inputs, result,
    setEnvironment: (environment: Environment) => setInputs((s) => ({ ...s, environment })),
    setCost: (costPerCreditUSD: number) =>
      setInputs((s) => ({ ...s, costPerCreditUSD: Math.max(0, costPerCreditUSD) })),
    setOverhead: (overheadPct: number) =>
      setInputs((s) => ({ ...s, overheadPct: Math.max(0, overheadPct) })),
    setItemVolume: (key: string, v: number) =>
      setInputs((s) => ({ ...s, itemVolumes: { ...s.itemVolumes, [key]: Math.max(0, v) } })),
    setItemInitial: (key: string, v: number) =>
      setInputs((s) => ({ ...s, itemInitials: { ...s.itemInitials, [key]: Math.max(0, v) } })),
    setItemPeriod: (key: string, p: Period) =>
      setInputs((s) => ({ ...s, itemPeriods: { ...s.itemPeriods, [key]: p } })),
    reset: () => setInputs(buildDefaultInputs(rates)),
    setAll: (next: CalculatorInputs) => setInputs(next)
  };
}
