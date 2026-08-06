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

export interface SegmentVolumeSignal { totalRows: number; segmentCount: number; matchedField: string }

// Segments are charged by rows EVALUATED when published (segmentRowsProcessed in the rate card),
// not by how many segments exist - a count of "1 segment" can't be honestly turned into a row
// volume without knowing that segment's actual population (Salesforce's own Segment detail page
// shows this as "Segment Population"). fetchSegments() passes the /ssot/segments response
// through unmapped (confirmed in lib/dataCloudClient.ts), so whatever population field Salesforce
// returns is already present on each raw item - just not under a name this app assumed. Detected
// defensively here (same pattern as extractDigitalWalletRollup below) rather than guessed at, and
// returns null - contributing nothing to the prefill - if no matching field is found, rather than
// fabricate a number.
export function extractSegmentVolumeSignal(results: ScanCategoryResult[]): SegmentVolumeSignal | null {
  const items = results.find((r) => r.category === 'Segments')?.items ?? [];
  if (items.length === 0) return null;
  const sample = items[0] as Record<string, unknown>;
  const matchedField = Object.keys(sample).find((k) => /population|member.*count|record.*count|row.*count/i.test(k) && typeof sample[k] === 'number');
  if (!matchedField) return null;
  let totalRows = 0;
  for (const it of items) {
    const v = (it as Record<string, unknown>)[matchedField];
    if (typeof v === 'number') totalRows += v;
  }
  return { totalRows, segmentCount: items.length, matchedField };
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

// segmentSignal/footprint are optional so every existing call site (which only ever passed the
// first three args) keeps compiling and behaving the same - they just won't get the additional
// Segment/Calculated Insight handling below without being updated to pass them.
export function buildBasicHandoff(
  totalRows: number, bucket: PipelineBucket, period: Period,
  segmentSignal?: SegmentVolumeSignal | null, footprint?: ConfigFootprint | null
): BasicHandoff {
  const key = bucket === 'internal' ? 'internalDataPipeline' : 'externalDataPipelineBatch';
  const itemVolumes: Record<string, number> = { [key]: totalRows };
  const itemPeriods: Record<string, Period> = { [key]: period };
  const noteParts = [`Prefilled from Org Scanner: ${totalRows.toLocaleString()} rows currently in your Data Lake Objects, assumed to refresh once per ${period}.`];

  if (segmentSignal) {
    itemVolumes.segmentRowsProcessed = segmentSignal.totalRows;
    itemPeriods.segmentRowsProcessed = period;
    noteParts.push(`Also prefilled "Segment Rows Processed" with ${segmentSignal.totalRows.toLocaleString()} rows across ${segmentSignal.segmentCount} segment(s) (summed from each segment's "${segmentSignal.matchedField}" field), assumed to publish once per ${period}.`);
  } else if (footprint && footprint.segments > 0) {
    noteParts.push(`This org also has ${footprint.segments} segment(s) configured, but the scan couldn't find a population field on them to estimate row volume - add "Segment Rows Processed" (Activation phase) manually if they're actively publishing.`);
  }
  if (footprint && footprint.calculatedInsights > 0) {
    noteParts.push(`This org also has ${footprint.calculatedInsights} Calculated Insight(s) configured - their actual row throughput isn't available from the scan (that's measured at run time, not part of the metadata definition), so add "Calculated Insights - Batch/Streaming" (Insights phase) manually if you want to include them.`);
  }
  noteParts.push('This is a starting point, not a measured rate - adjust the volume/period to match your actual pipeline design.');

  return { itemVolumes, itemPeriods, note: noteParts.join(' ') };
}

export interface AdvancedHandoff {
  kind: 'pipeline' | 'legacy';
  pipeline?: { connectionKey: string; object: string; volumePerRun: number; runMode: RefreshMode; frequency: RunFrequency; manualRunsPerYear?: number };
  legacy?: { key: string; volumePerRun: number; runMode: RefreshMode; frequency: RunFrequency; manualRunsPerYear?: number };
  note: string;
}

// footprint is optional for the same backward-compat reason as buildBasicHandoff above. Unlike
// Basic, Advanced's handoff shape only carries a single pipeline/legacy item - there's no second
// slot to prefill a Segment volume into even when one is available - so this only adds an
// informational note pointing at what to add manually, rather than silently omitting real
// configured objects (segments, calculated insights) the user might not know aren't reflected.
export function buildAdvancedHandoff(totalRows: number, bucket: PipelineBucket, period: Period, footprint?: ConfigFootprint | null): AdvancedHandoff {
  const { frequency, manualRunsPerYear } = PERIOD_TO_FREQUENCY[period];
  const noteParts = [`Prefilled from Org Scanner: ${totalRows.toLocaleString()} rows currently in your Data Lake Objects, assumed to refresh once per ${period}.`];
  if (footprint && (footprint.segments > 0 || footprint.calculatedInsights > 0)) {
    noteParts.push(`This org also has ${footprint.segments} segment(s) and ${footprint.calculatedInsights} Calculated Insight(s) configured - their row volumes aren't available from the scan and aren't prefilled here, so add "Segment Rows Processed" / "Calculated Insights" pipelines manually if you want to include them.`);
  }
  noteParts.push('This is a starting point, not a measured rate - adjust the volume/mode/frequency to match your actual pipeline design.');
  const note = noteParts.join(' ');
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

export const FLEX_HANDOFF_KEY = 'sfdc.flexCredits.suggestedInputs.v1';
export interface FlexHandoff { itemKey: string; volume: number; period: Period; note: string; }

// Flex Credits' "Data 360 Prep" is a single, unified ingestion/prep rate - unlike Credit-Based
// Consumption there's no internal-vs-external connector split to choose here, so this handoff
// needs no bucket parameter at all. Same single-item shape limitation as buildAdvancedHandoff -
// a Segment/Calculated Insight signal can't be prefilled into a second item here, so it's
// surfaced as a note instead of silently going unmentioned.
export function buildFlexHandoff(totalRows: number, period: Period, footprint?: ConfigFootprint | null): FlexHandoff {
  const noteParts = [`Prefilled from Org Scanner: ${totalRows.toLocaleString()} rows currently in your Data Lake Objects, assumed to refresh once per ${period}, applied to Data 360 Prep.`];
  if (footprint && (footprint.segments > 0 || footprint.calculatedInsights > 0)) {
    noteParts.push(`This org also has ${footprint.segments} segment(s) configured - their row volume isn't available from the scan, so add "Data 360 Segmentation" manually if you want to include it. (Calculated Insights have no dedicated Flex Credits rate item.)`);
  }
  noteParts.push('This is a starting point, not a measured rate - adjust the volume/period to match your actual pipeline design.');
  return {
    itemKey: 'flexDataPrep',
    volume: totalRows,
    period,
    note: noteParts.join(' ')
  };
}
