"use client";
import { Tooltip, type RateInfo } from "./Tooltip";
interface Props { label: string; value: number; onChange: (v: number) => void; tooltip?: string; rate?: RateInfo; min?: number; step?: number; suffix?: string; }
export function NumberInput({ label, value, onChange, tooltip, rate, min = 0, step = 1, suffix }: Props) {
  return (
    <label className="block">
      <span className="flex items-center text-sm font-medium text-slate-700">{label}{(tooltip || rate) && <Tooltip text={tooltip} rate={rate} />}</span>
      <div className="mt-1 relative">
        <input type="number" min={min} step={step} value={Number.isFinite(value) ? value : 0} onChange={e => onChange(Number(e.target.value) || 0)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition bg-white" />
        {suffix && (<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{suffix}</span>)}
      </div>
    </label>
  );
}
