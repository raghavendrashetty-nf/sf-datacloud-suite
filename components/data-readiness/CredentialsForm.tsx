"use client";
import { useState } from "react";
import type { SystemId, CredentialField, LogEntry } from "@/lib/readinessTypes";
interface Props { systemId: SystemId; config: any; onSubmit: (c: Record<string, string>, save: boolean, name: string) => void; onBack: () => void; onTestLogs?: (logs: LogEntry[]) => void; }
export function CredentialsForm({ systemId, config, onSubmit, onBack, onTestLogs }: Props) {
  const cfg = config.systems[systemId];
  const [values, setValues] = useState<Record<string, string>>(() => { const init: Record<string, string> = {}; cfg.credentialFields.forEach((f: CredentialField) => { if (f.default) init[f.key] = f.default; }); return init; });
  const [showPwd, setShowPwd] = useState<Record<string, boolean>>({});
  const [saveIt, setSaveIt] = useState(false);
  const [name, setName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const set = (k: string, v: string) => setValues(p => ({ ...p, [k]: v }));
  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch("/api/readiness/test-connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemId, credentials: values }) });
      const d = await r.json();
      if (onTestLogs && d.logs) onTestLogs(d.logs);
      setTestResult({ ok: !!d.ok, message: d.ok ? d.message : (d.error || "Failed") });
    } catch (e: any) { setTestResult({ ok: false, message: e.message }); }
    finally { setTesting(false); }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = cfg.credentialFields.filter((f: CredentialField) => f.required && !values[f.key]?.trim());
    if (missing.length) { alert("Fill: " + missing.map((m: CredentialField) => m.label).join(", ")); return; }
    if (saveIt && !name.trim()) { alert("Provide a name for this saved connection."); return; }
    onSubmit(values, saveIt, name);
  };
  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: cfg.color }}>{cfg.icon}</div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{cfg.label} credentials</h2>
          <p className="text-xs text-slate-500">Credentials are proxied through the Next.js server. If you check Save, they are stored in browser localStorage only.</p>
        </div>
      </div>
      <div className="space-y-4">
        {cfg.credentialFields.map((f: CredentialField) => (
          <label key={f.key} className="block">
            <span className="text-sm font-medium text-slate-700">{f.label}{f.required && <span className="text-red-500">*</span>}</span>
            <div className="relative">
              <input type={f.type === "password" && showPwd[f.key] ? "text" : f.type} placeholder={f.placeholder} value={values[f.key] || ""} onChange={e => set(f.key, e.target.value)} autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none pr-16" />
              {f.type === "password" && (<button type="button" onClick={() => setShowPwd(p => ({ ...p, [f.key]: !p[f.key] }))} className="absolute right-2 top-2 text-xs text-slate-500 hover:text-slate-800 px-2 py-1">{showPwd[f.key] ? "Hide" : "Show"}</button>)}
            </div>
            {f.helper && <span className="mt-1 block text-xs text-slate-500">{f.helper}</span>}
          </label>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={saveIt} onChange={e => setSaveIt(e.target.checked)} /> Save this connection</label>
        {saveIt && <input type="text" placeholder="Connection name" value={name} onChange={e => setName(e.target.value)} className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm" />}
      </div>
      {testResult && (<div className={"mt-3 rounded-md px-3 py-2 text-sm border " + (testResult.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800")}>{testResult.ok ? "Connected: " : "Failed: "}{testResult.message}</div>)}
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">Back</button>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={test} disabled={testing} className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg disabled:opacity-60">{testing ? "Testing..." : "Test Connection"}</button>
          <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg">Continue -&gt;</button>
        </div>
      </div>
    </form>
  );
}
