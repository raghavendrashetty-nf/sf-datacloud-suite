"use client";
import { useEffect, useState } from "react";
import type { CalculatorInputs } from "@/lib/types";
import { listScenarios, saveScenario, deleteScenario, exportScenariosJSON, importScenariosJSON, type Scenario } from "@/lib/scenarios";
export function ScenariosManager({ inputs, onLoad }: { inputs: CalculatorInputs; onLoad: (i: CalculatorInputs) => void; }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { setScenarios(listScenarios()); }, []);
  const refresh = () => setScenarios(listScenarios());
  const handleSave = () => { if (!name.trim()) return; saveScenario(name.trim(), inputs); setName(""); refresh(); };
  const handleExport = () => {
    const blob = new Blob([exportScenariosJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sfdc-scenarios-" + Date.now() + ".json"; a.click(); URL.revokeObjectURL(url);
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const n = importScenariosJSON(String(r.result)); alert("Imported " + n + " scenario(s)"); refresh(); } catch (err: any) { alert("Import failed: " + err.message); } };
    r.readAsText(f); e.target.value = "";
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">💾 Scenarios</span>
          <span className="text-xs text-slate-500">({scenarios.length} saved)</span>
        </div>
        <span className="text-slate-400 text-sm">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input type="text" placeholder="Scenario name" value={name} onChange={e => setName(e.target.value)} className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">Save Current</button>
            <button onClick={handleExport} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">Export</button>
            <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg cursor-pointer transition">
              Import<input type="file" accept="application/json" onChange={handleImport} className="hidden" />
            </label>
          </div>
          {scenarios.length > 0 && (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {scenarios.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{s.name}</div>
                    <div className="text-xs text-slate-500">{new Date(s.savedAt).toLocaleString()} - {s.inputs.environment}</div>
                  </div>
                  <div className="flex gap-3 shrink-0 ml-3">
                    <button onClick={() => onLoad(s.inputs)} className="text-xs text-blue-600 hover:underline font-medium">Load</button>
                    <button onClick={() => { if (confirm("Delete " + s.name + "?")) { deleteScenario(s.id); refresh(); } }} className="text-xs text-red-600 hover:underline font-medium">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
