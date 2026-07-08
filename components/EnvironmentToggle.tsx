"use client";
import type { EnvironmentId } from "@/lib/types";
export function EnvironmentToggle({ value, onChange }: { value: EnvironmentId; onChange: (v: EnvironmentId) => void }) {
  const opts: EnvironmentId[] = ["Production", "Sandbox"];
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
      {opts.map(o => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={"px-4 py-1.5 rounded-md text-sm font-medium transition " + (value === o ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700")}>
          {o}
        </button>
      ))}
    </div>
  );
}
