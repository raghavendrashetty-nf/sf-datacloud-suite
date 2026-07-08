"use client";
import { useState } from "react";
import type { SystemId, MetadataObject, FieldMetadata, LogEntry, Rule } from "@/lib/readinessTypes";
interface Props { systemId: SystemId; config: any; credentials: Record<string, string>; metadataObjects: MetadataObject[]; onRun: (rules: Rule[]) => void; onBack: () => void; onFetchLogs?: (logs: LogEntry[]) => void; }
function newRule(threshold: number): Rule {
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 8);
  return { id, type: "duplicate", object: "", field: "", threshold };
}
export function RulesBuilder({ systemId, config, credentials, metadataObjects, onRun, onBack, onFetchLogs }: Props) {
  const cfg = config.systems[systemId];
  const dup = config.checks.duplicateCheck;
  const [rules, setRules] = useState<Rule[]>(() => [newRule(dup.defaultThreshold)]);
  const [fieldsCache, setFieldsCache] = useState<Record<string, FieldMetadata[]>>({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<Record<string, string>>({});
  const fetchFields = async (objectName: string) => {
    if (fieldsCache[objectName] || loadingFields.has(objectName)) return;
    setLoadingFields(prev => { const n = new Set(prev); n.add(objectName); return n; });
    setFetchError(prev => { const { [objectName]: _drop, ...rest } = prev; return rest; });
    try {
      const r = await fetch("/api/readiness/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemId, credentials, object: objectName }) });
      const d = await r.json();
      if (onFetchLogs && d.logs) onFetchLogs(d.logs);
      if (!r.ok) throw new Error(d?.error || "HTTP " + r.status);
      setFieldsCache(prev => ({ ...prev, [objectName]: d.fields || [] }));
    } catch (e: any) { setFetchError(prev => ({ ...prev, [objectName]: e.message })); }
    finally { setLoadingFields(prev => { const n = new Set(prev); n.delete(objectName); return n; }); }
  };
  const updateRule = (id: string, patch: Partial<Rule>) => { setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)); };
  const onObjectChange = (id: string, objectName: string) => { updateRule(id, { object: objectName, field: "" }); if (objectName) fetchFields(objectName); };
  const addRule = () => setRules(prev => [...prev, newRule(dup.defaultThreshold)]);
  const deleteRule = (id: string) => setRules(prev => prev.filter(r => r.id !== id));
  const canRun = rules.length > 0 && rules.every(r => r.object && r.field);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: cfg.color }}>{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Configure {cfg.label} checks</h2>
          <p className="text-xs text-slate-500">{dup.description}</p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">{rules.length} rule{rules.length === 1 ? "" : "s"}</span>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left">Validation To Run</th>
              <th className="px-3 py-2 text-left">Object</th>
              <th className="px-3 py-2 text-left">Field</th>
              <th className="px-3 py-2 text-left w-24">Threshold %</th>
              <th className="px-3 py-2 text-center w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, idx) => {
              const fields = fieldsCache[rule.object];
              const isLoading = loadingFields.has(rule.object);
              const errMsg = fetchError[rule.object];
              return (
                <tr key={rule.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-500 font-mono text-xs">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <select value={rule.type} disabled className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm bg-slate-50">
                      <option value="duplicate">Duplicate Check</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select value={rule.object} onChange={e => onObjectChange(rule.id, e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none">
                      <option value="">-- Select object --</option>
                      {metadataObjects.map(o => <option key={o.name} value={o.name}>{o.label} ({o.name})</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {rule.object === "" ? (
                      <div className="text-xs text-slate-400 italic">Pick an object first</div>
                    ) : isLoading ? (
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className="inline-block w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></span>
                        Loading fields...
                      </div>
                    ) : errMsg ? (
                      <div className="text-xs text-red-600">Error: {errMsg} <button type="button" onClick={() => fetchFields(rule.object)} className="underline">retry</button></div>
                    ) : (
                      <select value={rule.field} onChange={e => updateRule(rule.id, { field: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none">
                        <option value="">-- Select field --</option>
                        {(fields || []).map(f => <option key={f.name} value={f.name}>{f.label} ({f.name})</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.1" min={0} max={100} value={rule.threshold} onChange={e => updateRule(rule.id, { threshold: Number(e.target.value) })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-right" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button type="button" disabled={rules.length === 1} onClick={() => deleteRule(rule.id)} className="text-xs text-red-600 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <button type="button" onClick={addRule} className="px-3 py-1.5 text-sm border border-dashed border-slate-300 text-slate-600 hover:border-emerald-500 hover:text-emerald-700 rounded-lg">+ Add Rule</button>
      </div>
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">Back</button>
        <button type="button" disabled={!canRun} onClick={() => onRun(rules)} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg">Run {rules.length} Rule{rules.length === 1 ? "" : "s"} -&gt;</button>
      </div>
    </div>
  );
}
