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
// mktdatatranobject is listed explicitly (rather than folded into the "data.?(...)" group) since
// its real Metadata API xmlName - MktDataTranObject, confirmed via Salesforce's own Metadata API
// Developer Guide reference page for that type - has "Tran" (transport), not one of lake/model/
// stream/etc, between "Data" and "Object", so the existing pattern never matched it. This is the
// Metadata API type for a Data Lake Object (DLO); DataStreamDefinition deploys reference one by
// DeveloperName and fail with "no MktDataTranObject named X found" if it isn't deployed first -
// confirmed live against a real org, not assumed.
// The remaining explicit names are Data Kit-related types confirmed via Salesforce's official
// "Data 360 Metadata Types" Metadata API reference page - none contain "data" immediately
// followed by lake/model/stream/space/transform/kit (e.g. "DataPackageKitDefinition" has
// "Package" between "Data" and "Kit"; "FieldSrcTrgtRelationship"/"ObjectSourceTargetMap" don't
// contain "data" at all), so the existing pattern would silently skip them without this.
const DATA_CLOUD_KEYWORD_RE = /data.?(lake|model|stream|space|transform|kit)|calc.*insight|identity.*resolution|segment|activation|ssot|cdp|mktdatatranobject|internaldataconnector|datapackagekit|datakitobjectdependency|dataobjectbuildorgtemplate|datasourcebundledefinition|fieldsrctrgtrelationship|objectsourcetargetmap/i;

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
  InternalDataConnector: { label: 'Data Connectors (internal-use-only type)', order: 8 },
  MktDataTranObject: { label: 'Data Lake Objects (Metadata API)', order: 9 },
  DataStreamDefinition: { label: 'Data Streams', order: 10 },
  DataStreamTemplate: { label: 'Data Stream Templates', order: 11 },
  // Data Kits - Salesforce's own recommended mechanism for moving a Data Stream + its full
  // dependency chain (DLO, connector, mappings) as one atomic bundle, specifically because
  // deploying DataStreamDefinition/MktDataTranObject one-by-one hits exactly the cascading
  // "no X named Y found" dependency errors seen live against a real org. A Data Kit must already
  // exist (authored via Data Cloud Setup's Data Kit Studio UI - confirmed no API/CLI can create
  // one from scratch), but once it does, these types deploy through this same Metadata API path.
  DataPackageKitDefinition: { label: 'Data Kits', order: 11.1 },
  DataPackageKitObject: { label: 'Data Kit Content Objects', order: 11.2 },
  DataKitObjectTemplate: { label: 'Data Kit Object Templates', order: 12 },
  DataKitObjectDependency: { label: 'Data Kit Object Dependencies', order: 12.1 },
  DataObjectBuildOrgTemplate: { label: 'Data Kit Build Templates', order: 12.2 },
  DataSourceBundleDefinition: { label: 'Data Kit Stream Bundles', order: 12.3 },
  __dll: { label: 'Data Lake Objects (DLOs)', order: 13 },
  MktDatalakeSrcKeyQualifier: { label: 'Data Lake Source Key Qualifiers', order: 14 },
  OmniDataTransform: { label: 'Data Transforms', order: 15 },
  DataSrcDataModelFieldMap: { label: 'Source-to-DMO Field Mappings', order: 16 },
  FieldSrcTrgtRelationship: { label: 'Field Source-Target Relationships (DMO)', order: 16.1 },
  ObjectSourceTargetMap: { label: 'Object Source-Target Mappings', order: 16.2 },
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
  // Must be selected/deployed before DataStreamDefinition - see DATA_CLOUD_KEYWORD_RE comment.
  MktDataTranObject: { order: 9, supported: true },
  DataStreamDefinition: { order: 10, supported: true },
  DataStreamTemplate: { order: 11, supported: true },
  // Data Kit types - Salesforce's recommended bundle-based alternative for migrating a Data
  // Stream + its full dependency chain atomically. Only useful if a Data Kit already wraps the
  // components (authored via Data Cloud Setup's Data Kit Studio - no API creates one from
  // scratch); confirmed real via Salesforce's Data 360 Metadata Types reference page.
  DataPackageKitDefinition: { order: 11.1, supported: true },
  DataPackageKitObject: { order: 11.2, supported: true },
  DataKitObjectTemplate: { order: 12, supported: true },
  DataKitObjectDependency: { order: 12.1, supported: true },
  DataObjectBuildOrgTemplate: { order: 12.2, supported: true },
  DataSourceBundleDefinition: { order: 12.3, supported: true },
  DataSrcDataModelFieldMap: { order: 16, supported: true },
  FieldSrcTrgtRelationship: { order: 16.1, supported: true },
  ObjectSourceTargetMap: { order: 16.2, supported: true },
  MktCalcInsightObjectDef: { order: 30, supported: true },
  // Confirmed live, twice, with two different real segments: retrieve() never populates the
  // required includeCriteria field (the returned marketSegmentDefinition XML only ever has
  // masterLabel/segmentOn/segmentType), yet deploy() rejects it with "Provide a valid
  // IncludeCriteria value" every time - a genuine Metadata API round-trip gap for this type, not
  // something this app's retrieve call can work around, since the data it needs was never in the
  // response to begin with.
  MarketSegmentDefinition: { order: 41, supported: false, reason: 'Confirmed live: retrieve() never includes the required includeCriteria field, so deploy() always rejects it with "Provide a valid IncludeCriteria value" - a genuine Metadata API gap for this type, not fixable from this app.' },
  ActivationPlatform: { order: 42, supported: true },
  MktDatalakeSrcKeyQualifier: { order: 14, supported: false, reason: 'Not confirmed as an independently deployable Metadata API type in Salesforce\'s Data 360 Metadata Types reference - shown for visibility only.' },
  OmniDataTransform: { order: 15, supported: false, reason: 'Not confirmed as an independently deployable Metadata API type in Salesforce\'s Data 360 Metadata Types reference - shown for visibility only.' },
  DataCalcInsightTemplate: { order: 31, supported: false, reason: 'Not confirmed as an independently deployable Metadata API type in Salesforce\'s Data 360 Metadata Types reference - shown for visibility only.' },
  ActivationPlatformField: { order: 43, supported: false, reason: 'Child of Activation Platform - deploys as part of its parent, not independently selectable.' },
  ActivationPlatformActvAttr: { order: 44, supported: false, reason: 'Child of Activation Platform - deploys as part of its parent, not independently selectable.' },
  // Confirmed via Salesforce's own Metadata API reference page for this exact type: "For internal
  // use only." Real (it can appear in metadata.describe()), but not something Salesforce supports
  // customers deploying via package.xml - this is what backs a File Upload (or similar) Data
  // Stream's connector, and is why deploying a File-Upload-sourced Data Stream fails looking for
  // it in the target org. The connector has to be manually recreated there first - a genuine
  // platform limitation (confirmed live), not a gap in this tool.
  InternalDataConnector: { order: 8, supported: false, reason: 'Salesforce\'s own Metadata API reference marks this type "For internal use only" - it backs Data Stream connectors (e.g. File Upload) but isn\'t deployable via package.xml. Recreate the connector manually in the target org first, under the same name, then it will already exist when the Data Stream deploys.' }
};

