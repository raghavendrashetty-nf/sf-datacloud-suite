"use client";
import { useEffect, useState } from "react";
import type { SystemId } from "@/lib/readinessTypes";
const STEPS = [
  { pct: 10, label: "Authenticating..." },
  { pct: 25, label: "Preparing rule set..." },
  { pct: 45, label: "Counting records..." },
  { pct: 65, label: "Computing distinct values..." },
  { pct: 85, label: "Scoring duplicate rate..." },
  { pct: 100, label: "Building report..." }
];
export function AnalysisProgress({ systemId, config }: { systemId: SystemId; config: any }) {
  const cfg = config.systems[systemId];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => Math.min(x + 1, STEPS.length - 1)), 1400); return () => clearInterval(t); }, []);
  const cur = STEPS[i];
  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-10 shadow-sm text-center">
      <div className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-white font-bold mb-4" style={{ background: cfg.color }}>{cfg.icon}</div>
      <h2 className="text-lg font-semibold text-slate-900">Analysing {cfg.label}</h2>
      <p className="text-sm text-slate-500 mt-1">Please keep this tab open.</p>
      <div className="mt-8 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: cur.pct + "%" }} />
      </div>
      <div className="mt-3 text-sm font-medium text-slate-700">{cur.label}</div>
      <div className="mt-2 text-xs text-slate-400">{cur.pct}% - Step {i + 1} of {STEPS.length}</div>
    </div>
  );
}
