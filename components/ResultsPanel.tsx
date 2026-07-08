"use client";
import type { CalculationResult, CalculatorInputs } from "@/lib/types";
import type { RatesConfig } from "@/lib/calculator";
import { CreditDonutChart } from "./CreditDonutChart";
import { PhaseBreakdown } from "./PhaseBreakdown";
import { fmtUSD, fmtCredits } from "@/lib/formatters";
export function ResultsPanel({ result, inputs, rates }: { result: CalculationResult; inputs: CalculatorInputs; rates: RatesConfig; }) {
  const { totals, byPhaseInitial, byPhaseIncremental, lineItems } = result;
  const split = inputs.splitInitialLoad;
  return (
    <div className="sticky top-6 space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-6 shadow-lg">
        <div className="text-xs uppercase tracking-wider text-slate-300">Grand Total Cost</div>
        <div className="text-4xl font-bold mt-1">{fmtUSD(totals.grandTotalCostUSD)}</div>
        <div className="mt-1 text-sm text-slate-300">{split ? "Initial + First-Year Annual" : "First-Year Annual (Incremental only)"}</div>
        <div className="mt-4 pt-4 border-t border-slate-600 space-y-2 text-sm">
          {split && (
            <div className="flex justify-between"><span className="text-slate-400">Initial (one-time)</span><span className="font-semibold">{fmtUSD(totals.initialCostUSD)} <span className="text-xs text-slate-400">({fmtCredits(totals.initialCredits)} cr)</span></span></div>
          )}
          <div className="flex justify-between"><span className="text-slate-400">Incremental / year</span><span className="font-semibold">{fmtUSD(totals.incrementalCostPerYearUSD)} <span className="text-xs text-slate-400">({fmtCredits(totals.incrementalCreditsPerYear)} cr)</span></span></div>
          <div className="flex justify-between"><span className="text-slate-400">Incremental / month</span><span className="font-semibold">{fmtUSD(totals.monthlyIncrementalCostUSD)}</span></div>
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-700 text-xs">
            <div><div className="text-slate-400">$/Credit</div><div className="font-semibold">${rates.flexCredit.costPerCreditUSD}</div></div>
            <div><div className="text-slate-400">Environment</div><div className="font-semibold">{inputs.environment}</div></div>
            <div><div className="text-slate-400">Overhead</div><div className="font-semibold">{Math.round(inputs.overheadPct * 100)}%</div></div>
          </div>
        </div>
      </div>

      {split && totals.initialCredits > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Initial Load Consumption</h3>
          <CreditDonutChart byPhase={byPhaseInitial} total={totals.initialCredits} />
          <div className="mt-5"><PhaseBreakdown byPhase={byPhaseInitial} /></div>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">{split ? "Annual Incremental Consumption" : "Annual Consumption"}</h3>
        <CreditDonutChart byPhase={byPhaseIncremental} total={totals.incrementalCreditsPerYear} />
        <div className="mt-5"><PhaseBreakdown byPhase={byPhaseIncremental} /></div>
      </div>

      <details className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
        <summary className="text-sm font-semibold text-slate-900 cursor-pointer select-none">Line-item breakdown ({lineItems.filter(l => l.initialCredits > 0 || l.incrementalCreditsPerYear > 0).length} active)</summary>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-medium">Item</th>
                {split && <th className="pb-2 font-medium text-right">Init Credits</th>}
                {split && <th className="pb-2 font-medium text-right">Init $</th>}
                <th className="pb-2 font-medium text-right">Incr Credits/yr</th>
                <th className="pb-2 font-medium text-right">Incr $/yr</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map(li => (
                <tr key={li.key} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-700">{li.label}{!li.applicableToInitialLoad && split && <span className="ml-1 text-[10px] text-slate-400">(incr only)</span>}</td>
                  {split && <td className="py-1.5 text-right text-slate-600">{fmtCredits(li.initialCredits)}</td>}
                  {split && <td className="py-1.5 text-right text-slate-900 font-medium">{fmtUSD(li.initialCostUSD)}</td>}
                  <td className="py-1.5 text-right text-slate-600">{fmtCredits(li.incrementalCreditsPerYear)}</td>
                  <td className="py-1.5 text-right text-slate-900 font-medium">{fmtUSD(li.incrementalCostPerYearUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
