// Client-side only. Turns real Org Scanner results into a credit-consumption estimate,
// using only signals actually present in the scan (DLO row counts, sampled Digital Wallet
// usage rows) - never a fabricated volume. The one thing the scan genuinely cannot tell us
// (whether ingested rows come via an "internal" Salesforce CRM pipeline or an "external"
// connector, and how often they refresh) is left as an explicit, user-controlled choice
// rather than guessed.
import type { Period } from './types';
import type { RefreshMode, RunFrequency } from './refreshModes';

// lib/dataCloudClient.ts is server-only (it pulls in jsforce via salesforceClient.ts) and must
// never be imported at runtime from client-bundled code - this file is used from the Org
// Scanner client page, so it defines its own minimal shape instead, matching the org-scanner
// page's own local ScanCategoryResult interface rather than importing the real one.
interface ScanCategoryResult {
  category: string;
  status: 'ok' | 'error';
  items?: { name: string; displayName?: string; [key: string]: unknown }[];
  error?: string;
  note?: string;
}

// Kept in sync with lib/dataCloudClient.ts's DIGITAL_WALLET_DLO_NAMES - these are Salesforce's
// own internal usage-metering DLOs, not business data, and must be excluded from a "how much
// data do I actually have" row count. Duplicated (not imported) because that module is
// server-only.
const DIGITAL_WALLET_DLO_NAMES = [
  'TenantBillingUsageEvent', 'TenantDailyEntitlementConsumption', 'TenantEnrichedUsageEvent',
  'TenantEntitlementTransaction', 'TenantHourlyEntitlementConsumption', 'TenantUsageAttrDetail',
  'TenantUsageTypeMultiplier'
];

export interface DloVolumeSignal { totalRows: number; dloCount: number; excludedWalletDlos: number; }

export function computeDloVolumeSignal(results: ScanCategoryResult[]): DloVolumeSignal {
  const items = results.find((r) => r.category === 'Data Lake Objects (DLOs)')?.items ?? [];
  let totalRows = 0, dloCount = 0, excludedWalletDlos = 0;
  for (const it of items) {
    const isWallet = typeof it.name === 'string' && DIGITAL_WALLET_DLO_NAMES.some((p) => (it.name as string).startsWith(p));
    if (isWallet) { excludedWalletDlos++; continue; }
    if (typeof it.totalRecords === 'number') totalRows += it.totalRecords;
    dloCount++;
  }
  return { totalRows, dloCount, excludedWalletDlos };
}

export interface ConfigFootprint { segments: number; calculatedInsights: number; dataTransforms: number; activationPlatforms: number; }

export function computeConfigFootprint(results: ScanCategoryResult[]): ConfigFootprint {
  const count = (category: string) => results.find((r) => r.category === category)?.items?.length ?? 0;
  return {
    segments: count('Segments'),
    calculatedInsights: count('Calculated Insights'),
    dataTransforms: count('Data Transforms'),
    activationPlatforms: count('Activation Platforms')
  };
}

export interface WalletUsageRollup {
  byCategory: { category: string; total: number }[];
  grandTotal: number;
  valueField: string;
  categoryField: string | null;
}

