// Server-side only. Data Cloud (Data 360) specific configuration scanning - separate from the
// generic Salesforce object/field metadata already covered by salesforceClient.ts.
import { getActiveConnection } from './salesforceClient';
import { buildPackageXml, type DeployableCategory, type PackageComponentSelection } from './deploymentPackage';

// Data Cloud's SSOT REST resources are gated per-version (a resource introduced in a later
// release simply isn't routable at an older version number - unlike core SOQL/describe calls,
// which stay backward-compatible indefinitely). v59.0 (Winter '24) predates several of these
// endpoints. The official data360-schema-get skill (forcedotcom/sf-skills) documents
// data-lake-objects/data-model-objects at v64.0 - used here for all SSOT calls for consistency.
const SSOT_API_VERSION = 'v64.0';

export interface DataCloudMetadataItem {
  name: string;
  displayName?: string;
  [key: string]: unknown;
}

// Reports human-readable progress as the scan runs - real, as-it-happens status (each message
// fires when something actually completes), not a fake timer. Optional everywhere so callers
// that don't care about progress (e.g. tests) can omit it.
export type ScanProgress = (message: string) => void;

// The exact response envelope for these Connect REST endpoints isn't confirmed from docs
// alone in every case, so unwrap defensively rather than assuming one specific shape.
function extractArray(json: unknown, ...preferredKeys: string[]): DataCloudMetadataItem[] {
  if (Array.isArray(json)) return json as DataCloudMetadataItem[];
  if (json && typeof json === 'object') {
    for (const key of [...preferredKeys, 'data', 'records', 'value', 'items']) {
      const v = (json as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v as DataCloudMetadataItem[];
    }
  }
  return [];
}

// These SSOT list endpoints page via a `nextPageUrl` field on the response (confirmed live -
// e.g. data-lake-objects returned only 18 of a real totalSize:153 on the first page). Follow it
// until exhausted (capped, so a pathological response can't loop forever) rather than silently
// truncating to page 1.
async function fetchAllPages(
  conn: any, initialUrl: string, label: string, onProgress: ScanProgress | undefined, ...preferredKeys: string[]
): Promise<DataCloudMetadataItem[]> {
  const all: DataCloudMetadataItem[] = [];
  let url: string | undefined = initialUrl;
  let pages = 0;
  while (url && pages < 25) {
    pages++;
    if (pages > 1) onProgress?.(`${label}: fetching page ${pages} (${all.length.toLocaleString()} so far)...`);
    const result: any = await conn.requestGet(url);
    all.push(...extractArray(result, ...preferredKeys));
    url = typeof result?.nextPageUrl === 'string' ? result.nextPageUrl : undefined;
  }
  return all;
}

// DLOs and DMOs are fetched via the Data 360 SSOT Connect REST API. Endpoint paths confirmed via
// Salesforce's official data360-schema-get skill (forcedotcom/sf-skills); the exact envelope key
// for DMOs, however, does NOT match that skill's documented `dataModelObjects` (plural) - live
// testing against a real org showed the actual key is `dataModelObject` (singular). Matching
// both here rather than trusting the doc literally, since it was already proven wrong once.
async function fetchDataLakeObjects(onProgress?: ScanProgress): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  const arr = await fetchAllPages(conn, `/services/data/${SSOT_API_VERSION}/ssot/data-lake-objects`, 'Data Lake Objects', onProgress, 'dataLakeObjects');
  return arr.map((o: any) => ({
    name: o.name, displayName: o.label || o.name, category: o.category, status: o.status, id: o.id,
    totalRecords: o.totalRecords,
    fieldCount: Array.isArray(o.fields) ? o.fields.length : undefined,
    fields: Array.isArray(o.fields) ? o.fields.map((f: any) => f.name) : undefined
  }));
}

async function fetchDataModelObjects(onProgress?: ScanProgress): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  const arr = await fetchAllPages(conn, `/services/data/${SSOT_API_VERSION}/ssot/data-model-objects`, 'Data Model Objects', onProgress, 'dataModelObject', 'dataModelObjects');
  return arr.map((o: any) => ({
    name: o.name, displayName: o.label || o.name, category: o.category, id: o.id,
    fieldCount: Array.isArray(o.fields) ? o.fields.length : undefined,
    fields: Array.isArray(o.fields) ? o.fields.map((f: any) => f.name) : undefined
  }));
}