// Data Model Objects (DMOs, __dlm-suffixed) are deployable via the standard, universal
// CustomObject Metadata API type - confirmed live: a Data Kit deploy failed looking for "no
// CustomObject named X__dlm found" until the matching CustomObject was included, and once
// added it (and its fields) deployed successfully. However conn.metadata.list([{type:
// 'CustomObject'}]) does NOT enumerate them at all (confirmed live: 1408 CustomObject entries
// returned for a real org, zero ending in __dlm) - DMOs are apparently excluded from that
// listMetadata() enumeration even though retrieve()/deploy() accept them fine when named
// explicitly. So the list of names has to come from the SSOT REST API instead (the same
// fetchDataModelObjects() the Org Scanner already uses) - confirmed its `name` field is exactly
// the __dlm-suffixed API name deploy() expects, e.g. "ConfluenceAPI_ConfluencePage_15CB073__dlm".
async function fetchDlmCustomObjects(onProgress?: ScanProgress): Promise<DataCloudMetadataItem[]> {
  const dmos = await fetchDataModelObjects(onProgress);
  return dmos.map((o) => ({ name: o.name, displayName: o.displayName }));
}

// Lists every Metadata-API-discovered Data Cloud component (the same discovery already used by
// the Org Scanner), annotated with real support-for-packaging status. Deliberately does NOT
// include DLOs/Segments/Identity Resolution fetched via the separate SSOT REST API earlier
// in this file - those were never confirmed as the same deployable surface, so they're excluded
// here rather than guessed at. DMOs are the one exception - added below via the real CustomObject
// type, once confirmed deployable that way (see fetchDlmCustomObjects).
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

  try {
    const dlmItems = await fetchDlmCustomObjects(onProgress);
    onProgress?.(`✓ Data Model Objects (Metadata API) (${dlmItems.length.toLocaleString()})`);
    results.push({
      xmlName: 'CustomObject',
      category: 'Data Model Objects (Metadata API)',
      order: 20,
      supported: true,
      items: dlmItems.map((it) => ({ fullName: it.name, label: it.displayName || it.name }))
    });
  } catch (e) {
    onProgress?.(`Data Model Objects (Metadata API): failed to list - ${e instanceof Error ? e.message : String(e)}`);
  }

  return results.sort((a, b) => a.order - b.order);
}

