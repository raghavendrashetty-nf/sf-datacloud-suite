"use client";
import { useMemo, useState } from "react";
import type { SystemId, MetadataObject } from "@/lib/readinessTypes";
interface Props { systemId: SystemId; config: any; objects: MetadataObject[]; loading: boolean; onNext: (selected: string[]) => void; onBack: () => void; }
export function ObjectSelector({ systemId, config, objects, loading, onNext, onBack }: Props) {
  const cfg = config.systems[systemId];
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); if (!q) return objects; return objects.filter(o => (o.name + " " + o.label).toLowerCase().includes(q)); }, [objects, search]);
  const toggle = (name: string) => { setSelected(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); };
  const selectAll = () => setSelected(new Set(filtered.map(o => o.name)));
  const clearAll = () => setSelected(new Set());
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: cfg.color }}>{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Select objects to analyse</h2>
          <p className="text-xs text-slate-500">Fetched from {cfg.label}. Choose one or more objects.</p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">{selected.size} selected</span>
      </div>
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">
          <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <div>Fetching metadata from {cfg.label}...</div>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-3 flex-wrap">
            <input type="text" placeholder="Search objects..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            <button type="button" onClick={selectAll} className="px-3 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">Select all ({filtered.length})</button>
            <button type="button" onClick={clearAll} className="px-3 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">Clear</button>
          </div>
          <div className="border border-slate-200 rounded-lg max-h-96 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 && <div className="p-4 text-sm text-slate-500 italic">No objects match your search.</div>}
            {filtered.map(o => (
              <label key={o.name} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(o.name)} onChange={() => toggle(o.name)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{o.label}</div>
                  <div className="text-xs text-slate-500 font-mono">{o.name}{o.recordCount != null ? " - " + o.recordCount.toLocaleString() + " records" : ""}</div>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">Back</button>
        <button type="button" disabled={selected.size === 0} onClick={() => onNext(Array.from(selected))} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg">Continue with {selected.size} object(s) -&gt;</button>
      </div>
    </div>
  );
}
