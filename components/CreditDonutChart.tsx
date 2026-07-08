"use client";
import type { CalculationResult } from "@/lib/types";
import { fmtCredits } from "@/lib/formatters";
export function CreditDonutChart({ byPhase, total }: { byPhase: CalculationResult["byPhaseIncremental"]; total: number; }) {
  const entries = Object.values(byPhase).filter(p => p.credits > 0);
  const size = 180, r = 70, cx = size / 2, cy = size / 2, stroke = 22;
  let cumulative = 0;
  const arcs = entries.map(e => {
    const frac = total > 0 ? e.credits / total : 0;
    const startAngle = cumulative * 2 * Math.PI; cumulative += frac; const endAngle = cumulative * 2 * Math.PI;
    const largeArc = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.sin(startAngle); const y1 = cy - r * Math.cos(startAngle);
    const x2 = cx + r * Math.sin(endAngle); const y2 = cy - r * Math.cos(endAngle);
    return { d: "M " + x1 + " " + y1 + " A " + r + " " + r + " 0 " + largeArc + " 1 " + x2 + " " + y2, color: e.color, label: e.label, frac };
  });
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {arcs.map((a, i) => <path key={i} d={a.d} stroke={a.color} strokeWidth={stroke} fill="none" />)}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-900 text-lg font-semibold">{fmtCredits(total)}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-500 text-[10px]">credits</text>
      </svg>
      <ul className="space-y-1.5 text-sm min-w-0 flex-1">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: a.color }} />
            <span className="text-slate-700 truncate">{a.label}</span>
            <span className="text-slate-500 text-xs ml-auto">{(a.frac * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
