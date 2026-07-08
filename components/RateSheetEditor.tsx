"use client";
import { useState } from "react";
import { useRates } from "@/hooks/useRates";
export function RateSheetEditor() {
  const { rates, save, reset } = useRates();
  const [draft, setDraft] = useState<any>(JSON.parse(JSON.stringify(rates)));
  const items = Object.entries(draft.rateSheet) as [string, any][];
  const updateItem = (key: string, patch: Partial<any>) => setDraft({ ...draft, rateSheet: { ...draft.rateSheet, [key]: { ...draft.rateSheet[key], ...patch } } });
  const updateCredit = (key: string, env: string, val: number) => updateItem(key, { credits: { ...draft.rateSheet[key].credits, [env]: val } });
  const commit = () => { save(draft); alert("Rate config saved."); };
  const doReset = () => { if (confirm("Reset to defaults?")) { reset(); location.reload(); } };
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Global Settings</h2>
            <p className="text-xs text-slate-500 mt-1">Change base $/credit, environment multipliers, days-per-year.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={doReset} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Reset to Defaults</button>
            <button onClick={commit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Save Changes</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="block"><span className="text-xs font-medium text-slate-600">Cost per Flex Credit (USD)</span>
            <input type="number" step="0.0001" value={draft.flexCredit.costPerCreditUSD} onChange={e => setDraft({ ...draft, flexCredit: { ...draft.flexCredit, costPerCreditUSD: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block"><span className="text-xs font-medium text-slate-600">Production Multiplier</span>
            <input type="number" step="0.01" value={draft.environments.Production.globalMultiplier} onChange={e => setDraft({ ...draft, environments: { ...draft.environments, Production: { ...draft.environments.Production, globalMultiplier: Number(e.target.value) } } })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block"><span className="text-xs font-medium text-slate-600">Sandbox Multiplier</span>
            <input type="number" step="0.01" value={draft.environments.Sandbox.globalMultiplier} onChange={e => setDraft({ ...draft, environments: { ...draft.environments, Sandbox: { ...draft.environments.Sandbox, globalMultiplier: Number(e.target.value) } } })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block"><span className="text-xs font-medium text-slate-600">Days per Year</span>
            <input type="number" value={draft.assumptions.daysPerYear} onChange={e => setDraft({ ...draft, assumptions: { ...draft.assumptions, daysPerYear: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Rate Sheet Items ({items.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Label</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-right">Prod Credits</th>
                <th className="px-4 py-3 text-right">SBX Credits</th>
                <th className="px-4 py-3 text-center">Initial</th>
                <th className="px-4 py-3 text-center">Incremental</th>
              </tr>
            </thead>
            <tbody>
              {items.map(([key, r]) => (
                <tr key={key} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2"><input type="text" value={r.label} onChange={e => updateItem(key, { label: e.target.value })} className="w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-sm" /></td>
                  <td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">{r.unit}</td>
                  <td className="px-4 py-2"><input type="number" value={r.credits.Production} onChange={e => updateCredit(key, "Production", Number(e.target.value))} className="w-24 text-right rounded-md border border-slate-200 px-2 py-1 text-sm" /></td>
                  <td className="px-4 py-2"><input type="number" value={r.credits.Sandbox} onChange={e => updateCredit(key, "Sandbox", Number(e.target.value))} className="w-24 text-right rounded-md border border-slate-200 px-2 py-1 text-sm" /></td>
                  <td className="px-4 py-2 text-center"><input type="checkbox" checked={!!r.applicableToInitialLoad} onChange={e => updateItem(key, { applicableToInitialLoad: e.target.checked })} /></td>
                  <td className="px-4 py-2 text-center"><input type="checkbox" checked={r.applicableToIncremental !== false} onChange={e => updateItem(key, { applicableToIncremental: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
