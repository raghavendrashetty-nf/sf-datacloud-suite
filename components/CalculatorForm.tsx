"use client";
import { EnvironmentToggle } from "./EnvironmentToggle";
import { NumberInput } from "./NumberInput";
import type { CalculatorInputs, EnvironmentId } from "@/lib/types";
import type { RatesConfig } from "@/lib/calculator";
import type { RateInfo } from "./Tooltip";

interface Props { inputs: CalculatorInputs; update: <K extends keyof CalculatorInputs>(k: K, v: CalculatorInputs[K]) => void; reset: () => void; rates: RatesConfig; }

function Section({ title, step, children }: { title: string; step?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        {step && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{step}</span>}
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

export function CalculatorForm({ inputs, update, reset, rates }: Props) {
  const rateInfo = (key: string): RateInfo | undefined => {
    const r = rates.rateSheet[key]; if (!r) return undefined;
    return { prodCredits: r.credits.Production, sbxCredits: r.credits.Sandbox, unit: r.unit };
  };
  const tt = (key: string) => rates.rateSheet[key]?.tooltip;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Environment</h3>
          <p className="text-xs text-slate-500 mt-1">Sandbox applies a {Math.round((1 - rates.environments.Sandbox.globalMultiplier) * 100)}% discount vs Production.</p>
        </div>
        <div className="flex items-center gap-3">
          <EnvironmentToggle value={inputs.environment} onChange={v => update("environment", v as EnvironmentId)} />
          <button type="button" onClick={reset} className="text-xs text-slate-500 hover:text-slate-800 underline">Reset</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Cost Modelling</h3>
            <p className="text-xs text-slate-500 mt-1">Split one-time Initial Load cost from ongoing Incremental annual cost.</p>
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => update("splitInitialLoad", false)} className={"px-4 py-1.5 rounded-md text-sm font-medium transition " + (!inputs.splitInitialLoad ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700")}>Incremental Only</button>
            <button type="button" onClick={() => update("splitInitialLoad", true)} className={"px-4 py-1.5 rounded-md text-sm font-medium transition " + (inputs.splitInitialLoad ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700")}>Initial + Incremental</button>
          </div>
        </div>
      </div>

      {inputs.splitInitialLoad && (
        <Section step="Initial" title="Initial Load Volumes (one-time)">
          <NumberInput label="Initial Internal rows" value={inputs.initialInternalRows} onChange={v => update("initialInternalRows", v)} step={100000} suffix="rows" tooltip={tt("internalDataPipeline")} rate={rateInfo("internalDataPipeline")} />
          <NumberInput label="Initial External Batch rows" value={inputs.initialExternalBatchRows} onChange={v => update("initialExternalBatchRows", v)} step={100000} suffix="rows" tooltip={tt("externalBatchIngestion")} rate={rateInfo("externalBatchIngestion")} />
          <NumberInput label="Initial Unstructured (MB)" value={inputs.initialUnstructuredMB} onChange={v => update("initialUnstructuredMB", v)} step={1000} suffix="MB" tooltip={tt("unstructuredDataProcessed")} rate={rateInfo("unstructuredDataProcessed")} />
          <NumberInput label="Initial Private Connect (GB)" value={inputs.initialPrivateConnectGB} onChange={v => update("initialPrivateConnectGB", v)} step={1} suffix="GB" tooltip={tt("privateConnectGB")} rate={rateInfo("privateConnectGB")} />
          <NumberInput label="Initial Unified Profiles" value={inputs.initialUnifiedProfiles} onChange={v => update("initialUnifiedProfiles", v)} step={100000} suffix="profiles" tooltip={tt("profileUnification")} rate={rateInfo("profileUnification")} />
          <NumberInput label="Initial Inferences" value={inputs.initialInferences} onChange={v => update("initialInferences", v)} step={10000} suffix="inferences" tooltip={tt("inferences")} rate={rateInfo("inferences")} />
        </Section>
      )}

      <Section step="Step 1" title="Data Ingestion (Incremental)">
        <NumberInput label="Number of Pipelines" value={inputs.pipelines} onChange={v => update("pipelines", v)} tooltip="Multiplier for Internal + External ingestion volumes." />
        <NumberInput label="Internal rows/day" value={inputs.internalIngestionRowsPerDay} onChange={v => update("internalIngestionRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("internalDataPipeline")} rate={rateInfo("internalDataPipeline")} />
        <NumberInput label="External Batch rows/day (per pipeline)" value={inputs.externalBatchRowsPerDay} onChange={v => update("externalBatchRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("externalBatchIngestion")} rate={rateInfo("externalBatchIngestion")} />
        <NumberInput label="External Streaming rows/day (per pipeline)" value={inputs.externalStreamingRowsPerDay} onChange={v => update("externalStreamingRowsPerDay", v)} step={100} suffix="rows/day" tooltip={tt("externalStreamingIngestion")} rate={rateInfo("externalStreamingIngestion")} />
        <NumberInput label="Batch Transform rows/day" value={inputs.batchTransformRowsPerDay} onChange={v => update("batchTransformRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("batchDataTransforms")} rate={rateInfo("batchDataTransforms")} />
        <NumberInput label="Streaming Transform rows/day" value={inputs.streamingTransformRowsPerDay} onChange={v => update("streamingTransformRowsPerDay", v)} step={100} suffix="rows/day" tooltip={tt("streamingDataTransforms")} rate={rateInfo("streamingDataTransforms")} />
        <NumberInput label="Unstructured Data MB/day" value={inputs.unstructuredMBPerDay} onChange={v => update("unstructuredMBPerDay", v)} step={100} suffix="MB/day" tooltip={tt("unstructuredDataProcessed")} rate={rateInfo("unstructuredDataProcessed")} />
        <NumberInput label="Data Federation rows/day" value={inputs.dataFederationRowsPerDay} onChange={v => update("dataFederationRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("dataFederationRows")} rate={rateInfo("dataFederationRows")} />
        <NumberInput label="Data Share rows/day" value={inputs.dataShareRowsPerDay} onChange={v => update("dataShareRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("dataShareRowsOut")} rate={rateInfo("dataShareRowsOut")} />
        <NumberInput label="Private Connect GB/day" value={inputs.privateConnectGBPerDay} onChange={v => update("privateConnectGBPerDay", v)} step={1} suffix="GB/day" tooltip={tt("privateConnectGB")} rate={rateInfo("privateConnectGB")} />
      </Section>

      <Section step="Step 2" title="Harmonization & Identity">
        <NumberInput label="Unified Profiles (incremental daily)" value={inputs.unifiedProfiles} onChange={v => update("unifiedProfiles", v)} step={10000} suffix="profiles" tooltip={tt("profileUnification")} rate={rateInfo("profileUnification")} />
        <NumberInput label="Match & Reconciliation Rules" value={inputs.matchRules} onChange={v => update("matchRules", v)} tooltip={tt("matchReconRules")} rate={rateInfo("matchReconRules")} />
        <NumberInput label="Identity Resolution Runs/day" value={inputs.profileUnificationRunsPerDay} onChange={v => update("profileUnificationRunsPerDay", v)} step={0.1} tooltip="How often identity resolution runs. 0.14 = weekly, 1 = daily." />
      </Section>

      <Section step="Step 3" title="Real-Time Processing">
        <NumberInput label="Real-Time Events/day" value={inputs.realtimeEventsPerDay} onChange={v => update("realtimeEventsPerDay", v)} step={1000} suffix="events/day" tooltip={tt("realtimeEvents")} rate={rateInfo("realtimeEvents")} />
      </Section>

      <Section step="Step 4" title="Insights & Analytics">
        <NumberInput label="Calculated Insights - Batch (count)" value={inputs.calcInsightsBatchCount} onChange={v => update("calcInsightsBatchCount", v)} tooltip={tt("calculatedInsightsBatch")} rate={rateInfo("calculatedInsightsBatch")} />
        <NumberInput label="Batch CI Runs/day" value={inputs.calcInsightsBatchRunsPerDay} onChange={v => update("calcInsightsBatchRunsPerDay", v)} tooltip="How often each batch CI executes per day. 4 = every 6 hours." />
        <NumberInput label="Calculated Insights - Streaming (count)" value={inputs.calcInsightsStreamingCount} onChange={v => update("calcInsightsStreamingCount", v)} tooltip={tt("calculatedInsightsStreaming")} rate={rateInfo("calculatedInsightsStreaming")} />
        <NumberInput label="AI/ML Inferences/day" value={inputs.inferencesPerDay} onChange={v => update("inferencesPerDay", v)} step={100} suffix="inferences/day" tooltip={tt("inferences")} rate={rateInfo("inferences")} />
      </Section>

      <Section step="Step 5" title="Act (Queries & Actions)">
        <NumberInput label="Data Queries rows/day" value={inputs.dataQueriesRowsPerDay} onChange={v => update("dataQueriesRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("dataQueries")} rate={rateInfo("dataQueries")} />
        <NumberInput label="Streaming Actions rows/day" value={inputs.streamingActionsRowsPerDay} onChange={v => update("streamingActionsRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("streamingActions")} rate={rateInfo("streamingActions")} />
      </Section>

      <Section step="Step 6" title="Segmentation & Activation">
        <NumberInput label="Segment Rows Processed / day" value={inputs.segmentRowsPerDay} onChange={v => update("segmentRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("segmentRowsProcessed")} rate={rateInfo("segmentRowsProcessed")} />
        <NumberInput label="Batch Activation rows / day" value={inputs.batchActivationRowsPerDay} onChange={v => update("batchActivationRowsPerDay", v)} step={10000} suffix="rows/day" tooltip={tt("batchActivation")} rate={rateInfo("batchActivation")} />
        <NumberInput label="Streaming Activation rows / day" value={inputs.streamingActivationRowsPerDay} onChange={v => update("streamingActivationRowsPerDay", v)} step={1000} suffix="rows/day" tooltip={tt("streamingActivation")} rate={rateInfo("streamingActivation")} />
      </Section>

      <Section title="Advanced">
        <NumberInput label="Operational Overhead %" value={Math.round(inputs.overheadPct * 100)} onChange={v => update("overheadPct", v / 100)} step={1} suffix="%" tooltip="Buffer for reruns and retries." />
      </Section>
    </div>
  );
}