// Segments and Identity Resolution rulesets live on the core org's own REST API
// (Data 360 Connect API), not a separate Data Cloud tenant - no token exchange needed.
async function fetchSegments(onProgress?: ScanProgress): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  return fetchAllPages(conn, `/services/data/${SSOT_API_VERSION}/ssot/segments`, 'Segments', onProgress, 'segments');
}

async function fetchIdentityResolutionRulesets(onProgress?: ScanProgress): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  return fetchAllPages(conn, `/services/data/${SSOT_API_VERSION}/ssot/identity-resolutions`, 'Identity Resolution Rulesets', onProgress, 'identityResolutions');
}

// Data Cloud's own SQL dialect (not SOQL) - confirmed via the official data360-query skill
// (forcedotcom/sf-skills) and Salesforce's Aug 2025 Query Connect API blog post, which shows
// the identical `SELECT ... FROM SomeObject__dll` shape against this same core-org session.
// Used to sample real usage/consumption data below - never to guess a schema, only to read it.
async function queryDataCloudSql(sql: string): Promise<Record<string, unknown>[]> {
  const conn = getActiveConnection();
  const result: any = await conn.requestPost(`/services/data/${SSOT_API_VERSION}/ssot/queryv2`, { sql });
  return extractArray(result, 'data');
}

// Digital Wallet is Salesforce's real (2025) Data Cloud credit-consumption tracking product.
// It provisions these exact DLOs into the org's own data space - confirmed via multiple
// official Salesforce Help pages (Monitor Usage for Consumption-Based Products; Example: Query
// Digital Wallet Data in Tableau). Not every org has Digital Wallet enabled - detect rather than
// assume, by checking whether these names show up in the DLO list we already fetch.
export const DIGITAL_WALLET_DLO_NAMES = [
  'TenantBillingUsageEvent',
  'TenantDailyEntitlementConsumption',
  'TenantEnrichedUsageEvent',
  'TenantEntitlementTransaction',
  'TenantHourlyEntitlementConsumption',
  'TenantUsageAttrDetail',
  'TenantUsageTypeMultiplier'
];

