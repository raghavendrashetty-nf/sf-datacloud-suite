"use client";
import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@/lib/readinessTypes";
const LEVEL_STYLE: Record<string, string> = { info: "text-slate-300", http: "text-cyan-300", soql: "text-purple-300", warn: "text-amber-300", error: "text-red-400" };
const LEVEL_LABEL: Record<string, string> = { info: "INFO ", http: "HTTP ", soql: "SOQL ", warn: "WARN ", error: "ERROR" };
export function BackendConsole({ logs, title = "Backend Console", onClear }: { logs: LogEntry[]; title?: string; onClear?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showData, setShowData] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [logs.length]);
  const copyAll = () => {
    const text = logs.map(l => "[" + l.ts + "] " + LEVEL_LABEL[l.level] + " " + l.message + (l.data ? "  " + JSON.stringify(l.data) : "")).join("\n");
    navigator.clipboard.writeText(text);
  };
  return (
    <div className="rounded-2xl bg-slate-950 border border-slate-800 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
          <span className="text-xs text-slate-400 font-mono">{title} - {logs.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={showData} onChange={e => setShowData(e.target.checked)} /> data
          </label>
          <button onClick={copyAll} className="text-xs text-slate-400 hover:text-white px-2">Copy</button>
          {onClear && <button onClick={onClear} className="text-xs text-slate-400 hover:text-white px-2">Clear</button>}
          <button onClick={() => setCollapsed(!collapsed)} className="text-xs text-slate-400 hover:text-white px-2">{collapsed ? "Expand" : "Collapse"}</button>
        </div>
      </div>
      {!collapsed && (
        <div ref={bodyRef} className="max-h-80 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
          {logs.length === 0 && <div className="text-slate-600 italic">Waiting for backend activity...</div>}
          {logs.map((l, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span className="text-slate-600 shrink-0">{l.ts.slice(11, 23)}</span>
              <span className={LEVEL_STYLE[l.level] + " font-semibold shrink-0"}>{LEVEL_LABEL[l.level]}</span>
              <div className="min-w-0 flex-1">
                <span className="text-slate-200 break-all">{l.message}</span>
                {showData && l.data && (<pre className="mt-0.5 text-slate-500 whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(l.data)}</pre>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
