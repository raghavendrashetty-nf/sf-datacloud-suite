"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { SystemSelector } from "@/components/data-readiness/SystemSelector";
import { SavedConnections } from "@/components/data-readiness/SavedConnections";
import { CredentialsForm } from "@/components/data-readiness/CredentialsForm";
import { ObjectSelector } from "@/components/data-readiness/ObjectSelector";
import { RulesBuilder } from "@/components/data-readiness/RulesBuilder";
import { AnalysisProgress } from "@/components/data-readiness/AnalysisProgress";
import { ReadinessResults } from "@/components/data-readiness/ReadinessResults";
import { BackendConsole } from "@/components/data-readiness/BackendConsole";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { useReadinessConfig } from "@/hooks/useReadinessConfig";
import { addConnection } from "@/lib/connections";
import type { SystemId, ReadinessReport, LogEntry, MetadataObject, Rule } from "@/lib/readinessTypes";
type Step = "select" | "connection" | "metadata" | "rules" | "running" | "results";
export default function Page() {
  const { config } = useReadinessConfig();
  const [step, setStep] = useState<Step>("select");
  const [systemId, setSystemId] = useState<SystemId | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [objects, setObjects] = useState<MetadataObject[]>([]);
  const [selectedObjectNames, setSelectedObjectNames] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const appendLogs = (newLogs: LogEntry[]) => setConsoleLogs(prev => [...prev, ...newLogs]);
  const rulesEligibleObjects = useMemo(() => { const set = new Set(selectedObjectNames); return objects.filter(o => set.has(o.name)); }, [objects, selectedObjectNames]);
  const fetchMetadata = async (c: Record<string, string>) => {
    setLoadingMeta(true); setStep("metadata"); setError(null);
    try {
      const resp = await fetch("/api/readiness/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemId, credentials: c }) });
      const data = await resp.json();
      if (data.logs) appendLogs(data.logs);
      if (!resp.ok) throw new Error(data?.error || "HTTP " + resp.status);
      setObjects(data.objects || []);
    } catch (e: any) { setError(e.message); setStep("connection"); }
    finally { setLoadingMeta(false); }
  };
  const runAnalysis = async (rules: Rule[]) => {
    setStep("running"); setError(null);
    try {
      const resp = await fetch("/api/readiness/duplicate-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemId, credentials: creds, options: { rules } }) });
      const data = await resp.json();
      if (data.logs) appendLogs(data.logs);
      if (!resp.ok) throw new Error(data?.error || "HTTP " + resp.status);
      setReport(data as ReadinessReport); setStep("results");
    } catch (e: any) { setError(e.message); setStep("rules"); }
  };
  const stepIdx = { select: 0, connection: 1, metadata: 2, rules: 3, running: 4, results: 5 }[step];
  const steps = ["Select System", "Connection", "Objects", "Configure Rules", "Run", "Results"];
  const clearConsole = () => setConsoleLogs([]);
  return (
    <main className="min-h-screen bg-slate-50">
      <Header title="Data Readiness Validator" subtitle="Assess source-system data quality before migration" badge="v1.3">
        <Link href="/data-readiness/settings" className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg">Settings</Link>
        {step === "results" && <ExportPDFButton targetId="readiness-report" filename={"readiness-" + systemId + "-" + Date.now() + ".pdf"} />}
      </Header>
      <div className="max-w-5xl mx-auto px-6 py-6 no-print">
        <ol className="flex items-center gap-2 mb-6 flex-wrap">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2 flex-1 min-w-[100px]">
              <span className={"w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center " + (i <= stepIdx ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500")}>{i + 1}</span>
              <span className={"text-xs " + (i === stepIdx ? "font-semibold text-slate-900" : "text-slate-500")}>{s}</span>
              {i < steps.length - 1 && <span className="flex-1 h-0.5 bg-slate-200" />}
            </li>
          ))}
        </ol>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">Error: {error}</div>}
      </div>
      <div className="max-w-5xl mx-auto px-6 pb-12 space-y-6">
        {step === "select" && <SystemSelector config={config} onPick={id => { setSystemId(id); setStep("connection"); setConsoleLogs([]); }} />}
        {step === "connection" && systemId && (
          <div className="space-y-6">
            <SavedConnections systemId={systemId} onUse={c => { setCreds(c); fetchMetadata(c); }} />
            <CredentialsForm systemId={systemId} config={config} onTestLogs={appendLogs} onSubmit={(c, saveIt, name) => { if (saveIt && name) addConnection(systemId, name, c); setCreds(c); fetchMetadata(c); }} onBack={() => setStep("select")} />
          </div>
        )}
        {step === "metadata" && systemId && <ObjectSelector systemId={systemId} config={config} objects={objects} loading={loadingMeta} onNext={objs => { setSelectedObjectNames(objs); setStep("rules"); }} onBack={() => setStep("connection")} />}
        {step === "rules" && systemId && <RulesBuilder systemId={systemId} config={config} credentials={creds} metadataObjects={rulesEligibleObjects} onRun={runAnalysis} onBack={() => setStep("metadata")} onFetchLogs={appendLogs} />}
        {step === "running" && systemId && <AnalysisProgress systemId={systemId} config={config} />}
        {step === "results" && report && (
          <div id="readiness-report">
            <ReadinessResults report={report} />
            <div className="no-print mt-6 flex justify-between">
              <button onClick={() => { setStep("select"); setSystemId(null); setReport(null); setCreds({}); setObjects([]); setSelectedObjectNames([]); setConsoleLogs([]); }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg">Start Over</button>
              <button onClick={() => setStep("rules")} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg">Re-configure Rules</button>
            </div>
          </div>
        )}
        {systemId && step !== "results" && (<div className="no-print"><BackendConsole logs={consoleLogs} title={"Live backend console - " + systemId} onClear={clearConsole} /></div>)}
      </div>
    </main>
  );
}
