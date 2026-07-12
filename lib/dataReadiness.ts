export type SystemKey = 'salesforce' | 'zendesk';
export type CheckKey =
  | 'duplicate'
  | 'null_empty'
  | 'completeness'
  | 'value_distribution'
  | 'format_validation'
  | 'referential_integrity';

export type FieldType =
  | 'string' | 'email' | 'phone' | 'url' | 'text'
  | 'number' | 'int' | 'currency'
  | 'boolean' | 'date' | 'picklist' | 'reference' | 'array';

export interface FieldDef {
  label: string;
  type: FieldType;
  description: string;
}

export interface ObjectDef {
  label: string;
  description: string;
  fields: Record<string, FieldDef>;
}

export interface SystemDef {
  name: string;
  description: string;
  color: string;
  hex: string;
  icon: string;
  objects: Record<string, ObjectDef>;
}

export interface CheckDef {
  name: string;
  shortName: string;
  description: string;
  appliesToTypes: FieldType[];
  icon: string;
}

export interface Catalog {
  checks: Record<CheckKey, CheckDef>;
  systems: Record<SystemKey, SystemDef>;
}

export interface CheckRequest {
  system: SystemKey;
  checkType: CheckKey;
  object: string;
  field: string;
}

export interface CheckResultBase {
  system: SystemKey;
  checkType: CheckKey;
  object: string;
  field: string;
  fieldType: FieldType;
  totalRecords: number;
  scannedRecords: number;
  executedAt: string;
  durationMs: number;
  sampleQuery: string;
  severity: 'good' | 'warning' | 'critical';
  headlineMetric: { label: string; value: string; hint?: string };
}

export interface DuplicateResult extends CheckResultBase {
  checkType: 'duplicate';
  duplicateRecords: number;
  duplicateGroups: number;
  uniqueValues: number;
  duplicatePercent: number;
  examples: { value: string; count: number }[];
}

export interface NullResult extends CheckResultBase {
  checkType: 'null_empty';
  nullCount: number;
  emptyCount: number;
  populatedCount: number;
  nullPercent: number;
}

export interface CompletenessResult extends CheckResultBase {
  checkType: 'completeness';
  score: number; // 0-100
  populated: number;
  missing: number;
  defaulted: number;
  components: { label: string; score: number }[];
}

export interface DistributionResult extends CheckResultBase {
  checkType: 'value_distribution';
  cardinality: number;
  topValues: { value: string; count: number; percent: number }[];
}

export interface FormatResult extends CheckResultBase {
  checkType: 'format_validation';
  formatKind: 'email' | 'phone' | 'url';
  validCount: number;
  invalidCount: number;
  invalidPercent: number;
  invalidExamples: string[];
}

export interface RefIntegrityResult extends CheckResultBase {
  checkType: 'referential_integrity';
  totalReferences: number;
  orphanCount: number;
  orphanPercent: number;
  orphanExamples: string[];
}

export type CheckResult =
  | DuplicateResult
  | NullResult
  | CompletenessResult
  | DistributionResult
  | FormatResult
  | RefIntegrityResult;

/**
 * Deterministic pseudo-random generator based on a seed string,
 * so the same (system,check,object,field) always returns the same result.
 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough SOQL / API mock for display. */
export function buildSampleQuery(system: SystemKey, checkType: CheckKey, object: string, field: string): string {
  if (system === 'salesforce') {
    switch (checkType) {
      case 'duplicate':
        return `SELECT ${field}, COUNT(Id) recs FROM ${object} GROUP BY ${field} HAVING COUNT(Id) > 1`;
      case 'null_empty':
        return `SELECT COUNT() FROM ${object} WHERE ${field} = NULL OR ${field} = ''`;
      case 'completeness':
        return `SELECT COUNT(Id) total, COUNT(${field}) populated FROM ${object}`;
      case 'value_distribution':
        return `SELECT ${field}, COUNT(Id) c FROM ${object} GROUP BY ${field} ORDER BY c DESC LIMIT 10`;
      case 'format_validation':
        return `SELECT Id, ${field} FROM ${object} WHERE NOT ${field} LIKE '%_@_%.%_' LIMIT 100`;
      case 'referential_integrity':
        return `SELECT Id, ${field} FROM ${object} WHERE ${field} != NULL AND ${field} NOT IN (SELECT Id FROM ParentObject)`;
    }
  }
  // Zendesk API examples
  switch (checkType) {
    case 'duplicate':
      return `GET /api/v2/${object.toLowerCase()}s.json?query=type:${object.toLowerCase()} + group by ${field}`;
    case 'null_empty':
      return `GET /api/v2/${object.toLowerCase()}s.json?filter[${field}]=null`;
    default:
      return `GET /api/v2/${object.toLowerCase()}s.json (scan ${field})`;
  }
}
