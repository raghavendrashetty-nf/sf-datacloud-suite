export type SystemKey = 'salesforce' | 'zendesk';
export type CheckKey = 'duplicate' | 'null_empty' | 'completeness' | 'value_distribution' | 'format_validation' | 'referential_integrity';
export type FieldType = 'string' | 'email' | 'phone' | 'url' | 'text' | 'number' | 'int' | 'currency' | 'boolean' | 'date' | 'picklist' | 'reference' | 'array';

export interface FieldDef { label: string; type: FieldType; description: string; }
export interface ObjectDef { label: string; description: string; fields: Record<string, FieldDef>; }
export interface SystemDef { name: string; description: string; color: string; hex: string; icon: string; objects: Record<string, ObjectDef>; }
export interface CheckDef { name: string; shortName: string; description: string; appliesToTypes: FieldType[]; icon: string; }
export interface Catalog { checks: Record<CheckKey, CheckDef>; systems: Record<SystemKey, SystemDef>; }

export interface SFConnectionConfig {
  username: string; password: string; securityToken?: string;
  domain: 'login' | 'test' | string; instanceUrl?: string;
}

export interface ConnectionInfo {
  connected: boolean;
  username?: string; displayName?: string;
  organizationId?: string; organizationName?: string;
  instanceUrl?: string; isSandbox?: boolean;
  apiVersion?: string; connectedAt?: string;
  authMethod?: 'password' | 'oauth';
  hasRefreshToken?: boolean;
}

export interface CheckRequest { system: SystemKey; checkType: CheckKey; object: string; field: string; }

export interface CheckResultBase {
  system: SystemKey; checkType: CheckKey; object: string; field: string; fieldType: FieldType;
  totalRecords: number; scannedRecords: number;
  executedAt: string; durationMs: number;
  sampleQuery: string;
  severity: 'good' | 'warning' | 'critical';
  headlineMetric: { label: string; value: string; hint?: string };
  liveConnection: boolean;
  /** Timestamped backend operations for the "Backend Console" UI. */
  backendLog?: string[];
}

export interface DuplicateResult extends CheckResultBase {
  checkType: 'duplicate';
  duplicateRecords: number; duplicateGroups: number; uniqueValues: number; duplicatePercent: number;
  examples: { value: string; count: number }[];
  /** When true, top-100 examples are shown but total duplicate counts cover the full table. */
  fullTableAnalyzed: boolean;
}
export interface NullResult extends CheckResultBase {
  checkType: 'null_empty';
  nullCount: number; emptyCount: number; populatedCount: number; nullPercent: number;
}
export interface CompletenessResult extends CheckResultBase {
  checkType: 'completeness';
  score: number; populated: number; missing: number; defaulted: number;
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
  validCount: number; invalidCount: number; invalidPercent: number;
  invalidExamples: string[];
  fullTableAnalyzed: boolean;
}
export interface RefIntegrityResult extends CheckResultBase {
  checkType: 'referential_integrity';
  totalReferences: number; orphanCount: number; orphanPercent: number;
  orphanExamples: string[];
  fullTableAnalyzed: boolean;
}

export type CheckResult = DuplicateResult | NullResult | CompletenessResult | DistributionResult | FormatResult | RefIntegrityResult;

/** Rich documentation used by the wizard's check-selection cards. */
export interface CheckMeta {
  key: CheckKey;
  headline: string;
  what: string;
  how: string;
  queries: string[];
  calculation: string;
  outcome: string;
  dataCloudUseCase: string;
  useCases: string[];
}

