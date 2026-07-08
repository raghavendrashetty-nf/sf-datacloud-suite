"use client";
import type { CalculationResult } from "@/lib/types";
import { fmtCredits, fmtUSD } from "@/lib/formatters";
export function PhaseBreakdown({ byPhase }: { byPhase: CalculationResult["byPhaseIncremental"]; }) {
  const maxCredits = Math.max(...Object.values(byPhase).map(p => p.credits), 1);
  return (
    <div className="space-y-3">
      {Object.entries(byPhase).map(([id, p]) => (
        <div key={id}>
          <div className="flex justify-between text-sm">
            <span className="font-medium text-slate-700">{p.label}</span>
            <span className="text-slate-600">{fmtCredits(p.credits)} - {fmtUSD(p.costUSD)}</span>
          </div>
          <div className="mt-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: ((p.credits/maxCredits)*100) + "%", background: p.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
