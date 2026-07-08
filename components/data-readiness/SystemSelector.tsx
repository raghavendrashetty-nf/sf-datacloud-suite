"use client";
import type { SystemId } from "@/lib/readinessTypes";
export function SystemSelector({ config, onPick }: { config: any; onPick: (id: SystemId) => void }) {
  const systems = Object.values(config.systems) as any[];
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Which system do you want to analyse?</h2>
      <p className="text-sm text-slate-600 mb-6">Connect using your credentials, sample records, and score readiness.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {systems.map(s => (
          <button key={s.id} onClick={() => onPick(s.id as SystemId)} className="text-left rounded-2xl bg-white border-2 border-slate-200 hover:border-emerald-500 hover:shadow-md p-6 transition">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm mb-4" style={{ background: s.color }}>{s.icon}</div>
            <div className="text-lg font-semibold text-slate-900">{s.label}</div>
            <div className="text-xs text-slate-500 mt-2 leading-relaxed">{s.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
