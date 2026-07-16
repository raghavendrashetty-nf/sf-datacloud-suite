'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import CalculatorSidebar from '@/components/CalculatorSidebar';
import ResultsSummary from '@/components/ResultsSummary';
import ItemCard from '@/components/ItemCard';
import BackToTopButton from '@/components/BackToTopButton';
import RateSheetManager from '@/components/RateSheetManager';
import { useRates } from '@/hooks/useRates';
import { useCalculator } from '@/hooks/useCalculator';
import { PHASES } from '@/components/PhaseTheme';
import type { RateItem } from '@/lib/types';

function ChevronDown({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function CreditCalculatorPage() {
  const { rates, setRates, resetRates } = useRates();
  const { inputs, result, setEnvironment, setCost, setOverhead, setItemVolume, setItemInitial, setItemPeriod, reset } = useCalculator(rates);
  const [rateManagerOpen, setRateManagerOpen] = useState(false);
  const chartsRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => {
    const map: Record<string, RateItem[]> = {};
    for (const item of rates.items) {
      if (!map[item.phase]) map[item.phase] = [];
      map[item.phase].push(item);
    }
    return map;
  }, [rates.items]);

  const orderedPhaseKeys = useMemo(() => {
    const known = PHASES.map((p) => p.key as string);
    const extras: string[] = [];
    for (const item of rates.items) {
      if (!known.includes(item.phase) && !extras.includes(item.phase)) extras.push(item.phase);
    }
    return [...known, ...extras];
  }, [rates.items]);

  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setExpandedPhases((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of orderedPhaseKeys) {
        if (!(key in next)) { next[key] = false; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [orderedPhaseKeys]);

  function togglePhase(key: string) { setExpandedPhases((prev) => ({ ...prev, [key]: !prev[key] })); }
  function setAllPhases(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const key of orderedPhaseKeys) next[key] = open;
    setExpandedPhases(next);
  }

  return (
    <main className="min-h-screen">
      <Header />
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">Credit Consumption Calculator — Basic</h1>
            <span className="chip bg-sky-100 text-sky-700 font-semibold">Simple</span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Discovery-phase estimate based on the Salesforce Data Cloud Platform Services rate sheet.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Rate source: <a href={rates.meta.url} target="_blank" rel="noreferrer" className="underline">{rates.meta.source}</a>
            {' · '}Need Refresh Mode &amp; Pipeline-level modeling?{' '}
            <Link href="/credit-calculator/advanced" className="underline text-indigo-600 hover:text-indigo-800">Try the Advanced Calculator</Link>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-2 lg:sticky lg:top-20 lg:self-start">
            <CalculatorSidebar
              environment={inputs.environment} costPerCreditUSD={inputs.costPerCreditUSD} overheadPct={inputs.overheadPct}
              setEnvironment={setEnvironment} setCost={setCost} setOverhead={setOverhead} reset={reset}
              onOpenRateManager={() => setRateManagerOpen(true)} rateSheetUrl={rates.meta.url}
              rates={rates} inputs={inputs} result={result} chartsRef={chartsRef}
            />
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-2">Rate Item Phases</span>
              <button type="button" onClick={() => setAllPhases(true)} className="text-xs text-sky-600 hover:text-sky-800 hover:underline">Expand all</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => setAllPhases(false)} className="text-xs text-slate-500 hover:text-slate-900 hover:underline">Collapse all</button>
              <span className="ml-auto text-[11px] text-slate-500 italic">All phases collapsed by default</span>
            </div>

            {orderedPhaseKeys.map((phaseKey) => {
              const items = grouped[phaseKey] ?? [];
              if (items.length === 0) return null;
              const known = PHASES.find((p) => p.key === phaseKey);
              const label = known?.label ?? phaseKey;
              const order = known?.order;
              const color = known?.color ?? 'slate';
              const isOpen = expandedPhases[phaseKey] === true;
              return (
                <section key={phaseKey} className="card overflow-hidden">
                  <button type="button" onClick={() => togglePhase(phaseKey)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left" aria-expanded={isOpen}>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    <span className={`chip bg-${color}-100 text-${color}-700`}>{order ? `Phase ${order}` : 'Custom Phase'}</span>
                    <h2 className="text-lg font-semibold text-slate-900 flex-1">{label}</h2>
                    <span className="text-xs text-slate-500">{items.length} item{items.length === 1 ? '' : 's'}</span>
                  </button>
                  {isOpen ? (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
                        {items.map((item) => (
                          <ItemCard key={item.key} item={item} environment={inputs.environment}
                            itemPeriod={inputs.itemPeriods[item.key] ?? 'year'}
                            volume={inputs.itemVolumes[item.key] ?? 0} initial={inputs.itemInitials[item.key] ?? 0}
                            overheadPct={inputs.overheadPct} costPerCreditUSD={inputs.costPerCreditUSD}
                            result={result.perItem[item.key]}
                            onVolumeChange={(v) => setItemVolume(item.key, v)}
                            onInitialChange={(v) => setItemInitial(item.key, v)}
                            onPeriodChange={(p) => setItemPeriod(item.key, p)} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

      <div className="lg:col-span-3 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 lg:z-30" ref={chartsRef}>
        <ResultsSummary result={result} />
      </div>
        </div>
      </div>

      {rateManagerOpen ? (
        <RateSheetManager rates={rates} onSave={setRates} onReset={resetRates} onClose={() => setRateManagerOpen(false)} />
      ) : null}
      <BackToTopButton />
    </main>
  );
}