// No official doc confirms the exact field names/aggregation shape for these DLOs end-to-end
// through the REST SQL API (only that they exist and are queryable via Tableau/Flow) - so this
// pulls real sample rows as-is, with real field names exactly as this org returns them, rather
// than guessing which field is "credits" or "category" and computing a number that could be wrong.
async function sampleDigitalWalletUsage(dlos: DataCloudMetadataItem[], onProgress?: ScanProgress): Promise<ScanCategoryResult> {
  const present = dlos.filter((d) => DIGITAL_WALLET_DLO_NAMES.some((n) => d.name?.startsWith(n)));
  if (present.length === 0) {
    return {
      category: 'Digital Wallet Credit Usage',
      status: 'ok',
      items: [],
      note: 'Digital Wallet usage-tracking DLOs were not found in this org\'s Data Lake Objects - Digital Wallet is likely not enabled/provisioned here, so real historical credit consumption isn\'t available via API. Use the Credit Calculator for a manual estimate instead.'
    };
  }
  const items: DataCloudMetadataItem[] = [];
  const errors: string[] = [];
  for (const dlo of present) {
    onProgress?.(`Digital Wallet Credit Usage: sampling ${dlo.name}...`);
    try {
      const rows = await queryDataCloudSql(`SELECT * FROM "${dlo.name}" LIMIT 20`);
      items.push({ name: dlo.name, displayName: dlo.displayName ?? dlo.name, sampledRows: rows.length, rows });
    } catch (e) {
      errors.push(`${dlo.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {
    category: 'Digital Wallet Credit Usage',
    status: 'ok',
    items,
    note: errors.length
      ? `Digital Wallet DLOs were found but some sample queries failed: ${errors.join('; ')}`
      : 'Digital Wallet usage-tracking DLOs found and sampled (real rows, up to 20 each) - field names are exactly as returned by this org, not guessed. Expand an item to see the raw usage/consumption data.'
  };
}

export interface DiscoveredMetadataType {
  xmlName: string;
  suffix?: string | null;
  directoryName: string;
  parentXmlName?: string;
}

// Rather than hardcode assumed Metadata API type names (which may not exist in a given org/
// API version and would just throw INVALID_TYPE faults), ask the Metadata API to describe
// itself - conn.metadata.describe() returns every valid type name for this org - then filter
// for anything that looks Data Cloud-related. This makes the scan self-adapting.
const DATA_CLOUD_KEYWORD_RE = /data.?(lake|model|stream|space|transform|kit)|calc.*insight|identity.*resolution|segment|activation|ssot|cdp/i;

async function discoverDataCloudMetadataTypes(onProgress?: ScanProgress): Promise<DiscoveredMetadataType[]> {
  const conn = getActiveConnection();
  onProgress?.('Discovering additional Data Cloud metadata types via the Metadata API...');
  const described = await conn.metadata.describe();
  const objects: any[] = described?.metadataObjects ?? [];

  // Some metadata types are children of another type (e.g. CustomField is a child of
  // CustomObject) and don't support a standalone list() call the same way - it typically
  // returns empty rather than an error, which would otherwise show as a misleading "(0)".
  // Build the child -> parent map from every type's childXmlNames so we can flag these.
  const childToParent = new Map<string, string>();
  for (const o of objects) {
    for (const child of o?.childXmlNames ?? []) childToParent.set(child, o.xmlName);
  }

  return objects
    .filter((o) => typeof o?.xmlName === 'string' && DATA_CLOUD_KEYWORD_RE.test(o.xmlName))
    .map((o) => ({ xmlName: o.xmlName, suffix: o.suffix ?? null, directoryName: o.directoryName, parentXmlName: childToParent.get(o.xmlName) }));
}

// list() gives sparse info (fullName + audit fields only); read() returns the full component
// definition. Salesforce caps most Metadata API types at 10 components per read() call, so
// this batches. If read() isn't supported for a given type, the list-only info is kept rather
// than failing the whole category.
async function fetchMetadataComponentsWithDetail(type: string, label: string, onProgress?: ScanProgress): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  onProgress?.(`${label}: listing components...`);
  const listed = await conn.metadata.list([{ type }]);
  const arr: any[] = Array.isArray(listed) ? listed : listed ? [listed] : [];
  if (arr.length === 0) return [];

  const fullNames = arr.map((f) => f.fullName).filter(Boolean);
  const detailByName = new Map<string, any>();
  const batches: string[][] = [];
  for (let i = 0; i < fullNames.length; i += 10) batches.push(fullNames.slice(i, i + 10));
  if (batches.length > 1) onProgress?.(`${label}: reading details for ${fullNames.length} component(s) in ${batches.length} batches...`);
  const settledBatches = await Promise.allSettled(batches.map((batch) => conn.metadata.read(type, batch)));
  for (const r of settledBatches) {
    if (r.status !== 'fulfilled') continue;
    const readArr: any[] = Array.isArray(r.value) ? r.value : r.value ? [r.value] : [];
    for (const rec of readArr) {
      const key = rec?.fullName;
      if (key) detailByName.set(key, rec);
    }
  }

  return arr.map((f) => {
    const detail = detailByName.get(f.fullName) ?? {};
    return {
      ...detail,
      name: f.fullName,
      displayName: detail.label || detail.masterLabel || f.fullName,
      lastModifiedDate: f.lastModifiedDate,
      lastModifiedByName: f.lastModifiedByName,
      namespacePrefix: f.namespacePrefix ?? undefined
    };
  });
}

export interface ScanCategoryResult {
  category: string;
  status: 'ok' | 'error';
  items?: DataCloudMetadataItem[];
  error?: string;
  note?: string;
}

interface InternalScanResult extends ScanCategoryResult { order: number; }

// Friendly display name + position in the actual Data Cloud pipeline (Ingestion ->
// Harmonize & Unify -> Insights -> Activation), so results render in a sensible order
// instead of API-discovery order. Anything discovered but not in this table still shows up
// (self-adapting), just grouped at the end under its raw type name.
const CATEGORY_META: Record<string, { label: string; order: number }> = {
  // Ingestion
  DataStreamDefinition: { label: 'Data Streams', order: 10 },
  DataStreamTemplate: { label: 'Data Stream Templates', order: 11 },
  DataKitObjectTemplate: { label: 'Data Kit Object Templates', order: 12 },
  __dll: { label: 'Data Lake Objects (DLOs)', order: 13 },
  MktDatalakeSrcKeyQualifier: { label: 'Data Lake Source Key Qualifiers', order: 14 },
  OmniDataTransform: { label: 'Data Transforms', order: 15 },
  DataSrcDataModelFieldMap: { label: 'Source-to-DMO Field Mappings', order: 16 },
  // Harmonize & Unify
  __dlm: { label: 'Data Model Objects (DMOs)', order: 20 },
  identityResolution: { label: 'Identity Resolution Rulesets', order: 21 },
  // Insights
  MktCalcInsightObjectDef: { label: 'Calculated Insights', order: 30 },
  DataCalcInsightTemplate: { label: 'Calculated Insight Templates', order: 31 },
  // Activation
  segments: { label: 'Segments', order: 40 },
  MarketSegmentDefinition: { label: 'Segment Definitions (Metadata)', order: 41 },
  ActivationPlatform: { label: 'Activation Platforms', order: 42 },
  ActivationPlatformField: { label: 'Activation Platform Fields', order: 43 },
  ActivationPlatformActvAttr: { label: 'Activation Platform Attributes', order: 44 },
  // Usage & Consumption
  digitalWalletUsage: { label: 'Digital Wallet Credit Usage', order: 50 }
};
const UNKNOWN_ORDER = 900;

export async function runOrgScan(onProgress?: ScanProgress): Promise<ScanCategoryResult[]> {
  const fixedTasks: { key: string; run: (p?: ScanProgress) => Promise<DataCloudMetadataItem[]> }[] = [
    { key: '__dlm', run: fetchDataModelObjects },
    { key: '__dll', run: fetchDataLakeObjects },
    { key: 'segments', run: fetchSegments },
    { key: 'identityResolution', run: fetchIdentityResolutionRulesets }
  ];
  onProgress?.(`Fetching core categories: ${fixedTasks.map((t) => CATEGORY_META[t.key].label).join(', ')}...`);
  const settledFixed = await Promise.allSettled(fixedTasks.map((t) => {
    const meta = CATEGORY_META[t.key];
    return t.run(onProgress).then((r) => { onProgress?.(`✓ ${meta.label} (${r.length.toLocaleString()})`); return r; });
  }));
  const results: InternalScanResult[] = settledFixed.map((r, i) => {
    const meta = CATEGORY_META[fixedTasks[i].key];
    return r.status === 'fulfilled'
      ? { category: meta.label, order: meta.order, status: 'ok' as const, items: r.value }
      : { category: meta.label, order: meta.order, status: 'error' as const, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  });

  // Digital Wallet usage sampling reuses the DLO list already fetched above - no extra list call.
  const dloResult = settledFixed[fixedTasks.findIndex((t) => t.key === '__dll')];
  if (dloResult.status === 'fulfilled') {
    try {
      onProgress?.('Checking for Digital Wallet usage-tracking DLOs...');
      const usage = await sampleDigitalWalletUsage(dloResult.value, onProgress);
      const meta = CATEGORY_META.digitalWalletUsage;
      onProgress?.(`✓ ${meta.label}`);
      results.push({ ...usage, order: meta.order });
    } catch (e) {
      const meta = CATEGORY_META.digitalWalletUsage;
      results.push({ category: meta.label, order: meta.order, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  try {
    const discovered = await discoverDataCloudMetadataTypes(onProgress);
    // Child types (e.g. ActivationPlatformField is a child of ActivationPlatform) generally
    // can't be listed standalone - skip the call entirely rather than show a false "(0)",
    // and point at the parent instead, since its full detail (already fetched via read()) is
    // where this data actually lives.
    const topLevel = discovered.filter((d) => !d.parentXmlName);
    const childOnly = discovered.filter((d) => d.parentXmlName);

    if (topLevel.length > 0) {
      onProgress?.(`Found ${topLevel.length} additional type(s) to scan: ${topLevel.map((d) => CATEGORY_META[d.xmlName]?.label ?? d.xmlName).join(', ')}`);
    }
    const settledDiscovered = await Promise.allSettled(topLevel.map((d) => {
      const label = CATEGORY_META[d.xmlName]?.label ?? d.xmlName;
      return fetchMetadataComponentsWithDetail(d.xmlName, label, onProgress).then((r) => { onProgress?.(`✓ ${label} (${r.length.toLocaleString()})`); return r; });
    }));
    settledDiscovered.forEach((r, i) => {
      const xmlName = topLevel[i].xmlName;
      const meta = CATEGORY_META[xmlName];
      const category = meta?.label ?? xmlName;
      const order = meta?.order ?? UNKNOWN_ORDER;
      if (r.status === 'fulfilled') {
        const note = r.value.length === 0
          ? 'Zero results here can mean either nothing is configured, or this type is not queryable this way in this org - if you expect items, check the item detail of a related category.'
          : undefined;
        results.push({ category, order, status: 'ok', items: r.value, note });
      } else {
        results.push({ category, order, status: 'error', error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
      }
    });

    for (const c of childOnly) {
      const meta = CATEGORY_META[c.xmlName];
      const parentMeta = CATEGORY_META[c.parentXmlName!];
      const parentLabel = parentMeta?.label ?? c.parentXmlName!;
      results.push({
        category: meta?.label ?? c.xmlName,
        order: meta?.order ?? UNKNOWN_ORDER,
        status: 'ok',
        items: [],
        note: `Not independently listable - this is a child of "${parentLabel}". Click into a ${parentLabel} item above to see its full nested configuration, which includes this data.`
      });
    }
  } catch (e) {
    results.push({ category: 'Metadata Type Discovery', order: UNKNOWN_ORDER, status: 'error', error: e instanceof Error ? e.message : String(e) });
  }

  onProgress?.(`Scan complete - ${results.length} categories checked.`);
  return results
    .sort((a, b) => a.order - b.order || a.category.localeCompare(b.category))
    .map(({ order, ...rest }) => rest);
}

// ==================== Deployment Package Builder ====================
// Grounded in Salesforce's Metadata API Developer Guide "Data 360 Metadata Types" reference,
// which confirms these are real, versioned Metadata API component types - deployable/
// retrievable via standard package.xml + deploy()/retrieve(), the exact same jsforce calls used
// elsewhere in this app for read-only metadata.describe()/list()/read(). Only types explicitly
// confirmed there are marked supported=true; everything else discovered is shown for visibility
// but marked unsupported with a reason, rather than guessing it will deploy correctly.
const PACKAGING_SUPPORT: Record<string, { order: number; supported: boolean; reason?: string }> = {
  DataStreamDefinition: { order: 10, supported: true },
  DataStreamTemplate: { order: 11, supported: true },
  DataKitObjectTemplate: { order: 12, supported: true },
  DataSrcDataModelFieldMap: { order: 16, supported: true },
  MktCalcInsightObjectDef: { order: 30, supported: true },
  MarketSegmentDefinition: { order: 41, supported: true },
  ActivationPlatform: { order: 42, supported: true },
  MktDatalakeSrcKeyQualifier: { order: 14, supported: false, reason: 'Not confirmed as an independently deployable Metadata API type in Salesforce\'s Data 360 Metadata Types reference - shown for visibility only.' },
  OmniDataTransform: { order: 15, supported: false, reason: 'Not confirmed as an independently deployable Metadata API type in Salesforce\'s Data 360 Metadata Types reference - shown for visibility only.' },
  DataCalcInsightTemplate: { order: 31, supported: false, reason: 'Not confirmed as an independently deployable Metadata API type in Salesforce\'s Data 360 Metadata Types reference - shown for visibility only.' },
  ActivationPlatformField: { order: 43, supported: false, reason: 'Child of Activation Platform - deploys as part of its parent, not independently selectable.' },
  ActivationPlatformActvAttr: { order: 44, supported: false, reason: 'Child of Activation Platform - deploys as part of its parent, not independently selectable.' }
};

// Lists every Metadata-API-discovered Data Cloud component (the same discovery already used by
// the Org Scanner), annotated with real support-for-packaging status. Deliberately does NOT
// include DMOs/DLOs/Segments/Identity Resolution fetched via the separate SSOT REST API earlier
// in this file - those were never confirmed as the same deployable surface, so they're excluded
// here rather than guessed at.
export async function listDeployableComponents(onProgress?: ScanProgress): Promise<DeployableCategory[]> {
  const discovered = await discoverDataCloudMetadataTypes(onProgress);
  const topLevel = discovered.filter((d) => !d.parentXmlName && PACKAGING_SUPPORT[d.xmlName]);
  onProgress?.(`Found ${topLevel.length} packageable Data Cloud metadata type(s) to inspect...`);

  const settled = await Promise.allSettled(topLevel.map((d) => {
    const label = CATEGORY_META[d.xmlName]?.label ?? d.xmlName;
    return fetchMetadataComponentsWithDetail(d.xmlName, label, onProgress).then((items) => {
      onProgress?.(`✓ ${label} (${items.length.toLocaleString()})`);
      return items;
    });
  }));

  const results: DeployableCategory[] = [];
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const xmlName = topLevel[i].xmlName;
    const meta = CATEGORY_META[xmlName];
    const support = PACKAGING_SUPPORT[xmlName];
    results.push({
      xmlName,
      category: meta?.label ?? xmlName,
      order: support.order,
      supported: support.supported,
      unsupportedReason: support.reason,
      items: r.value.map((it) => ({ fullName: it.name, label: (it.displayName as string) || it.name }))
    });
  });
  return results.sort((a, b) => a.order - b.order);
}

export interface RetrievedPackage { zipBase64: string; fileCount: number; }

// Retrieves the actual metadata XML for the selected components as a zip, via the standard
// Metadata API retrieve() - read-only against the source org (retrieve never mutates anything).
// Polls checkRetrieveStatus() manually (rather than jsforce's built-in .complete(), which
// polls silently) so real progress can be reported between polls, same pattern as the scan.
export async function retrieveMetadataPackage(
  selections: PackageComponentSelection[], apiVersion: string, onProgress?: ScanProgress
): Promise<RetrievedPackage> {
  const conn = getActiveConnection();
  onProgress?.('Requesting metadata retrieval from Salesforce...');
  const locator = conn.metadata.retrieve({
    apiVersion,
    unpackaged: { types: selections.filter((s) => s.members.length > 0).map((s) => ({ members: s.members, name: s.xmlName })), version: apiVersion }
  });
  const kicked = await locator;
  const asyncId: string = kicked.id;
  onProgress?.(`Retrieve job started (id ${asyncId}) - polling for completion...`);

  let attempts = 0;
  while (attempts < 120) {
    attempts++;
    const status = await conn.metadata.checkRetrieveStatus(asyncId);
    if (status.done) {
      if (!status.success) {
        throw new Error(status.errorMessage || 'Retrieve failed with an unknown error.');
      }
      const fileCount = status.fileProperties?.length ?? 0;
      onProgress?.(`✓ Retrieve complete - ${fileCount} file(s) packaged.`);
      return { zipBase64: status.zipFile, fileCount };
    }
    onProgress?.(`Retrieving... (status: ${status.status ?? 'InProgress'}, check ${attempts})`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Retrieve timed out after 4 minutes of polling.');
}

export function generatePackageXml(selections: PackageComponentSelection[], apiVersion: string): string {
  return buildPackageXml(selections, apiVersion);
}

export interface DeployOutcome {
  id: string; done: boolean; success: boolean; status: string;
  numberComponentsDeployed: number; numberComponentsTotal: number; numberComponentErrors: number;
  checkOnly: boolean; errorMessage?: string;
  componentFailures: { fullName: string; componentType?: string; problem?: string }[];
}

// Deploys a retrieved zip into the TARGET org connection (never the source connection - the
// caller must pass an explicit target-org jsforce Connection, established via a separate,
// deliberate connect step). Defaults nothing about checkOnly - the caller decides, so a
// validation-only dry run vs. a real deploy is always an explicit choice made above this layer.
export async function deployMetadataPackage(
  targetConn: any, zipBase64: string, checkOnly: boolean, onProgress?: ScanProgress
): Promise<DeployOutcome> {
  onProgress?.(checkOnly ? 'Starting validation-only deploy (checkOnly - nothing will actually change)...' : 'Starting real deploy to target org...');
  const zipBuffer = Buffer.from(zipBase64, 'base64');
  const locator = targetConn.metadata.deploy(zipBuffer, { checkOnly, rollbackOnError: true, singlePackage: true });
  const kicked = await locator;
  const asyncId: string = kicked.id;
  onProgress?.(`Deploy job started (id ${asyncId}) - polling for completion...`);

  let attempts = 0;
  while (attempts < 120) {
    attempts++;
    const status = await targetConn.metadata.checkDeployStatus(asyncId, true);
    if (status.done) {
      const outcome: DeployOutcome = {
        id: asyncId, done: true, success: status.success, status: status.status,
        numberComponentsDeployed: status.numberComponentsDeployed, numberComponentsTotal: status.numberComponentsTotal,
        numberComponentErrors: status.numberComponentErrors, checkOnly,
        errorMessage: status.errorMessage ?? undefined,
        componentFailures: (status.details?.componentFailures ?? []).map((f: any) => ({ fullName: f.fullName, componentType: f.componentType, problem: f.problem }))
      };
      onProgress?.(outcome.success
        ? `✓ ${checkOnly ? 'Validation' : 'Deploy'} succeeded - ${outcome.numberComponentsDeployed}/${outcome.numberComponentsTotal} component(s).`
        : `✗ ${checkOnly ? 'Validation' : 'Deploy'} failed - ${outcome.numberComponentErrors} error(s) of ${outcome.numberComponentsTotal} component(s).`);
      return outcome;
    }
    onProgress?.(`Deploying... (status: ${status.status ?? 'InProgress'}, ${status.numberComponentsDeployed ?? 0}/${status.numberComponentsTotal ?? '?'} so far, check ${attempts})`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Deploy timed out after 4 minutes of polling.');
}

// Deploys a previously-validated (checkOnly) deploy for real, without re-uploading the zip -
// this is jsforce's deployRecentValidation(), which wraps Salesforce's real "deploy a recently
// validated request" mechanism (the documented safe path: validate first, then commit).
export async function deployRecentValidation(targetConn: any, validatedDeployId: string, onProgress?: ScanProgress): Promise<DeployOutcome> {
  onProgress?.(`Deploying previously-validated request (id ${validatedDeployId}) for real...`);
  const asyncId: string = await targetConn.metadata.deployRecentValidation({ id: validatedDeployId });
  onProgress?.(`Deploy job started (id ${asyncId}) - polling for completion...`);

  let attempts = 0;
  while (attempts < 120) {
    attempts++;
    const status = await targetConn.metadata.checkDeployStatus(asyncId, true);
    if (status.done) {
      const outcome: DeployOutcome = {
        id: asyncId, done: true, success: status.success, status: status.status,
        numberComponentsDeployed: status.numberComponentsDeployed, numberComponentsTotal: status.numberComponentsTotal,
        numberComponentErrors: status.numberComponentErrors, checkOnly: false,
        errorMessage: status.errorMessage ?? undefined,
        componentFailures: (status.details?.componentFailures ?? []).map((f: any) => ({ fullName: f.fullName, componentType: f.componentType, problem: f.problem }))
      };
      onProgress?.(outcome.success
        ? `✓ Deploy succeeded - ${outcome.numberComponentsDeployed}/${outcome.numberComponentsTotal} component(s).`
        : `✗ Deploy failed - ${outcome.numberComponentErrors} error(s) of ${outcome.numberComponentsTotal} component(s).`);
      return outcome;
    }
    onProgress?.(`Deploying... (status: ${status.status ?? 'InProgress'}, ${status.numberComponentsDeployed ?? 0}/${status.numberComponentsTotal ?? '?'} so far, check ${attempts})`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Deploy timed out after 4 minutes of polling.');
}
