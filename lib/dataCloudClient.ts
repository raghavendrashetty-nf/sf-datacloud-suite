// Server-side only. Data Cloud (Data 360) specific configuration scanning - separate from the
// generic Salesforce object/field metadata already covered by salesforceClient.ts.
import { getActiveConnection, describeObjectFields } from './salesforceClient';

export interface DataCloudMetadataItem {
  name: string;
  displayName?: string;
  [key: string]: unknown;
}

// Runs `items.map(fn)` in fixed-size batches (sequential across batches, parallel within one) -
// used both for Metadata API read() calls (Salesforce caps most types at 10 components per
// call) and for per-object describe() enrichment, so a handful of failures don't take down
// the whole batch and we don't fire off hundreds of concurrent requests at once.
async function mapInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    results.push(...settled);
  }
  return results;
}

// The exact response envelope for these Connect REST endpoints isn't confirmed from docs
// alone, so unwrap defensively rather than assuming one specific shape.
function extractArray(json: unknown): DataCloudMetadataItem[] {
  if (Array.isArray(json)) return json as DataCloudMetadataItem[];
  if (json && typeof json === 'object') {
    for (const key of ['data', 'segments', 'identityResolutions', 'records', 'value', 'items']) {
      const v = (json as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v as DataCloudMetadataItem[];
    }
  }
  return [];
}

// DMOs and DLOs are exposed as regular describable sObjects on the core org, suffixed __dlm
// (Data Model Object) and __dll (Data Lake Object) respectively. Reuses the same
// describeGlobal()/describeObjectFields() calls already proven reliable for Data Readiness -
// no separate Data Cloud tenant/token needed. Enriches each object with its field list so
// there's enough detail here for a future credit-consumption estimate (row/field counts).
async function fetchSObjectsBySuffix(suffix: '__dlm' | '__dll'): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  const describe = await conn.describeGlobal();
  const raw: any[] = describe?.sobjects ?? [];
  const matches = raw.filter((s) => typeof s?.name === 'string' && s.name.endsWith(suffix));
  const withFields = await mapInBatches(matches, 10, async (s) => {
    const fields = await describeObjectFields(s.name);
    return { name: s.name, displayName: s.label || s.name, custom: !!s.custom, keyPrefix: s.keyPrefix, fieldCount: fields.length, fields: fields.map((f) => f.name) };
  });
  return withFields.map((r, i) => r.status === 'fulfilled' ? r.value : { name: matches[i].name, displayName: matches[i].label || matches[i].name, fieldsError: r.reason instanceof Error ? r.reason.message : String(r.reason) });
}

// Segments and Identity Resolution rulesets live on the core org's own REST API
// (Data 360 Connect API), not a separate Data Cloud tenant - no token exchange needed.
async function fetchSegments(): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  const result = await conn.requestGet('/services/data/v59.0/ssot/segments');
  return extractArray(result);
}

async function fetchIdentityResolutionRulesets(): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  const result = await conn.requestGet('/services/data/v59.0/ssot/identity-resolutions');
  return extractArray(result);
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

async function discoverDataCloudMetadataTypes(): Promise<DiscoveredMetadataType[]> {
  const conn = getActiveConnection();
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
async function fetchMetadataComponentsWithDetail(type: string): Promise<DataCloudMetadataItem[]> {
  const conn = getActiveConnection();
  const listed = await conn.metadata.list([{ type }]);
  const arr: any[] = Array.isArray(listed) ? listed : listed ? [listed] : [];
  if (arr.length === 0) return [];

  const fullNames = arr.map((f) => f.fullName).filter(Boolean);
  const detailByName = new Map<string, any>();
  const batches: string[][] = [];
  for (let i = 0; i < fullNames.length; i += 10) batches.push(fullNames.slice(i, i + 10));
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
  ActivationPlatformActvAttr: { label: 'Activation Platform Attributes', order: 44 }
};
const UNKNOWN_ORDER = 900;

export async function runOrgScan(): Promise<ScanCategoryResult[]> {
  const fixedTasks: { key: string; run: () => Promise<DataCloudMetadataItem[]> }[] = [
    { key: '__dlm', run: () => fetchSObjectsBySuffix('__dlm') },
    { key: '__dll', run: () => fetchSObjectsBySuffix('__dll') },
    { key: 'segments', run: fetchSegments },
    { key: 'identityResolution', run: fetchIdentityResolutionRulesets }
  ];
  const settledFixed = await Promise.allSettled(fixedTasks.map((t) => t.run()));
  const results: InternalScanResult[] = settledFixed.map((r, i) => {
    const meta = CATEGORY_META[fixedTasks[i].key];
    return r.status === 'fulfilled'
      ? { category: meta.label, order: meta.order, status: 'ok' as const, items: r.value }
      : { category: meta.label, order: meta.order, status: 'error' as const, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  });

  try {
    const discovered = await discoverDataCloudMetadataTypes();
    // Child types (e.g. ActivationPlatformField is a child of ActivationPlatform) generally
    // can't be listed standalone - skip the call entirely rather than show a false "(0)",
    // and point at the parent instead, since its full detail (already fetched via read()) is
    // where this data actually lives.
    const topLevel = discovered.filter((d) => !d.parentXmlName);
    const childOnly = discovered.filter((d) => d.parentXmlName);

    const settledDiscovered = await Promise.allSettled(topLevel.map((d) => fetchMetadataComponentsWithDetail(d.xmlName)));
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

  return results
    .sort((a, b) => a.order - b.order || a.category.localeCompare(b.category))
    .map(({ order, ...rest }) => rest);
}
