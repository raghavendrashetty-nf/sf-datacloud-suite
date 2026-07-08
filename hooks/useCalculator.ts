"use client";
import { useCallback, useMemo, useState } from "react";
import { calculate } from "@/lib/calculator";
import type { CalculatorInputs } from "@/lib/types";
import type { RatesConfig } from "@/lib/calculator";
const DEFAULTS: CalculatorInputs = {
  environment: "Production", splitInitialLoad: true, pipelines: 1,
  initialInternalRows: 0, initialExternalBatchRows: 0, initialUnstructuredMB: 0,
  initialPrivateConnectGB: 0, initialUnifiedProfiles: 0, initialInferences: 0,
  internalIngestionRowsPerDay: 0, externalBatchRowsPerDay: 0, externalStreamingRowsPerDay: 0,
  batchTransformRowsPerDay: 0, streamingTransformRowsPerDay: 0, unstructuredMBPerDay: 0,
  dataFederationRowsPerDay: 0, dataShareRowsPerDay: 0, privateConnectGBPerDay: 0,
  unifiedProfiles: 0, matchRules: 0, profileUnificationRunsPerDay: 0,
  realtimeEventsPerDay: 0,
  calcInsightsBatchCount: 0, calcInsightsBatchRunsPerDay: 0, calcInsightsStreamingCount: 0, inferencesPerDay: 0,
  dataQueriesRowsPerDay: 0, streamingActionsRowsPerDay: 0,
  segmentRowsPerDay: 0, batchActivationRowsPerDay: 0, streamingActivationRowsPerDay: 0,
  overheadPct: 0
};
export function useCalculator(rates: RatesConfig) {
  const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULTS);
  const update = useCallback(<K extends keyof CalculatorInputs>(k: K, v: CalculatorInputs[K]) => setInputs(prev => ({ ...prev, [k]: v })), []);
  const reset = useCallback(() => setInputs(DEFAULTS), []);
  const setAll = useCallback((i: CalculatorInputs) => setInputs(i), []);
  const result = useMemo(() => calculate(inputs, rates), [inputs, rates]);
  return { inputs, update, reset, setAll, result };
}
