'use client';

import { useEffect, useMemo, useState } from 'react';
import defaults from '@/config/flexCreditsRatesDefault.json';
import { calculateFlexCredits, type FlexCalculatorInputs, type FlexRatesConfig } from '@/lib/flexCreditsCalculator';
import type { Environment, Period } from '@/lib/types';

export const FLEX_HANDOFF_KEY = 'sfdc.flexCredits.suggestedInputs.v1';

export interface FlexHandoff { itemKey: string; volume: number; period: Period; note: string; }

export function useFlexCredits() {
  const rates = defaults as FlexRatesConfig;
  const [environment, setEnvironment] = useState<Environment>('Production');
  // $0.005/credit is not an officially published Flex Credits rate (none exists - it's set per
  // Order Form) - defaulted here to match Credit-Based Consumption's rate sheet as a working
  // starting assumption, per explicit request. Still fully editable; UI notes the provenance.
  const [costPerCreditUSD, setCostPerCreditUSD] = useState<number | null>(0.005);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [periods, setPeriods] = useState<Record<string, Period>>({});
  const [justPrefilled, setJustPrefilled] = useState<FlexHandoff | null>(null);

  // One-time consume of a suggestion handed off from Org Scanner ("Refine in Flex Credits"), if
  // present - same pattern as the Credit-Based Consumption handoffs in useCalculator.ts.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(FLEX_HANDOFF_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(FLEX_HANDOFF_KEY);
      const handoff = JSON.parse(raw) as FlexHandoff;
      setVolumes((v) => ({ ...v, [handoff.itemKey]: handoff.volume }));
      setPeriods((p) => ({ ...p, [handoff.itemKey]: handoff.period }));
      setJustPrefilled(handoff);
    } catch { /* malformed/absent handoff - ignore, defaults stand */ }
  }, []);

  const inputs: FlexCalculatorInputs = useMemo(() => ({ environment, costPerCreditUSD, volumes, periods }), [environment, costPerCreditUSD, volumes, periods]);
  const result = useMemo(() => calculateFlexCredits(inputs, rates), [inputs, rates]);

  return {
    rates, inputs, result,
    environment, setEnvironment,
    costPerCreditUSD, setCostPerCreditUSD,
    volumes, periods,
    setVolume: (key: string, v: number) => setVolumes((s) => ({ ...s, [key]: Math.max(0, v) })),
    setPeriod: (key: string, p: Period) => setPeriods((s) => ({ ...s, [key]: p })),
    justPrefilled, dismissPrefillBanner: () => setJustPrefilled(null),
    reset: () => { setVolumes({}); setPeriods({}); setCostPerCreditUSD(0.005); setEnvironment('Production'); }
  };
}
