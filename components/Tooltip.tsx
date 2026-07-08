"use client";
import { useState } from "react";
export interface RateInfo { prodCredits: number; sbxCredits: number; unit: string; }
export function Tooltip({ text, rate }: { text?: string; rate?: RateInfo }) {
  const [open, setOpen] = useState(false);
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
  return (
    <span className="relative inline-flex ml-1.5 align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span tabIndex={0} className="w-4 h-4 rounded-full border border-slate-400 text-slate-500 text-[10px] flex items-center justify-center cursor-help font-semibold" aria-label={text || ""}>i</span>
      {open && (
        <span role="tooltip" className="absolute z-30 left-6 top-1/2 -translate-y-1/2 w-72 p-2 rounded-md bg-slate-900 text-white text-xs shadow-lg leading-snug">
          {text && <span className="block">{text}</span>}
          {rate && (
            <span className="mt-2 pt-2 block border-t border-slate-700 font-mono text-[10px]">
              <span className="text-emerald-300">Rate:</span> {fmt(rate.prodCredits)} cr <span className="text-slate-400">(Prod)</span>{" - "}{fmt(rate.sbxCredits)} cr <span className="text-slate-400">(SBX)</span>
              <span className="block text-slate-400 mt-0.5">{rate.unit}</span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
