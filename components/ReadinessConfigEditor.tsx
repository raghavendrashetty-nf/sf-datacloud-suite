"use client";
import { useState } from "react";
import { useReadinessConfig } from "@/hooks/useReadinessConfig";
export function ReadinessConfigEditor() {
  const { config, save, reset } = useReadinessConfig();
  const [draft, setDraft] = useState<any>(JSON.parse(JSON.stringify(config)));
  const commit = () => { save(draft); alert("Readiness config saved."); };
  const doReset = () => { if (confirm("Reset to defaults?")) { reset(); location.reload(); } };
  const setDup = (patch: any) => setDraft({ ...draft, checks: { ...draft.checks, duplicateCheck: { ...draft.checks.duplicateCheck, ...patch } } });
  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <button onClick={doReset} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg">Reset</button>
        <button onClick={commit} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Save Changes</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Duplicate Check Defaults</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block"><span className="text-xs font-medium text-slate-600">Enabled</span>
            <div className="mt-2"><input type="checkbox" checked={draft.checks.duplicateCheck.enabled} onChange={e => setDup({ enabled: e.target.checked })} /></div>
          </label>
          <label className="block"><span className="text-xs font-medium text-slate-600">Default Threshold (%)</span>
            <input type="number" value={draft.checks.duplicateCheck.defaultThreshold} onChange={e => setDup({ defaultThreshold: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block"><span className="text-xs font-medium text-slate-600">Description</span>
            <input type="text" value={draft.checks.duplicateCheck.description} onChange={e => setDup({ description: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>
      </div>
      {Object.keys(draft.systems).map((sysId: string) => {
        const s = draft.systems[sysId];
        const setSys = (patch: any) => setDraft({ ...draft, systems: { ...draft.systems, [sysId]: { ...s, ...patch } } });
        return (
          <div key={sysId} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: s.color }}>{s.icon}</div>
              <h2 className="text-lg font-semibold text-slate-900">{s.label}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block"><span className="text-xs font-medium text-slate-600">Description</span>
                <input type="text" value={s.description} onChange={e => setSys({ description: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block"><span className="text-xs font-medium text-slate-600">Brand Colour</span>
                <input type="text" value={s.color} onChange={e => setSys({ color: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block"><span className="text-xs font-medium text-slate-600">Icon</span>
                <input type="text" value={s.icon} onChange={e => setSys({ icon: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