// ==================== Deploy via Data Kit ====================
// A Data Kit (DataPackageKitDefinition) must already be authored by hand in Data Cloud Setup's
// Data Kit Studio UI - confirmed via Salesforce's own CLI deployment guide, there is no API to
// create one or add a component to one from scratch. What IS a real, documented API is fetching
// the already-computed manifest for an EXISTING Data Kit (Data 360 Connect REST API's "Data Kits"
// endpoint, referenced directly from Salesforce's official CLI deploy guide), which avoids ever
// having to reverse-engineer DataKitObjectTemplate's internal entityPayload format ourselves.

export interface DataKitSummary { name: string; label: string; description?: string }

// Lists Data Kits already authored in the connected org via the standard Metadata API list()/
// read() calls - same mechanism used for every other component type in this file, just for the
// DataPackageKitDefinition type specifically.
export async function listDataKits(onProgress?: ScanProgress): Promise<DataKitSummary[]> {
  const conn = getActiveConnection();
  onProgress?.('Listing Data Kits...');
  const listed = await conn.metadata.list([{ type: 'DataPackageKitDefinition' }]);
  const arr: any[] = Array.isArray(listed) ? listed : listed ? [listed] : [];
  if (arr.length === 0) return [];

  const fullNames = arr.map((f) => f.fullName).filter(Boolean);
  const batches: string[][] = [];
  for (let i = 0; i < fullNames.length; i += 10) batches.push(fullNames.slice(i, i + 10));
  const settled = await Promise.allSettled(batches.map((b) => conn.metadata.read('DataPackageKitDefinition', b)));
  const detailByName = new Map<string, any>();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    const readArr: any[] = Array.isArray(r.value) ? r.value : r.value ? [r.value] : [];
    for (const rec of readArr) if (rec?.fullName) detailByName.set(rec.fullName, rec);
  }
  onProgress?.(`✓ Found ${arr.length} Data Kit(s).`);
  return arr.map((f) => {
    const detail = detailByName.get(f.fullName) ?? {};
    return { name: f.fullName, label: detail.masterLabel || f.fullName, description: detail.description };
  });
}

// Extracts {xmlName, members}[] from a parsed package.xml-shaped object, however it got there -
// tolerates both the raw <Package><types>... XML shape (via xml2js) and a plain JS object with
// the same field names, since which one the manifest endpoint actually returns wasn't confirmed
// from docs alone (the Connect API reference page is a JS-rendered spec viewer that couldn't be
// fetched as static content).
function extractSelectionsFromPackageLike(pkg: any): PackageComponentSelection[] {
  const types = pkg?.types;
  const typesArr: any[] = Array.isArray(types) ? types : types ? [types] : [];
  return typesArr
    .map((t: any) => ({
      xmlName: Array.isArray(t?.name) ? t.name[0] : t?.name,
      members: (Array.isArray(t?.members) ? t.members : t?.members ? [t.members] : []).map((m: any) => String(m))
    }))
    .filter((s: PackageComponentSelection) => !!s.xmlName && s.members.length > 0);
}

