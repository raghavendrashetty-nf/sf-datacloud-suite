export type EnvironmentId = "Production" | "Sandbox";
export type PhaseId = "ingestion" | "harmonization" | "realtime" | "insights" | "act" | "activation";
export type FrequencyId = "streaming" | "hourly" | "every6h" | "every12h" | "daily" | "weekly" | "batch" | "onDemand" | "triggered";
export interface CalculatorInputs {
  environment: EnvironmentId; splitInitialLoad: boolean; pipelines: number;
  initialInternalRows: number; initialExternalBatchRows: number; initialUnstructuredMB: number;
  initialPrivateConnectGB: number; initialUnifiedProfiles: number; initialInferences: number;
  internalIngestionRowsPerDay: number; externalBatchRowsPerDay: number; externalStreamingRowsPerDay: number;
  batchTransformRowsPerDay: number; streamingTransformRowsPerDay: number; unstructuredMBPerDay: number;
  dataFederationRowsPerDay: number; dataShareRowsPerDay: number; privateConnectGBPerDay: number;
  unifiedProfiles: number; matchRules: number; profileUnificationRunsPerDay: number;
  realtimeEventsPerDay: number;
  calcInsightsBatchCount: number; calcInsightsBatchRunsPerDay: number; calcInsightsStreamingCount: number; inferencesPerDay: number;
  dataQueriesRowsPerDay: number; streamingActionsRowsPerDay: number;
  segmentRowsPerDay: number; batchActivationRowsPerDay: number; streamingActivationRowsPerDay: number;
  overheadPct: number;
}
export interface LineItemResult {
  key: string; label: string; phase: PhaseId; unit: string;
  initialCredits: number; initialCostUSD: number;
  incrementalCreditsPerYear: number; incrementalCostPerYearUSD: number;
  applicableToInitialLoad: boolean;
}
export interface PhaseTotals { credits: number; costUSD: number; label: string; color: string; }
export interface CalculationResult {
  lineItems: LineItemResult[];
  byPhaseInitial: Record<PhaseId, PhaseTotals>;
  byPhaseIncremental: Record<PhaseId, PhaseTotals>;
  totals: { initialCredits: number; initialCostUSD: number; incrementalCreditsPerYear: number; incrementalCostPerYearUSD: number; monthlyIncrementalCostUSD: number; grandTotalCostUSD: number; };
}
