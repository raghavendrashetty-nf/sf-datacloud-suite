import type { CalculatorInputs, CalculationResult, PhaseId, LineItemResult, EnvironmentId } from "./types";
export interface RatesConfig {
  meta: any;
  flexCredit: { costPerCreditUSD: number };
  environments: Record<string, { globalMultiplier: number }>;
  frequencyPresets: Record<string, { runsPerDay: number; isContinuous?: boolean; label?: string }>;
  phases: Record<string, { label: string; color: string; order: number }>;
  rateSheet: Record<string, any>;
  assumptions: { daysPerYear: number };
}
function annualIncr(u: number, c: number, d: number, r: number, days: number) { if (!u || !c) return 0; return (u/d)*c*r*days; }
function initialCr(u: number, c: number, d: number) { if (!u || !c) return 0; return (u/d)*c; }
export function calculate(inputs: CalculatorInputs, rates: RatesConfig): CalculationResult {
  const env = inputs.environment as EnvironmentId;
  const envMul = rates.environments[env].globalMultiplier;
  const usd = rates.flexCredit.costPerCreditUSD;
  const rs = rates.rateSheet;
  const DAYS = rates.assumptions.daysPerYear;
  const pipelines = Math.max(1, inputs.pipelines);
  const overhead = 1 + (inputs.overheadPct ?? 0);
  const items: LineItemResult[] = [];
  const push = (key: string, initUnits: number, incrPerDay: number, runs = 1, labelOverride?: string) => {
    const r = rs[key]; if (!r) return;
    const initC = r.applicableToInitialLoad ? initialCr(initUnits, r.credits[env], r.unitDivisor) : 0;
    const incrC = r.applicableToIncremental !== false ? annualIncr(incrPerDay, r.credits[env], r.unitDivisor, runs, DAYS) : 0;
    const fInitC = initC * envMul * overhead;
    const fIncrC = incrC * envMul * overhead;
    items.push({ key, label: labelOverride || r.label, phase: r.phase as PhaseId, unit: r.unit,
      initialCredits: fInitC, initialCostUSD: fInitC * usd,
      incrementalCreditsPerYear: fIncrC, incrementalCostPerYearUSD: fIncrC * usd,
      applicableToInitialLoad: !!r.applicableToInitialLoad });
  };
  push("internalDataPipeline", inputs.initialInternalRows * pipelines, inputs.internalIngestionRowsPerDay * pipelines);
  push("externalBatchIngestion", inputs.initialExternalBatchRows * pipelines, inputs.externalBatchRowsPerDay * pipelines);
  push("externalStreamingIngestion", 0, inputs.externalStreamingRowsPerDay * pipelines);
  push("batchDataTransforms", inputs.initialExternalBatchRows * pipelines, inputs.batchTransformRowsPerDay);
  push("streamingDataTransforms", 0, inputs.streamingTransformRowsPerDay);
  push("unstructuredDataProcessed", inputs.initialUnstructuredMB, inputs.unstructuredMBPerDay);
  push("dataFederationRows", 0, inputs.dataFederationRowsPerDay);
  push("dataShareRowsOut", 0, inputs.dataShareRowsPerDay);
  push("privateConnectGB", inputs.initialPrivateConnectGB, inputs.privateConnectGBPerDay);
  push("profileUnification", inputs.initialUnifiedProfiles, inputs.unifiedProfiles, inputs.profileUnificationRunsPerDay);
  push("matchReconRules", inputs.matchRules * inputs.initialUnifiedProfiles, inputs.matchRules * inputs.unifiedProfiles, inputs.profileUnificationRunsPerDay, "Match & Reconciliation Rules (" + inputs.matchRules + " rules)");
  push("realtimeEvents", 0, inputs.realtimeEventsPerDay);
  push("calculatedInsightsBatch", inputs.initialUnifiedProfiles * inputs.calcInsightsBatchCount, inputs.unifiedProfiles * inputs.calcInsightsBatchCount, inputs.calcInsightsBatchRunsPerDay, "Calculated Insights - Batch x " + inputs.calcInsightsBatchCount);
  push("calculatedInsightsStreaming", 0, inputs.externalStreamingRowsPerDay * inputs.calcInsightsStreamingCount);
  push("inferences", inputs.initialInferences, inputs.inferencesPerDay);
  push("dataQueries", 0, inputs.dataQueriesRowsPerDay);
  push("streamingActions", 0, inputs.streamingActionsRowsPerDay);
  push("segmentRowsProcessed", 0, inputs.segmentRowsPerDay);
  push("batchActivation", 0, inputs.batchActivationRowsPerDay);
  push("streamingActivation", 0, inputs.streamingActivationRowsPerDay);
  const emptyByPhase = () => {
    const out = {} as Record<PhaseId, { credits: number; costUSD: number; label: string; color: string }>;
    (Object.keys(rates.phases) as PhaseId[]).forEach(p => { const m = rates.phases[p]; out[p] = { credits: 0, costUSD: 0, label: m.label, color: m.color }; });
    return out;
  };
  const byPhaseInitial = emptyByPhase();
  const byPhaseIncremental = emptyByPhase();
  items.forEach(i => {
    byPhaseInitial[i.phase].credits += i.initialCredits; byPhaseInitial[i.phase].costUSD += i.initialCostUSD;
    byPhaseIncremental[i.phase].credits += i.incrementalCreditsPerYear; byPhaseIncremental[i.phase].costUSD += i.incrementalCostPerYearUSD;
  });
  const initT = items.reduce((s, i) => s + i.initialCredits, 0);
  const incrT = items.reduce((s, i) => s + i.incrementalCreditsPerYear, 0);
  const initCost = initT * usd;
  const incrCost = incrT * usd;
  return { lineItems: items, byPhaseInitial, byPhaseIncremental,
    totals: { initialCredits: initT, initialCostUSD: initCost, incrementalCreditsPerYear: incrT, incrementalCostPerYearUSD: incrCost,
      monthlyIncrementalCostUSD: incrCost / 12, grandTotalCostUSD: (inputs.splitInitialLoad ? initCost : 0) + incrCost }
  };
}
