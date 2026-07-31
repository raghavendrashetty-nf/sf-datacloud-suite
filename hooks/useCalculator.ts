'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculate } from '@/lib/calculator';
import type { CalculatorInputs, Environment, Period, RatesConfig } from '@/lib/types';
import { BASIC_HANDOFF_KEY, type BasicHandoff } from '@/lib/orgScanCreditEstimate';

function buildDefaultInputs(rates: RatesConfig): CalculatorInputs {
  const volumes: Record<string, number> = {};
  const initials: Record<string, number> = {};
  const periods: Record<string, Period> = {};
  for (const item of rates.items) {
    volumes[item.key] = 0; initials[item.key] = 0; periods[item.key] = 'year';
  }
  return { environment: 'Production', costPerCreditUSD: rates.settings.costPerCreditUSD, overheadPct: 0, itemVolumes: volumes, itemInitials: initials, itemPeriods: periods };
}

export function useCalculator(rates: RatesConfig) {
  const [inputs, setInputs] = useState<CalculatorInputs>(() => buildDefaultInputs(rates));
  const [justPrefilled, setJustPrefilled] = useState<BasicHandoff | null>(null);

  // One-time consume of a suggestion handed off from Org Scanner ("Refine in Basic
  // Calculator"), if present. Read via effect (not the lazy useState initializer) so it's
  // SSR-safe and consistent with this codebase's other sessionStorage/localStorage patterns.
  // justPrefilled lets the page surface a visible banner + auto-expand the affected phase -
  // without it, a prefill into a collapsed-by-default phase card is invisible on arrival.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(BASIC_HANDOFF_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(BASIC_HANDOFF_KEY);
      const handoff = JSON.parse(raw) as BasicHandoff;
      setInputs((s) => ({
        ...s,
        itemVolumes: { ...s.itemVolumes, ...handoff.itemVolumes },
        itemPeriods: { ...s.itemPeriods, ...handoff.itemPeriods }
      }));
      setJustPrefilled(handoff);
    } catch { /* malformed/absent handoff - ignore, defaults stand */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    inputs, result, justPrefilled,
    dismissPrefillBanner: () => setJustPrefilled(null),
    setEnvironment: (environment: Environment) => setInputs((s) => ({ ...s, environment })),
    setCost: (costPerCreditUSD: number) => setInputs((s) => ({ ...s, costPerCreditUSD: Math.max(0, costPerCreditUSD) })),
    setOverhead: (overheadPct: number) => setInputs((s) => ({ ...s, overheadPct: Math.max(0, overheadPct) })),
    setItemVolume: (key: string, v: number) => setInputs((s) => ({ ...s, itemVolumes: { ...s.itemVolumes, [key]: Math.max(0, v) } })),
    setItemInitial: (key: string, v: number) => setInputs((s) => ({ ...s, itemInitials: { ...s.itemInitials, [key]: Math.max(0, v) } })),
    setItemPeriod: (key: string, p: Period) => setInputs((s) => ({ ...s, itemPeriods: { ...s.itemPeriods, [key]: p } })),
    reset: () => setInputs(buildDefaultInputs(rates))
  };
}
