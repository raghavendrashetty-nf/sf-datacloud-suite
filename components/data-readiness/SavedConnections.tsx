"use client";
import { useEffect, useState } from "react";
import type { SystemId } from "@/lib/readinessTypes";
import { listConnectionsBySystem, deleteConnection, mask, type Connection } from "@/lib/connections";
export function SavedConnections({ systemId, onUse }: { systemId: SystemId; onUse: (c: Record<string, string>) => void }) {
  const [list, setList] = useState<Connection[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  useEffect(() => { setList(listConnectionsBySystem(systemId)); }, [systemId]);
  const refresh = () => setList(listConnectionsBySystem(systemId));
  const test = async (c: Connection) => {
    setTesting(c.id); setTestResult(p => ({ ...p, [c.id]: { ok: false, message: "Testing..." } }));
    try {
      const r = await fetch("/api/readiness/test-connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemId, credentials: c.credentials }) });
      const d = await r.json();
      setTestResult(p => ({ ...p, [c.id]: { ok: !!d.ok, message: d.ok ? d.message : (d.error || "Failed") } }));
    } catch (e: any) { setTestResult(p => ({ ...p, [c.id]: { ok: false, message: e.message } })); }
    finally { setTesting(null); }
  };
  if (list.length === 0) return null;
  const SECRETS = ["password","apiToken","clientSecret","securityToken"];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Saved Connections</h3>
        <span className="text-xs text-slate-500">{list.length} saved</span>
      </div>
      <div className="divide-y divide-slate-100">
        {list.map(c => (
          <div key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800">{c.name}</div>
              <div className="text-xs text-slate-500">{new Date(c.savedAt).toLocaleString()}</div>
              <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(c.credentials).map(([k, v]) => (
                  <span key={k}><span className="text-slate-400">{k}:</span> {SECRETS.includes(k) ? mask(v) : v}</span>
                ))}
              </div>
              {testResult[c.id] && (<div className={"mt-1 text-xs " + (testResult[c.id].ok ? "text-emerald-600" : "text-red-600")}>{testResult[c.id].message}</div>)}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => test(c)} disabled={testing === c.id} className="text-xs px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-60">{testing === c.id ? "Testing..." : "Test"}</button>
              <button onClick={() => onUse(c.credentials)} className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md">Use</button>
              <button onClick={() => { if (confirm("Delete " + c.name + "?")) { deleteConnection(c.id); refresh(); } }} className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-md hover:bg-red-50">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
