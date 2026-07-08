"use client";
import { Tooltip, type RateInfo } from "./Tooltip";
interface Option { value: string; label: string }
interface Props { label: string; value: string; onChange: (v: string) => void; options: Option[]; tooltip?: string; rate?: RateInfo; }
export function SelectInput({ label, value, onChange, options, tooltip, rate }: Props) {
  return (
    <label className="block">
      <span className="flex items-center text-sm font-medium text-slate-700">{label}{(tooltip || rate) && <Tooltip text={tooltip} rate={rate} />}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