// No official doc confirms which sampled field is "credits consumed" vs. metadata for every
// possible org - so this only reports a rollup when it can find a field name that plausibly
// means "consumption amount" (and says exactly which field it used, so it's auditable rather
// than a black box). Returns null rather than guess when nothing matches.
export function extractDigitalWalletRollup(results: ScanCategoryResult[]): WalletUsageRollup | null {
  const items = results.find((r) => r.category === 'Digital Wallet Credit Usage')?.items ?? [];
  const allRows: Record<string, unknown>[] = [];
  for (const it of items) {
    const rawRows = (it as { rows?: unknown }).rows;
    const rows = Array.isArray(rawRows) ? (rawRows as Record<string, unknown>[]) : [];
    allRows.push(...rows);
  }
  if (allRows.length === 0) return null;

  const sample = allRows[0];
  const valueField = Object.keys(sample).find((k) => /unit.*consum|credit|amount/i.test(k) && typeof sample[k] === 'number');
  if (!valueField) return null;
  const categoryField = Object.keys(sample).find((k) => /card.*def|entitlement.*name|category|usage.*type/i.test(k) && typeof sample[k] === 'string') ?? null;

  const byCategoryMap = new Map<string, number>();
  let grandTotal = 0;
  for (const row of allRows) {
    const v = typeof row[valueField] === 'number' ? (row[valueField] as number) : 0;
    grandTotal += v;
    const cat = categoryField && typeof row[categoryField] === 'string' ? (row[categoryField] as string) : '(uncategorized)';
    byCategoryMap.set(cat, (byCategoryMap.get(cat) ?? 0) + v);
  }
  return {
    byCategory: Array.from(byCategoryMap.entries()).map(([category, total]) => ({ category, total })),
    grandTotal, valueField, categoryField
  };
}

export type PipelineBucket = 'internal' | 'external';

// Same semantic in both calculators: "this volume happens once per Period/RunFrequency" -
// so the same chosen cadence and row count carry over unchanged, just expressed in whichever
// unit each calculator uses (Basic: Period: RunFrequency).
const PERIOD_TO_FREQUENCY: Record<Period, { frequency: RunFrequency; manualRunsPerYear?: number }> = {
  day: { frequency: 'daily' },
  week: { frequency: 'weekly' },
  month: { frequency: 'monthly' },
  year: { frequency: 'manual', manualRunsPerYear: 1 }
};

export const BASIC_HANDOFF_KEY = 'sfdc.calculator.suggestedInputs.v1';
export const ADVANCED_HANDOFF_KEY = 'sfdc.calculatorAdvanced.suggestedInputs.v1';

export interface BasicHandoff { itemVolumes: Record<string, number>; itemPeriods: Record<string, Period>; note: string; }

export function buildBasicHandoff(totalRows: number, bucket: PipelineBucket, period: Period): BasicHandoff {
  const key = bucket === 'internal' ? 'internalDataPipeline' : 'externalDataPipelineBatch';
  return {
    itemVolumes: { [key]: totalRows },
    itemPeriods: { [key]: period },
    note: `Prefilled from Org Scanner: ${totalRows.toLocaleString()} rows currently in your Data Lake Objects, assumed to refresh once per ${period}. This is a starting point, not a measured rate - adjust the volume/period to match your actual pipeline design.`
  };
}

export interface AdvancedHandoff {
  kind: 'pipeline' | 'legacy';
  pipeline?: { connectionKey: string; object: string; volumePerRun: number; runMode: RefreshMode; frequency: RunFrequency; manualRunsPerYear?: number };
  legacy?: { key: string; volumePerRun: number; runMode: RefreshMode; frequency: RunFrequency; manualRunsPerYear?: number };
  note: string;
}

export function buildAdvancedHandoff(totalRows: number, bucket: PipelineBucket, period: Period): AdvancedHandoff {
  const { frequency, manualRunsPerYear } = PERIOD_TO_FREQUENCY[period];
  const note = `Prefilled from Org Scanner: ${totalRows.toLocaleString()} rows currently in your Data Lake Objects, assumed to refresh once per ${period}. This is a starting point, not a measured rate - adjust the volume/mode/frequency to match your actual pipeline design.`;
  if (bucket === 'external') {
    return {
      kind: 'pipeline',
      pipeline: { connectionKey: 'other_batch', object: 'Scanned DLOs (aggregate)', volumePerRun: totalRows, runMode: 'incremental', frequency, manualRunsPerYear },
      note
    };
  }
  return {
    kind: 'legacy',
    legacy: { key: 'internalDataPipeline', volumePerRun: totalRows, runMode: 'incremental', frequency, manualRunsPerYear },
    note
  };
}
