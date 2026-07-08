"use client";
import { useCallback, useEffect, useState } from "react";
import defaultRates from "@/config/salesforceRatesDefault.json";
import type { RatesConfig } from "@/lib/calculator";
const KEY = "sfdc.rates.override.v1";
export function useRates() {
  const [rates, setRates] = useState<RatesConfig>(defaultRates as any);
  useEffect(() => { if (typeof window === "undefined") return; try { const raw = localStorage.getItem(KEY); if (raw) setRates(JSON.parse(raw)); } catch {} }, []);
  const save = useCallback((next: RatesConfig) => { setRates(next); localStorage.setItem(KEY, JSON.stringify(next)); }, []);
  const reset = useCallback(() => { setRates(defaultRates as any); localStorage.removeItem(KEY); }, []);
  return { rates, save, reset };
}
