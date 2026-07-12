// Server-side only - do not import in client components.
import type {
  CheckKey, CheckResult, FieldType, SFConnectionConfig, ConnectionInfo,
  DuplicateResult, NullResult, CompletenessResult, DistributionResult,
  FormatResult, RefIntegrityResult
} from './dataReadiness';
import { pickSeverity, fmtNum, fmtPct, guessParentObject } from './dataReadiness';

// Persist across Next.js hot reloads by attaching to globalThis.
declare global {
  // eslint-disable-next-line no-var
  var __sfCache: {
    conn: any | null;
    info: ConnectionInfo | null;
    config: SFConnectionConfig | null;
  } | undefined;
}

if (!globalThis.__sfCache) {
  globalThis.__sfCache = { conn: null, info: null, config: null };
}
const cache = globalThis.__sfCache!;

function domainToLoginUrl(domain: string): string {
  if (/^https?:\/\//i.test(domain)) return domain;
  if (domain === 'test' || domain === 'sandbox') return 'https://test.salesforce.com';
  return 'https://login.salesforce.com';
}

export async function setConnection(config: SFConnectionConfig): Promise<ConnectionInfo> {
  const jsforce: any = await import('jsforce');
  const Connection = jsforce.Connection ?? jsforce.default?.Connection;
  const loginUrl = domainToLoginUrl(config.domain);

  const conn = new Connection({
    loginUrl,
    instanceUrl: config.instanceUrl,
    version: '59.0'
  });

  const password = (config.password || '') + (config.securityToken || '');
  const userInfo = await conn.login(config.username, password);

  // Fetch org details
  let organizationName = '', isSandbox = false;
  try {
    const org = await conn.query('SELECT Id, Name, IsSandbox, InstanceName FROM Organization LIMIT 1');
    if (org.records?.[0]) {
      organizationName = org.records[0].Name || '';
      isSandbox = !!org.records[0].IsSandbox;
    }
  } catch {}

  // Fetch user display name
  let displayName = '';
  try {
    const u = await conn.query(`SELECT Name FROM User WHERE Id = '${userInfo.id}' LIMIT 1`);
    if (u.records?.[0]) displayName = u.records[0].Name || '';
  } catch {}

  const info: ConnectionInfo = {
    connected: true,
    username: config.username,
    displayName,
    organizationId: userInfo.organizationId,
    organizationName,
    instanceUrl: conn.instanceUrl,
    isSandbox,
    apiVersion: conn.version,
    connectedAt: new Date().toISOString()
  };

  cache.conn = conn;
  cache.info = info;
  cache.config = config;
  return info;
}

export function getConnectionInfo(): ConnectionInfo {
  if (cache.conn && cache.info) return cache.info;
  return { connected: false };
}

export function clearConnection() {
  cache.conn = null;
  cache.info = null;
  cache.config = null;
}

function ensureConn(): any {
  if (!cache.conn) throw new Error('Not connected to Salesforce. Save a connection first.');
  return cache.conn;
}

/** Count all records on an object (using COUNT() SOQL). */
async function countAll(object: string): Promise<number> {
  const conn = ensureConn();
  const r = await conn.query(`SELECT COUNT() FROM ${object}`);
  return r.totalSize ?? 0;
}

/** Count rows where field is NULL. */
async function countNull(object: string, field: string): Promise<number> {
  const conn = ensureConn();
  const r = await conn.query(`SELECT COUNT() FROM ${object} WHERE ${field} = NULL`);
  return r.totalSize ?? 0;
}

/** Count rows where field is empty string (only applicable to text-like fields). */
async function countEmpty(object: string, field: string, fieldType: FieldType): Promise<number> {
  const textLike: FieldType[] = ['string', 'email', 'phone', 'url', 'text'];
  if (!textLike.includes(fieldType)) return 0;
  const conn = ensureConn();
  try {
    const r = await conn.query(`SELECT COUNT() FROM ${object} WHERE ${field} = ''`);
    return r.totalSize ?? 0;
  } catch {
    return 0;
  }
}

// ---------- Check runners ----------

async function runDuplicate(object: string, field: string, fieldType: FieldType): Promise<DuplicateResult> {
  const conn = ensureConn();
  const startedAt = Date.now();
  const total = await countAll(object);
  const query = `SELECT ${field} v, COUNT(Id) c FROM ${object} WHERE ${field} != NULL GROUP BY ${field} HAVING COUNT(Id) > 1 ORDER BY COUNT(Id) DESC LIMIT 100`;
  let dupRecords = 0, dupGroups = 0;
  const examples: { value: string; count: number }[] = [];
  try {
    const r = await conn.query(query);
    for (const row of r.records ?? []) {
      const c = Number(row.c ?? row.expr0 ?? row.count ?? 0);
      dupRecords += c;
      dupGroups += 1;
      if (examples.length < 6) examples.push({ value: String(row.v ?? row[field] ?? '(null)'), count: c });
    }
  } catch (e: any) {
    // Some fields don't allow GROUP BY (long text). Fall back to no groups.
    throw new Error(`Duplicate query failed: ${e?.message ?? e}`);
  }
  const duplicatePercent = total > 0 ? +(100 * dupRecords / total).toFixed(2) : 0;
  const uniqueValues = total - dupRecords + dupGroups;
  return {
    system: 'salesforce', checkType: 'duplicate', object, field, fieldType,
    totalRecords: total, scannedRecords: total, executedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt, sampleQuery: query, liveConnection: true,
    duplicateRecords: dupRecords, duplicateGroups: dupGroups, uniqueValues, duplicatePercent,
    examples,
    severity: pickSeverity(duplicatePercent),
    headlineMetric: {
      label: 'Duplicate rate', value: fmtPct(duplicatePercent),
      hint: `${fmtNum(dupRecords)} of ${fmtNum(total)} rows share duplicated ${field} values`
    }
  };
}

async function runNull(object: string, field: string, fieldType: FieldType): Promise<NullResult> {
  const startedAt = Date.now();
  const total = await countAll(object);
  const nullOnly = await countNull(object, field);
  const empty = await countEmpty(object, field, fieldType);
  const nullCount = nullOnly + empty;
  const populatedCount = total - nullCount;
  const nullPercent = total > 0 ? +(100 * nullCount / total).toFixed(2) : 0;
  return {
    system: 'salesforce', checkType: 'null_empty', object, field, fieldType,
    totalRecords: total, scannedRecords: total, executedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    sampleQuery: `SELECT COUNT() FROM ${object} WHERE ${field} = NULL`,
    liveConnection: true,
    nullCount, emptyCount: empty, populatedCount, nullPercent,
    severity: pickSeverity(nullPercent),
    headlineMetric: {
      label: 'NULL / empty rate', value: fmtPct(nullPercent),
      hint: `${fmtNum(nullCount)} rows have no value for ${field}`
    }
  };
}

async function runCompleteness(object: string, field: string, fieldType: FieldType): Promise<CompletenessResult> {
  const startedAt = Date.now();
  const total = await countAll(object);
  const nullOnly = await countNull(object, field);
  const empty = await countEmpty(object, field, fieldType);
  const missing = nullOnly + empty;
  const populated = total - missing;
  const score = total > 0 ? Math.round(100 * populated / total) : 0;
  const severity: 'good' | 'warning' | 'critical' = score >= 90 ? 'good' : score >= 75 ? 'warning' : 'critical';
  return {
    system: 'salesforce', checkType: 'completeness', object, field, fieldType,
    totalRecords: total, scannedRecords: total, executedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    sampleQuery: `SELECT COUNT(Id) total, COUNT(${field}) populated FROM ${object}`,
    liveConnection: true,
    score, populated, missing, defaulted: 0,
    components: [
      { label: 'Populated', score },
      { label: 'Non-NULL', score: total > 0 ? Math.round(100 * (total - nullOnly) / total) : 0 },
      { label: 'Non-empty text', score: total > 0 ? Math.round(100 * (total - empty) / total) : 100 }
    ],
    severity,
    headlineMetric: {
      label: 'Completeness score', value: `${score}/100`,
      hint: `${fmtNum(populated)} populated \u00b7 ${fmtNum(missing)} missing`
    }
  };
}

async function runDistribution(object: string, field: string, fieldType: FieldType): Promise<DistributionResult> {
  const conn = ensureConn();
  const startedAt = Date.now();
  const total = await countAll(object);
  const query = `SELECT ${field} v, COUNT(Id) c FROM ${object} WHERE ${field} != NULL GROUP BY ${field} ORDER BY COUNT(Id) DESC LIMIT 10`;
  const topValues: { value: string; count: number; percent: number }[] = [];
  let cardinality = 0;
  try {
    const r = await conn.query(query);
    for (const row of r.records ?? []) {
      const c = Number(row.c ?? row.expr0 ?? row.count ?? 0);
      topValues.push({
        value: String(row.v ?? row[field] ?? '(null)'),
        count: c,
        percent: total > 0 ? +(100 * c / total).toFixed(2) : 0
      });
    }
    // Cardinality: separate COUNT_DISTINCT query
    try {
      const c = await conn.query(`SELECT COUNT_DISTINCT(${field}) c FROM ${object}`);
      cardinality = Number(c.records?.[0]?.c ?? c.records?.[0]?.expr0 ?? topValues.length);
    } catch {
      cardinality = topValues.length;
    }
  } catch (e: any) {
    throw new Error(`Distribution query failed: ${e?.message ?? e}`);
  }
  const topPct = topValues[0]?.percent ?? 0;
  const severity: 'good' | 'warning' | 'critical' =
    topPct > 70 ? 'critical' : topPct > 40 ? 'warning' : 'good';
  return {
    system: 'salesforce', checkType: 'value_distribution', object, field, fieldType,
    totalRecords: total, scannedRecords: total, executedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt, sampleQuery: query, liveConnection: true,
    cardinality, topValues,
    severity,
    headlineMetric: {
      label: 'Distinct values', value: fmtNum(cardinality),
      hint: `Top value covers ${fmtPct(topPct)} of rows`
    }
  };
}

async function runFormatValidation(object: string, field: string, fieldType: FieldType): Promise<FormatResult> {
  const conn = ensureConn();
  const startedAt = Date.now();
  const kind: 'email' | 'phone' | 'url' = fieldType === 'email' ? 'email' : fieldType === 'phone' ? 'phone' : 'url';
  const total = await countAll(object);
  const query = `SELECT ${field} FROM ${object} WHERE ${field} != NULL LIMIT 2000`;
  const r = await conn.query(query);
  const values: string[] = (r.records ?? []).map((rec: any) => String(rec[field] ?? '')).filter((v: string) => v !== '');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^[+()\-\s\d]{7,}$/;
  const URL_RE = /^https?:\/\/[^\s]+$/i;
  const isValid = (v: string) => kind === 'email' ? EMAIL_RE.test(v) : kind === 'phone' ? PHONE_RE.test(v) : URL_RE.test(v);
  const invalidSamples: string[] = [];
  let validCount = 0, invalidCount = 0;
  for (const v of values) {
    if (isValid(v)) validCount++;
    else {
      invalidCount++;
      if (invalidSamples.length < 6) invalidSamples.push(v);
    }
  }
  // Extrapolate to total
  const scanned = values.length;
  const scaledInvalid = scanned > 0 ? Math.round(invalidCount * total / scanned) : 0;
  const scaledValid = total - scaledInvalid;
  const invalidPercent = scanned > 0 ? +(100 * invalidCount / scanned).toFixed(2) : 0;
  return {
    system: 'salesforce', checkType: 'format_validation', object, field, fieldType,
    totalRecords: total, scannedRecords: scanned, executedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt, sampleQuery: query, liveConnection: true,
    formatKind: kind, validCount: scaledValid, invalidCount: scaledInvalid, invalidPercent,
    invalidExamples: invalidSamples,
    severity: pickSeverity(invalidPercent),
    headlineMetric: {
      label: `Invalid ${kind}s`, value: fmtPct(invalidPercent),
      hint: `${fmtNum(scaledInvalid)} of ${fmtNum(total)} sampled values fail format check`
    }
  };
}

async function runRefIntegrity(object: string, field: string, fieldType: FieldType): Promise<RefIntegrityResult> {
  const conn = ensureConn();
  const startedAt = Date.now();
  const total = await countAll(object);
  // Sample distinct FK IDs, then check existence.
  const parent = guessParentObject(field, object);
  const query = `SELECT ${field} FROM ${object} WHERE ${field} != NULL GROUP BY ${field} LIMIT 500`;
  const r = await conn.query(query);
  const ids: string[] = (r.records ?? []).map((rec: any) => rec[field]).filter(Boolean);
  const orphanExamples: string[] = [];
  let orphanCount = 0;
  if (ids.length > 0) {
    const idsClause = ids.map((i) => `'${String(i).replace(/'/g, "\\'")}'`).join(',');
    try {
      const existing = await conn.query(`SELECT Id FROM ${parent} WHERE Id IN (${idsClause})`);
      const existSet = new Set((existing.records ?? []).map((x: any) => x.Id));
      for (const id of ids) {
        if (!existSet.has(id)) {
          orphanCount++;
          if (orphanExamples.length < 6) orphanExamples.push(id);
        }
      }
    } catch (e: any) {
      // parent object may not exist / no permission; count all as unknown, not orphan
      throw new Error(`Referential integrity check failed on parent ${parent}: ${e?.message ?? e}`);
    }
  }
  const scanned = ids.length;
  const scaledOrphan = scanned > 0 ? Math.round(orphanCount * total / scanned) : 0;
  const orphanPercent = scanned > 0 ? +(100 * orphanCount / scanned).toFixed(2) : 0;
  return {
    system: 'salesforce', checkType: 'referential_integrity', object, field, fieldType,
    totalRecords: total, scannedRecords: scanned, executedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt, sampleQuery: query, liveConnection: true,
    totalReferences: total, orphanCount: scaledOrphan, orphanPercent, orphanExamples,
    severity: pickSeverity(orphanPercent),
    headlineMetric: {
      label: 'Orphan references', value: fmtPct(orphanPercent),
      hint: `${fmtNum(scaledOrphan)} references point to missing parents in ${parent}`
    }
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
