"use client";
import type { ReadinessReport } from "@/lib/readinessTypes";
import { useReadinessConfig } from "@/hooks/useReadinessConfig";
import { BackendConsole } from "./BackendConsole";
function scoreColor(s: number) { if (s >= 80) return "#10B981"; if (s >= 60) return "#F59E0B"; return "#EF4444"; }
function statusBadge(status: string) { const map: any = { pass: "bg-emerald-50 text-emerald-700 border-emerald-200", warn: "bg-amber-50 text-amber-700 border-amber-200", fail: "bg-red-50 text-red-700 border-red-200" }; return map[status] || map.warn; }
export function ReadinessResults({ report }: { report: ReadinessReport }) {
  const { config } = useReadinessConfig();
  const cfg = config.systems[report.system];
  const color = scoreColor(report.overallScore);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold" style={{ background: cfg.color }}>{cfg.icon}</div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Readiness Report</div>
              <div className="text-xl font-semibold text-slate-900">{cfg.label}</div>
              {report.connectedAs && <div className="text-xs text-slate-500 mt-0.5">Connected as {report.connectedAs} - {new Date(report.connectedAt).toLocaleString()}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold" style={{ color }}>{report.overallScore}<span className="text-xl text-slate-400">/100</span></div>
            <div className="text-sm font-semibold mt-1" style={{ color }}>{report.overallRating}</div>
          </div>
        </div>
      </div>

      {report.objectResults && report.objectResults.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Rule Results ({report.objectResults.length})</h3>
          <p className="text-xs text-slate-500 mb-4">Excess = nonNullRecords - uniqueValues. Salesforce uses COUNT_DISTINCT (exact); Zendesk and SharePoint use sampling.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Object</th>
                  <th className="pb-2 font-medium">Field</th>
                  <th className="pb-2 font-medium text-right">Records</th>
                  <th className="pb-2 font-medium text-right">Non-null</th>
                  <th className="pb-2 font-medium text-right">Unique</th>
                  <th className="pb-2 font-medium text-right">Excess</th>
                  <th className="pb-2 font-medium text-right">Dup %</th>
                  <th className="pb-2 font-medium text-right">Score</th>
                  <th className="pb-2 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.objectResults.map(o => (
                  <tr key={o.ruleId} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-800 font-mono text-xs">{o.object}</td>
                    <td className="py-2 text-slate-600 font-mono text-xs">{o.field}</td>
                    <td className="py-2 text-right text-slate-700">{o.totalRecords.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-700">{o.nonNullRecords.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-700">{o.uniqueValues != null ? o.uniqueValues.toLocaleString() : "-"}</td>
                    <td className="py-2 text-right text-slate-700">{o.duplicateRows.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-700">{(o.duplicateRate * 100).toFixed(2)}%</td>
                    <td className="py-2 text-right font-semibold" style={{ color: scoreColor(o.score) }}>{o.score}</td>
                    <td className="py-2 text-center"><span className={"text-xs px-2 py-0.5 rounded border " + statusBadge(o.status)}>{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Checks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.checks.map(c => (
            <div key={c.key} className={"rounded-xl border p-4 " + statusBadge(c.status)}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{c.label}</div>
                <div className="text-lg font-bold">{c.score}<span className="text-xs opacity-60">/100</span></div>
              </div>
              <div className="text-xs mt-1 opacity-80">{c.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Recommendations</h3>
        <ul className="space-y-2">
          {report.recommendations.map((r, i) => (
            <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-emerald-500">-&gt;</span>{r}</li>
          ))}
        </ul>
      </div>

      {report.logs && report.logs.length > 0 && (
        <BackendConsole logs={report.logs} title="Backend trace - full run" />
      )}
    </div>
  );
}