// Fetches the real, Salesforce-computed manifest for a single Data Kit - GET /services/data/
// v{version}/ssot/datakit/{dataKitDevName}/manifest, a documented Data 360 Connect REST API
// endpoint (confirmed via Salesforce's official "Use CLI to Deploy Changes from a Sandbox to
// Data 360" guide, which links directly to this endpoint's Connect API spec entry as the
// programmatic alternative to clicking "Download Manifest" in the Data Kit Studio UI). Salesforce
// computes the kit's full component membership server-side, so this code never has to guess at
// cross-references between the six Data Kit metadata types.
//
// The response's exact body shape (raw package.xml text vs. a JSON envelope) could not be
// confirmed from docs alone - the Connect API reference is a JS-rendered spec viewer this app
// can't statically fetch. Handled defensively: detect XML vs JSON from the first non-whitespace
// character, try the plausible JSON shapes (a top-level {types:[...]} object, or a nested
// {manifest: "<Package>...</Package>"} string), and if truly unrecognized, surface the raw body
// in the thrown error (which flows into this app's downloadable deploy log) rather than silently
// guessing further.
export async function getDataKitManifestSelections(dataKitDevName: string, onProgress?: ScanProgress): Promise<PackageComponentSelection[]> {
  const conn = getActiveConnection();
  onProgress?.(`Fetching manifest for Data Kit "${dataKitDevName}"...`);
  const url = `${conn.instanceUrl}/services/data/${SSOT_API_VERSION}/ssot/datakit/${encodeURIComponent(dataKitDevName)}/manifest`;
  // Confirmed live (twice): this endpoint only returns Data Cloud's own internal
  // {dataKitMembers: [...]} member-listing JSON, never a package.xml manifest - asking for XML
  // via Accept was tried and rejected outright with HTTP 406 NOT_ACCEPTABLE, so this genuinely
  // is the only format available, not something content negotiation can change.
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${conn.accessToken}` } });
  const bodyText = await resp.text();
  if (!resp.ok) {
    throw new Error(`Failed to fetch Data Kit manifest (HTTP ${resp.status}): ${bodyText.slice(0, 500)}`);
  }

  const xml2js = await import('xml2js');
  const trimmed = bodyText.trim();
  let selections: PackageComponentSelection[] = [];

  if (trimmed.startsWith('<')) {
    const parsed = await xml2js.parseStringPromise(trimmed, { explicitArray: true });
    selections = extractSelectionsFromPackageLike(parsed?.Package);
  } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const json = JSON.parse(trimmed);
    const obj = Array.isArray(json) ? json[0] : json;
    if (typeof obj?.manifest === 'string') {
      const parsed = await xml2js.parseStringPromise(obj.manifest, { explicitArray: true });
      selections = extractSelectionsFromPackageLike(parsed?.Package);
    } else if (obj?.Package) {
      selections = extractSelectionsFromPackageLike(obj.Package);
    } else if (Array.isArray(obj?.types)) {
      selections = extractSelectionsFromPackageLike(obj);
    } else if (Array.isArray(obj?.dataKitMembers)) {
      throw new Error('This endpoint returned Data Cloud\'s internal "dataKitMembers" member-listing format (confirmed live), not a package.xml manifest as expected - there is no documented, safe way to convert that format into deployable Metadata API component names, so this can\'t be automated without risking an incorrect deploy. Use "Select Individual Components" instead for this Data Stream and its dependencies.');
    } else {
      throw new Error(`Data Kit manifest response had an unrecognized JSON shape (no "manifest", "Package", "types", or "dataKitMembers" field) - raw body: ${trimmed.slice(0, 800)}`);
    }
  } else {
    throw new Error(`Data Kit manifest response was neither XML nor JSON - raw body: ${trimmed.slice(0, 500)}`);
  }

  if (selections.length === 0) {
    throw new Error(`Data Kit manifest parsed but yielded no usable component types - raw body: ${trimmed.slice(0, 800)}`);
  }
  const totalMembers = selections.reduce((sum, s) => sum + s.members.length, 0);
  onProgress?.(`✓ Manifest resolved - ${selections.length} component type(s), ${totalMembers} member(s) total.`);
  return selections;
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
    // singlePackage: true here must match deployMetadataPackage()'s singlePackage: true below -
    // it controls whether the returned zip has package.xml at the root (true) or wrapped in a
    // per-package subfolder like "unpackaged/" (false, the API default). Without this, retrieve()
    // returns a wrapped zip while deploy() expects a flat one, so Salesforce rejects the deploy
    // with "No package.xml found" even though the zip clearly contains one.
    singlePackage: true,
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

export interface DeployComponentFailure {
  fullName: string; componentType?: string; problemType?: string; problem?: string;
  fileName?: string; lineNumber?: number; columnNumber?: number;
}
export interface DeployOutcome {
  id: string; done: boolean; success: boolean; status: string;
  numberComponentsDeployed: number; numberComponentsTotal: number; numberComponentErrors: number;
  checkOnly: boolean; errorMessage?: string;
  componentFailures: DeployComponentFailure[];
}

// Salesforce's own DeployMessage schema (confirmed via jsforce's bundled Metadata API WSDL/type
// defs) has more diagnostic fields than fullName/componentType/problem - fileName, problemType,
// lineNumber, columnNumber - all useful for troubleshooting exactly which referenced dependency
// is missing (e.g. "no MktDataTranObject named X found"), so all of them are kept rather than
// discarded, for the downloadable deploy log.
function mapComponentFailures(raw: any[]): DeployComponentFailure[] {
  return (raw ?? []).map((f: any) => ({
    fullName: f.fullName, componentType: f.componentType, problemType: f.problemType, problem: f.problem,
    fileName: f.fileName, lineNumber: f.lineNumber, columnNumber: f.columnNumber
  }));
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
  const locator = targetConn.metadata.deploy(zipBuffer, { checkOnly, rollbackOnError: true, singlePackage: true, testLevel: 'RunLocalTests' });
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
        componentFailures: mapComponentFailures(status.details?.componentFailures)
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

