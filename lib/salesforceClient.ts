// Server-side only. Uses jsforce v3.
import type {
  CheckKey, CheckResult, FieldType, SFConnectionConfig, ConnectionInfo,
  DuplicateResult, NullResult, CompletenessResult, DistributionResult,
  FormatResult, RefIntegrityResult
} from './dataReadiness';
import { pickSeverity, fmtNum, fmtPct, guessParentObject } from './dataReadiness';

declare global {
  // eslint-disable-next-line no-var
  var __sfCache: {
    conn: any | null;
    info: ConnectionInfo | null;
    config: SFConnectionConfig | null;
    objectListCache: { at: number; items: SObjectListItem[] } | null;
    fieldsCache: Record<string, { at: number; fields: SFieldListItem[] }>;
  } | undefined;
}

if (!globalThis.__sfCache) {
  globalThis.__sfCache = { conn: null, info: null, config: null, objectListCache: null, fieldsCache: {} };
}
const cache = globalThis.__sfCache!;

function domainToLoginUrl(domain: string): string {
  if (/^https?:\/\//i.test(domain)) return domain;
  if (domain === 'test' || domain === 'sandbox') return 'https://test.salesforce.com';
  return 'https://login.salesforce.com';
}

// ---------------- Connection ----------------

export async function setConnection(config: SFConnectionConfig): Promise<ConnectionInfo> {
  const jsforce: any = await import('jsforce');
  const Connection = jsforce.Connection ?? jsforce.default?.Connection;
  const conn = new Connection({ loginUrl: domainToLoginUrl(config.domain), instanceUrl: config.instanceUrl, version: '59.0' });
  const password = (config.password || '') + (config.securityToken || '');
  const userInfo = await conn.login(config.username, password);

  let organizationName = '', isSandbox = false;
  try {
    const org = await conn.query('SELECT Id, Name, IsSandbox, InstanceName FROM Organization LIMIT 1');
    if (org.records?.[0]) { organizationName = org.records[0].Name || ''; isSandbox = !!org.records[0].IsSandbox; }
  } catch {}

  let displayName = '';
  try {
    const u = await conn.query(`SELECT Name FROM User WHERE Id = '${userInfo.id}' LIMIT 1`);
    if (u.records?.[0]) displayName = u.records[0].Name || '';
  } catch {}

  const info: ConnectionInfo = {
    connected: true, username: config.username, displayName,
    organizationId: userInfo.organizationId, organizationName,
    instanceUrl: conn.instanceUrl, isSandbox, apiVersion: conn.version,
    connectedAt: new Date().toISOString()
  };
  cache.conn = conn; cache.info = info; cache.config = config;
  cache.objectListCache = null; cache.fieldsCache = {};
  return info;
}

export function getConnectionInfo(): ConnectionInfo {
  if (cache.conn && cache.info) return cache.info;
  return { connected: false };
}
export function clearConnection() {
  cache.conn = null; cache.info = null; cache.config = null;
  cache.objectListCache = null; cache.fieldsCache = {};
}
function ensureConn(): any {
  if (!cache.conn) throw new Error('Not connected to Salesforce. Save a connection first.');
  return cache.conn;
}

// ---------------- Metadata ----------------

export interface SObjectListItem {
  name: string; label: string; labelPlural?: string; keyPrefix?: string;
  custom: boolean; queryable: boolean; createable?: boolean; updateable?: boolean;
}
export interface SFieldListItem {
  name: string; label: string; type: string; mappedType: FieldType;
  length?: number; referenceTo?: string[]; picklistCount?: number;
  nillable?: boolean; custom: boolean; externalId?: boolean; unique?: boolean;
}

const OBJECT_TTL_MS = 5 * 60 * 1000;
const FIELD_TTL_MS  = 5 * 60 * 1000;

function mapSFTypeToInternal(sfType: string): FieldType {
  const t = (sfType || '').toLowerCase();
  if (t === 'id' || t === 'reference') return 'reference';
  if (t === 'email') return 'email';
  if (t === 'phone') return 'phone';
  if (t === 'url') return 'url';
  if (t === 'picklist' || t === 'multipicklist' || t === 'combobox') return 'picklist';
  if (t === 'boolean' || t === 'checkbox') return 'boolean';
  if (t === 'date' || t === 'datetime' || t === 'time') return 'date';
  if (t === 'currency') return 'currency';
  if (t === 'int' || t === 'integer') return 'int';
  if (t === 'double' || t === 'percent') return 'number';
  if (t === 'textarea' || t === 'encryptedstring' || t === 'address' || t === 'complexvalue' || t === 'anytype') return 'text';
  return 'string';
}

export async function listObjects(opts: { includeAll?: boolean } = {}): Promise<SObjectListItem[]> {
  const conn = ensureConn();
  const now = Date.now();
  if (cache.objectListCache && (now - cache.objectListCache.at) < OBJECT_TTL_MS) return cache.objectListCache.items;
  const describe = await conn.describeGlobal();
  const raw: any[] = describe.sobjects ?? [];
  const items: SObjectListItem[] = raw
    .filter((s) => opts.includeAll ? true : (s.queryable && !s.deprecatedAndHidden))
    .map((s) => ({
      name: s.name, label: s.label || s.name, labelPlural: s.labelPlural,
      keyPrefix: s.keyPrefix, custom: !!s.custom, queryable: !!s.queryable,
      createable: !!s.createable, updateable: !!s.updateable
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  cache.objectListCache = { at: now, items };
  return items;
}

export async function describeObjectFields(object: string): Promise<SFieldListItem[]> {
  const conn = ensureConn();
  const now = Date.now();
  const cached = cache.fieldsCache[object];
  if (cached && (now - cached.at) < FIELD_TTL_MS) return cached.fields;
  const meta = await conn.sobject(object).describe();
  const rawFields: any[] = meta.fields ?? [];
  const fields: SFieldListItem[] = rawFields
    .map((f) => ({
      name: f.name, label: f.label || f.name, type: f.type,
      mappedType: mapSFTypeToInternal(f.type), length: f.length,
      referenceTo: f.referenceTo, picklistCount: f.picklistValues?.length,
      nillable: f.nillable, custom: !!f.custom, externalId: !!f.externalId, unique: !!f.unique
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  cache.fieldsCache[object] = { at: now, fields };
  return fields;
}

// ---------------- Backend logger helper ----------------

class BackendLogger {
  private entries: string[] = [];
  private t0: number;
  constructor() { this.t0 = Date.now(); }
  log(msg: string) {
    const dt = Date.now() - this.t0;
    this.entries.push(`[+${String(dt).padStart(6, ' ')} ms] ${msg}`);
  }
  toArray(): string[] { return this.entries.slice(); }
}

// ---------------- Full-table iteration helpers ----------------

/**
 * Iterate every record of a NON-AGGREGATE SOQL query using jsforce queryMore
 * pagination. Do NOT pass an aggregate query (GROUP BY / COUNT / HAVING) here -
 * Salesforce does not support queryMore() on aggregate results.
 */
async function* iterateQuery(query: string, log?: BackendLogger): AsyncGenerator<any> {
  const conn = ensureConn();
  log?.log(`SOQL page 1: ${query}`);
  let r = await conn.query(query);
  let pageNum = 1;
  let totalYielded = 0;
  for (const rec of r.records ?? []) { yield rec; totalYielded++; }
  while (!r.done && r.nextRecordsUrl) {
    pageNum++;
    log?.log(`queryMore page ${pageNum} (yielded so far: ${totalYielded})`);
    r = await conn.queryMore(r.nextRecordsUrl);
    for (const rec of r.records ?? []) { yield rec; totalYielded++; }
  }
  log?.log(`Iteration complete after ${pageNum} page${pageNum === 1 ? '' : 's'}, ${totalYielded} record${totalYielded === 1 ? '' : 's'} yielded.`);
}

async function countAll(object: string, log?: BackendLogger): Promise<number> {
  const q = `SELECT COUNT() FROM ${object}`;
  log?.log(`Count query: ${q}`);
  const conn = ensureConn();
  const r = await conn.query(q);
  log?.log(`  -> totalSize = ${r.totalSize}`);
  return r.totalSize ?? 0;
}

async function countNull(object: string, field: string, log?: BackendLogger): Promise<number> {
  const q = `SELECT COUNT() FROM ${object} WHERE ${field} = NULL`;
  log?.log(`Count NULL query: ${q}`);
  const conn = ensureConn();
  const r = await conn.query(q);
  log?.log(`  -> totalSize = ${r.totalSize}`);
  return r.totalSize ?? 0;
}

/**
 * In Salesforce SOQL, `field = ''` on most text fields returns the SAME rows
 * as `field = NULL` (SF stores empty strings as NULL). We report the literal
 * empty-string count SEPARATELY without adding it to nullCount.
 */
async function countEmptyString(object: string, field: string, fieldType: FieldType, log?: BackendLogger): Promise<number> {
  const textLike: FieldType[] = ['string', 'email', 'phone', 'url', 'text'];
  if (!textLike.includes(fieldType)) { log?.log('Empty-string check skipped (non-text field)'); return 0; }
  const q = `SELECT COUNT() FROM ${object} WHERE ${field} = ''`;
  log?.log(`Empty-string count query: ${q}`);
  const conn = ensureConn();
  try {
    const r = await conn.query(q);
    log?.log(`  -> totalSize = ${r.totalSize} (note: SF stores empty as NULL, so this is usually 0)`);
    return r.totalSize ?? 0;
  } catch (e: any) {
    log?.log(`  -> query failed (${e?.message ?? e}); reporting 0`);
    return 0;
  }
}

// ---------------- Check runners ----------------

/**
 * Duplicate check - FIXED for Salesforce's aggregate queryMore restriction.
 *
 * Salesforce does NOT support queryMore() on aggregate queries (GROUP BY,
 * COUNT, HAVING). Instead we iterate every non-NULL value using a regular
 * SELECT with ORDER BY Id (which DOES support queryMore()), build a frequency
 * Map in memory, then derive duplicates.
 */
async function runDuplicate(object: string, field: string, fieldType: FieldType): Promise<DuplicateResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Duplicate check on ${object}.${field} (type=${fieldType})`);
  log.log(`NOTE: Salesforce does not support queryMore() on aggregate queries. Using non-aggregate SELECT + in-memory grouping.`);

  const total = await countAll(object, log);

  const iterQuery = `SELECT ${field} FROM ${object} WHERE ${field} != NULL ORDER BY Id`;
  log.log(`Step 1: iterate all non-NULL values via queryMore (non-aggregate query)`);
  log.log(`  ${iterQuery}`);

  const freq = new Map<string, number>();
  let scanned = 0;
  for await (const rec of iterateQuery(iterQuery, log)) {
    const v = rec[field];
    if (v == null) continue;
    const key = String(v);
    freq.set(key, (freq.get(key) ?? 0) + 1);
    scanned++;
    if (scanned % 100000 === 0) log.log(`  ...scanned ${scanned.toLocaleString()} rows, ${freq.size.toLocaleString()} distinct so far`);
  }
  log.log(`Step 1 complete: scanned ${scanned}, distinct values ${freq.size}`);

  // Compute stats from the map
  let dupGroups = 0;
  let dupRecords = 0;
  const dupList: { value: string; count: number }[] = [];
  for (const [value, count] of freq) {
    if (count > 1) {
      dupGroups += 1;
      dupRecords += count;
      dupList.push({ value, count });
    }
  }
  dupList.sort((a, b) => b.count - a.count);
  const examples = dupList.slice(0, 6);

  const duplicatePercent = total > 0 ? +(100 * dupRecords / total).toFixed(2) : 0;
  log.log(`Duplicate groups: ${dupGroups}, duplicate rows: ${dupRecords}, unique values: ${freq.size}`);
  log.log(`<<< Duplicate check complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'salesforce', checkType: 'duplicate', object, field, fieldType,
    totalRecords: total, scannedRecords: scanned,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: iterQuery, liveConnection: true, fullTableAnalyzed: true,
    duplicateRecords: dupRecords, duplicateGroups: dupGroups,
    uniqueValues: freq.size, duplicatePercent, examples,
    severity: pickSeverity(duplicatePercent),
    headlineMetric: {
      label: 'Duplicate rate', value: fmtPct(duplicatePercent),
      hint: `${fmtNum(dupRecords)} of ${fmtNum(total)} rows share duplicated ${field} values across ${fmtNum(dupGroups)} groups`
    },
    backendLog: log.toArray()
  };
}

async function runNull(object: string, field: string, fieldType: FieldType): Promise<NullResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> NULL/Empty check on ${object}.${field} (type=${fieldType})`);
  log.log(`NOTE: In Salesforce SOQL, empty strings on text fields are stored as NULL. The tool does NOT add nullCount + emptyCount to avoid double-counting.`);

  const total = await countAll(object, log);
  const nullCount = await countNull(object, field, log);
  const emptyStringCount = await countEmptyString(object, field, fieldType, log);
  const populatedCount = Math.max(0, total - nullCount);
  const nullPercent = total > 0 ? +(100 * nullCount / total).toFixed(2) : 0;

  log.log(`Populated = totalRecords (${total}) - NULL (${nullCount}) = ${populatedCount}`);
  log.log(`NULL rate = 100 * ${nullCount} / ${total} = ${nullPercent}%`);
  log.log(`<<< NULL check complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'salesforce', checkType: 'null_empty', object, field, fieldType,
    totalRecords: total, scannedRecords: total,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: `SELECT COUNT() FROM ${object} WHERE ${field} = NULL`,
    liveConnection: true,
    nullCount, emptyCount: emptyStringCount, populatedCount, nullPercent,
    severity: pickSeverity(nullPercent),
    headlineMetric: {
      label: 'NULL / empty rate', value: fmtPct(nullPercent),
      hint: `${fmtNum(nullCount)} of ${fmtNum(total)} rows have no value for ${field}`
    },
    backendLog: log.toArray()
  };
}

async function runCompleteness(object: string, field: string, fieldType: FieldType): Promise<CompletenessResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Completeness check on ${object}.${field}`);
  const total = await countAll(object, log);
  const nullCount = await countNull(object, field, log);
  const emptyStringCount = await countEmptyString(object, field, fieldType, log);
  const missing = nullCount;
  const populated = total - missing;
  const score = total > 0 ? Math.round(100 * populated / total) : 0;
  const severity: 'good' | 'warning' | 'critical' = score >= 90 ? 'good' : score >= 75 ? 'warning' : 'critical';

  log.log(`Score = round(100 * ${populated} / ${total}) = ${score}`);
  log.log(`<<< Completeness check complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'salesforce', checkType: 'completeness', object, field, fieldType,
    totalRecords: total, scannedRecords: total,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: `SELECT COUNT() FROM ${object} WHERE ${field} = NULL`,
    liveConnection: true,
    score, populated, missing, defaulted: 0,
    components: [
      { label: 'Populated', score },
      { label: 'Non-NULL', score: total > 0 ? Math.round(100 * (total - nullCount) / total) : 0 },
      { label: 'Non-empty text', score: total > 0 ? Math.round(100 * (total - emptyStringCount) / total) : 100 }
    ],
    severity,
    headlineMetric: {
      label: 'Completeness score', value: `${score}/100`,
      hint: `${fmtNum(populated)} populated of ${fmtNum(total)}`
    },
    backendLog: log.toArray()
  };
}

async function runDistribution(object: string, field: string, fieldType: FieldType): Promise<DistributionResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Value Distribution on ${object}.${field}`);
  const total = await countAll(object, log);
  const query = `SELECT ${field} v, COUNT(Id) c FROM ${object} WHERE ${field} != NULL GROUP BY ${field} ORDER BY COUNT(Id) DESC LIMIT 10`;
  log.log(`Top-10 query (single-page aggregate, no queryMore needed): ${query}`);
  const conn = ensureConn();
  const topR = await conn.query(query);
  const topValues: { value: string; count: number; percent: number }[] = [];
  for (const row of topR.records ?? []) {
    const c = Number(row.c ?? row.expr0 ?? 0);
    topValues.push({
      value: String(row.v ?? row[field] ?? '(null)'),
      count: c,
      percent: total > 0 ? +(100 * c / total).toFixed(2) : 0
    });
  }
  let cardinality = topValues.length;
  try {
    const cd = await conn.query(`SELECT COUNT_DISTINCT(${field}) c FROM ${object}`);
    cardinality = Number(cd.records?.[0]?.c ?? cd.records?.[0]?.expr0 ?? topValues.length);
    log.log(`Cardinality = ${cardinality}`);
  } catch (e: any) {
    log.log(`COUNT_DISTINCT failed (${e?.message ?? e}); using top-values length as cardinality`);
  }
  const topPct = topValues[0]?.percent ?? 0;
  const severity: 'good' | 'warning' | 'critical' = topPct > 70 ? 'critical' : topPct > 40 ? 'warning' : 'good';
  log.log(`<<< Distribution check complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'salesforce', checkType: 'value_distribution', object, field, fieldType,
    totalRecords: total, scannedRecords: total,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: query, liveConnection: true,
    cardinality, topValues, severity,
    headlineMetric: {
      label: 'Distinct values', value: fmtNum(cardinality),
      hint: `Top value covers ${fmtPct(topPct)} of rows`
    },
    backendLog: log.toArray()
  };
}

