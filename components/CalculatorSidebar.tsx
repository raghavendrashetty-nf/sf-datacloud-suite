'use client';

import type { CalculationResult, CalculatorInputs, Environment, RatesConfig } from '@/lib/types';
import NumberSpinner from './NumberSpinner';
import ExportPDFButton from './ExportPDFButton';
import { RefObject } from 'react';

interface Props {
  environment: Environment; costPerCreditUSD: number; overheadPct: number;
  setEnvironment: (e: Environment) => void; setCost: (n: number) => void; setOverhead: (n: number) => void;
  reset: () => void; onOpenRateManager: () => void; rateSheetUrl: string;
  rates: RatesConfig; inputs: CalculatorInputs; result: CalculationResult; chartsRef: RefObject<HTMLElement>;
}

export default function CalculatorSidebar({ environment, costPerCreditUSD, overheadPct, setEnvironment, setCost, setOverhead, reset, onOpenRateManager, rateSheetUrl, rates, inputs, result, chartsRef }: Props) {
  return (
    <aside className="no-print space-y-3">
      <div className="card p-3 space-y-3">
        <h2 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">Calculator Controls</h2>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Environment</label>
          <div role="radiogroup" className="grid grid-cols-2 bg-slate-100 rounded-lg p-0.5">
            {(['Production', 'Sandbox'] as Environment[]).map((env) => (
              <button key={env} role="radio" aria-checked={environment === env} onClick={() => setEnvironment(env)}
                className={`px-1 py-1 text-xs rounded-md transition-colors ${environment === env ? 'bg-white shadow text-slate-900 font-medium' : 'text-slate-600 hover:text-slate-900'}`}>
                {env}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Cost / Credit ($)</label>
          <input type="number" min={0} step="0.001" value={costPerCreditUSD}
            onChange={(e) => setCost(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs text-right" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Overhead %</label>
          <NumberSpinner value={overheadPct} onChange={setOverhead} ariaLabel="Overhead percentage" suffix="%" />
        </div>
      </div>
      <div className="card p-3 space-y-2">
        <h2 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">Rate Sheet</h2>
        <a href={rateSheetUrl} target="_blank" rel="noreferrer"
          className="w-full inline-flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium py-1.5 px-2 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M14 3h7v7" /><path d="M10 14L21 3" />
            <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
          </svg>
          View Rate Sheet PDF
        </a>
        <button type="button" onClick={onOpenRateManager} className="w-full btn-ghost text-xs py-1.5 px-2">Manage Rate Sheet</button>
      </div>
      <div className="card p-3 space-y-2">
        <h2 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">Export & Reset</h2>
        <ExportPDFButton rates={rates} inputs={inputs} result={result} chartsRef={chartsRef} />
        <button type="button" onClick={reset}
          className="w-full text-xs text-slate-500 hover:text-rose-600 underline underline-offset-2">
          Reset all values
        </button>
      </div>
    </aside>
  );
}
