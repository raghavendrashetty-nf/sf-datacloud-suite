'use client';

import { useCallback, useEffect, useState } from 'react';
import defaults from '@/config/salesforceRatesDefault.json';
import type { RatesConfig } from '@/lib/types';

export const RATES_OVERRIDE_KEY = 'sfdc.rates.override.v4.2';

function readOverlay(): Partial<RatesConfig> | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(RATES_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function mergeOverlay(base: RatesConfig, overlay: Partial<RatesConfig> | null): RatesConfig {
  if (!overlay) return base;
  return {
    meta: { ...base.meta, ...(overlay.meta ?? {}) },
    settings: { ...base.settings, ...(overlay.settings ?? {}) },
    items: Array.isArray(overlay.items) && overlay.items.length > 0 ? overlay.items : base.items
  };
}

export function useRates() {
  const [rates, setRatesState] = useState<RatesConfig>(defaults as RatesConfig);

  useEffect(() => {
    const overlay = readOverlay();
    if (overlay) setRatesState(mergeOverlay(defaults as RatesConfig, overlay));
  }, []);

  const setRates = useCallback((next: RatesConfig) => {
    setRatesState(next);
    try { window.localStorage.setItem(RATES_OVERRIDE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const resetRates = useCallback(() => {
    try { window.localStorage.removeItem(RATES_OVERRIDE_KEY); } catch {}
    setRatesState(defaults as RatesConfig);
  }, []);

  return { rates, setRates, resetRates };
}