async function runFormatValidation(object: string, field: string, fieldType: FieldType): Promise<FormatResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  const kind: 'email' | 'phone' | 'url' = fieldType === 'email' ? 'email' : fieldType === 'phone' ? 'phone' : 'url';
  log.log(`>>> Format check (${kind}) on ${object}.${field}`);
  const total = await countAll(object, log);

  const query = `SELECT ${field} FROM ${object} WHERE ${field} != NULL ORDER BY Id`;
  log.log(`Iterating all populated rows via queryMore (no LIMIT applied, non-aggregate query)`);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^[+()\-\s\d]{7,}$/;
  const URL_RE = /^https?:\/\/[^\s]+$/i;
  const isValid = (v: string) => kind === 'email' ? EMAIL_RE.test(v) : kind === 'phone' ? PHONE_RE.test(v) : URL_RE.test(v);

  let validCount = 0;
  let invalidCount = 0;
  const invalidSamples: string[] = [];
  let scanned = 0;

  for await (const rec of iterateQuery(query, log)) {
    const v = String(rec[field] ?? '');
    if (!v) continue;
    scanned++;
    if (isValid(v)) validCount++;
    else {
      invalidCount++;
      if (invalidSamples.length < 6) invalidSamples.push(v);
    }
    if (scanned % 100000 === 0) log.log(`  ...scanned ${scanned.toLocaleString()}, invalid ${invalidCount.toLocaleString()}`);
  }
  const invalidPercent = scanned > 0 ? +(100 * invalidCount / scanned).toFixed(2) : 0;
  log.log(`Scanned ${scanned} populated rows. Valid=${validCount}, Invalid=${invalidCount} (${invalidPercent}%)`);
  log.log(`<<< Format check complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'salesforce', checkType: 'format_validation', object, field, fieldType,
    totalRecords: total, scannedRecords: scanned,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: query, liveConnection: true, fullTableAnalyzed: true,
    formatKind: kind, validCount, invalidCount, invalidPercent,
    invalidExamples: invalidSamples,
    severity: pickSeverity(invalidPercent),
    headlineMetric: {
      label: `Invalid ${kind}s`, value: fmtPct(invalidPercent),
      hint: `${fmtNum(invalidCount)} of ${fmtNum(scanned)} populated values fail format check`
    },
    backendLog: log.toArray()
  };
}

/**
 * Referential integrity - also FIXED for the aggregate queryMore restriction.
 * Iterates all FK values via non-aggregate SELECT and dedupes in memory.
 */
async function runRefIntegrity(object: string, field: string, fieldType: FieldType): Promise<RefIntegrityResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Referential Integrity on ${object}.${field}`);
  const conn = ensureConn();
  const total = await countAll(object, log);

  let parent = guessParentObject(field, object);
  try {
    const desc = await conn.sobject(object).describe();
    const fdef = (desc.fields ?? []).find((f: any) => f.name === field);
    if (fdef?.referenceTo?.[0]) {
      parent = fdef.referenceTo[0];
      log.log(`Parent from describe(): ${parent}`);
    }
  } catch (e: any) {
    log.log(`Describe failed, guessed parent ${parent} (${e?.message ?? e})`);
  }

  const iterQuery = `SELECT ${field} FROM ${object} WHERE ${field} != NULL ORDER BY Id`;
  log.log(`Step 1: iterate all FK values via queryMore, dedupe in memory (non-aggregate query)`);
  const distinct = new Set<string>();
  let scanned = 0;
  for await (const rec of iterateQuery(iterQuery, log)) {
    const v = rec[field];
    if (v != null) distinct.add(String(v));
    scanned++;
    if (scanned % 100000 === 0) log.log(`  ...scanned ${scanned.toLocaleString()}, distinct ${distinct.size.toLocaleString()}`);
  }
  const distinctIds = Array.from(distinct);
  log.log(`Step 1 complete: ${distinctIds.length} distinct FK ids`);

  const CHUNK = 500;
  const existing = new Set<string>();
  for (let i = 0; i < distinctIds.length; i += CHUNK) {
    const chunk = distinctIds.slice(i, i + CHUNK);
    const idsClause = chunk.map((id) => `'${id.replace(/'/g, "\\'")}'`).join(',');
    log.log(`Step 2 chunk ${Math.floor(i / CHUNK) + 1}: parent existence for ${chunk.length} ids`);
    const r = await conn.query(`SELECT Id FROM ${parent} WHERE Id IN (${idsClause})`);
    for (const rec of r.records ?? []) if (rec.Id) existing.add(String(rec.Id));
  }

  const orphanExamples: string[] = [];
  let orphanCount = 0;
  for (const id of distinctIds) {
    if (!existing.has(id)) {
      orphanCount++;
      if (orphanExamples.length < 6) orphanExamples.push(id);
    }
  }
  const orphanPercent = distinctIds.length > 0 ? +(100 * orphanCount / distinctIds.length).toFixed(2) : 0;
  log.log(`Result: ${orphanCount} orphans of ${distinctIds.length} distinct ids (${orphanPercent}%)`);
  log.log(`<<< RefIntegrity check complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'salesforce', checkType: 'referential_integrity', object, field, fieldType,
    totalRecords: total, scannedRecords: distinctIds.length,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: iterQuery, liveConnection: true, fullTableAnalyzed: true,
    totalReferences: total, orphanCount, orphanPercent, orphanExamples,
    severity: pickSeverity(orphanPercent),
    headlineMetric: {
      label: 'Orphan references', value: fmtPct(orphanPercent),
      hint: `${fmtNum(orphanCount)} of ${fmtNum(distinctIds.length)} distinct ids point to missing parents in ${parent}`
    },
    backendLog: log.toArray()
  };
}

export async function runCheck(checkType: CheckKey, object: string, field: string, fieldType: FieldType): Promise<CheckResult> {
  switch (checkType) {
    case 'duplicate':             return runDuplicate(object, field, fieldType);
    case 'null_empty':            return runNull(object, field, fieldType);
    case 'completeness':          return runCompleteness(object, field, fieldType);
    case 'value_distribution':    return runDistribution(object, field, fieldType);
    case 'format_validation':     return runFormatValidation(object, field, fieldType);
    case 'referential_integrity': return runRefIntegrity(object, field, fieldType);
  }
}