export const CHECK_META: Record<CheckKey, CheckMeta> = {
  duplicate: {
    key: 'duplicate',
    headline: 'Find records that share the same value in a chosen field',
    what: 'Detects rows where the selected field holds the same value in more than one record - e.g. two Contacts with the same Email.',
    how: 'Runs a single SOQL aggregation across the WHOLE table (no LIMIT on the count) and streams the grouped result. Top 100 duplicate groups by frequency are returned for the UI table.',
    queries: [
      'SELECT COUNT() FROM {Object}                                       -- total rows',
      'SELECT COUNT(Id) c FROM {Object} WHERE {field} != NULL GROUP BY {field} HAVING COUNT(Id) > 1  -- via queryMore, all pages',
      'SELECT {field} v, COUNT(Id) c FROM {Object} WHERE {field} != NULL GROUP BY {field} HAVING COUNT(Id) > 1 ORDER BY COUNT(Id) DESC LIMIT 100  -- top 100 for display only'
    ],
    calculation: 'duplicateGroups = number of distinct values with count > 1 (from full paginated scan). duplicateRecords = sum of all counts > 1. duplicatePercent = 100 * duplicateRecords / totalRecords.',
    outcome: 'A rate percentage plus the top 100 offending values so you can quickly see hotspots.',
    dataCloudUseCase: 'Data Cloud identity resolution needs unique keys. Duplicate emails on Contact/Lead cause profile-unification collisions and inflated unified-individual counts.',
    useCases: [
      'Deduplicate keys before Salesforce ingestion into Data Cloud DMOs',
      'Detect abandoned dummy accounts using shared emails',
      'Estimate how many records will collapse during Profile Unification'
    ]
  },
  null_empty: {
    key: 'null_empty',
    headline: 'How many rows have no value at all in the chosen field',
    what: 'Counts rows where the selected field is NULL. For text-like fields, Salesforce stores empty strings as NULL, so both are reported together.',
    how: 'Two lightweight COUNT() queries - total rows and NULL rows. No table iteration required.',
    queries: [
      'SELECT COUNT() FROM {Object}                            -- total',
      'SELECT COUNT() FROM {Object} WHERE {field} = NULL       -- null count'
    ],
    calculation: 'nullPercent = 100 * nullCount / totalRecords. Populated = total - nullCount.',
    outcome: 'A single percentage plus the raw counts, categorised as populated / NULL / empty-string (empty is 0 for most SF fields since SOQL treats \u0027\u0027 as NULL).',
    dataCloudUseCase: 'Fields with high NULL rates weaken identity resolution and downstream calculated insights. Use before defining match rules or segmentation attributes.',
    useCases: [
      'Estimate coverage of Email/Phone before setting them as match keys',
      'Prioritise data-enrichment vendors for the lowest-coverage attributes',
      'Guardrail before promoting a field to a Data Cloud attribute'
    ]
  },
  completeness: {
    key: 'completeness',
    headline: 'A 0-100 quality score for how well the field is populated',
    what: 'Blends NULL rate and empty-string rate into a single completeness score for the selected field.',
    how: 'Reuses the NULL count query plus a total count; scored 0-100.',
    queries: [
      'SELECT COUNT() FROM {Object}                            -- total',
      'SELECT COUNT() FROM {Object} WHERE {field} = NULL       -- missing'
    ],
    calculation: 'score = round(100 * (total - missing) / total). Split into components: Populated, Non-NULL, Non-empty-text.',
    outcome: 'A single score with severity (>=90 healthy, >=75 warning, <75 critical) and per-component sub-scores.',
    dataCloudUseCase: 'Report card for individual fields before promoting them to Data Cloud match / segmentation criteria.',
    useCases: [
      'Field-quality report card for pre-migration reviews',
      'Track completeness improvements across sprints',
      'Justify data-enrichment ROI to stakeholders'
    ]
  },
  value_distribution: {
    key: 'value_distribution',
    headline: 'The most-common values and how skewed the distribution is',
    what: 'Returns the top 10 values by frequency plus the total distinct-value count.',
    how: 'One grouped SOQL for the top-10 histogram plus a COUNT_DISTINCT for cardinality. No table iteration required.',
    queries: [
      'SELECT COUNT() FROM {Object}                                                                      -- total',
      'SELECT {field} v, COUNT(Id) c FROM {Object} WHERE {field} != NULL GROUP BY {field} ORDER BY COUNT(Id) DESC LIMIT 10',
      'SELECT COUNT_DISTINCT({field}) c FROM {Object}                                                    -- cardinality'
    ],
    calculation: 'For each top value: percent = 100 * count / total. Severity flags: top value > 70% = critical, > 40% = warning.',
    outcome: 'A histogram of top values plus the distinct-value count, useful for spotting default values that dominate the field.',
    dataCloudUseCase: 'Detect \u0022Unknown\u0022 / \u0022N/A\u0022 dominance before choosing a field as a segmentation attribute.',
    useCases: [
      'Detect default-value pollution before ingestion',
      'Confirm picklists still match what business expects',
      'Baseline for post-migration data drift'
    ]
  },
  format_validation: {
    key: 'format_validation',
    headline: 'How many populated values fail a regex format check',
    what: 'Downloads all populated values via paginated queryMore and validates each against an email / phone / URL regex.',
    how: 'Streams the WHOLE table using jsforce queryMore pagination (2000 records per page). No LIMIT applied - iterates every populated row. Regex validation happens in memory.',
    queries: [
      'SELECT COUNT() FROM {Object}                                              -- total',
      'SELECT {field} FROM {Object} WHERE {field} != NULL                        -- iterate ALL populated rows via queryMore'
    ],
    calculation: 'For each value: valid = matches regex. invalidPercent = 100 * invalidCount / scannedRecords.',
    outcome: 'A pass/fail split with up to six invalid example strings so you can see the failure mode.',
    dataCloudUseCase: 'Malformed emails and phones break real-time activation to Marketing Cloud and Ads targeting.',
    useCases: [
      'Pre-flight check before activating to Marketing Cloud',
      'Detect legacy dummy values like \u0022@example.com\u0022 patterns',
      'Estimate deliverability rate for outbound campaigns'
    ]
  },
  referential_integrity: {
    key: 'referential_integrity',
    headline: 'How many foreign-key references point to missing parents',
    what: 'For a reference (lookup / master-detail) field, verifies that the parent record still exists.',
    how: 'Iterates every distinct FK id via paginated GROUP BY, then batch-checks parent existence in chunks of up to 1000 ids per query.',
    queries: [
      'SELECT COUNT() FROM {Object}                                              -- total rows',
      'SELECT {field} FROM {Object} WHERE {field} != NULL GROUP BY {field}       -- all distinct ids (paginated)',
      'SELECT Id FROM {ParentObject} WHERE Id IN (...batch of up to 1000 ids...) -- parent existence (batched)'
    ],
    calculation: 'orphan = distinct ids that do not exist in the parent object. orphanPercent = 100 * orphan / distinct ids scanned.',
    outcome: 'Total refs, orphan count, orphan percentage, plus up to six example orphan ids.',
    dataCloudUseCase: 'Orphan references cause failed lookups and broken relationships in the Data Cloud unified data model.',
    useCases: [
      'Find dangling AccountId links on Contact after account merges',
      'Cleanup before Data Cloud DMO relationship mapping',
      'Locate hard-deleted parents referenced by child records'
    ]
  }
};

export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickSeverity(pct: number): 'good' | 'warning' | 'critical' {
  if (pct < 5) return 'good';
  if (pct < 15) return 'warning';
  return 'critical';
}

export function fmtPct(n: number): string { return `${n.toFixed(1)}%`; }
export function fmtNum(n: number): string { return new Intl.NumberFormat('en-US').format(Math.round(n)); }

export function guessParentObject(fieldName: string, currentObject: string): string {
  if (fieldName === 'OwnerId' || fieldName === 'CreatedById' || fieldName === 'LastModifiedById') return 'User';
  if (fieldName === 'ProfileId') return 'Profile';
  if (fieldName === 'UserRoleId') return 'UserRole';
  if (fieldName.endsWith('Id')) return fieldName.slice(0, -2);
  return 'Account';
}
