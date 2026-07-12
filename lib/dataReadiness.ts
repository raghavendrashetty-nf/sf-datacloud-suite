export type SystemKey = 'salesforce' | 'zendesk';
export type CheckKey =
  | 'duplicate' | 'null_empty' | 'completeness'
  | 'value_distribution' | 'format_validation' | 'referential_integrity';

export type FieldType =
  | 'string' | 'email' | 'phone' | 'url' | 'text'
  | 'number' | 'int' | 'currency'
  | 'boolean' | 'date' | 'picklist' | 'reference' | 'array';

export interface FieldDef { label: string; type: FieldType; description: string; }
export interface ObjectDef { label: string; description: string; fields: Record<string, FieldDef>; }
export interface SystemDef { name: string; description: string; color: string; hex: string; icon: string; objects: Record<string, ObjectDef>; }
export interface CheckDef { name: string; shortName: string; description: string; appliesToTypes: FieldType[]; icon: string; }
export interface Catalog { checks: Record<CheckKey, CheckDef>; systems: Record<SystemKey, SystemDef>; }

/** Salesforce connection config (matches user's SF_CONFIG structure) */
export interface SFConnectionConfig {
  username: string;
  password: string;
  securityToken?: string;
  domain: 'login' | 'test' | string; // 'login' = prod, 'test' = sandbox, or full URL
  instanceUrl?: string;
}

export interface ConnectionInfo {
  connected: boolean;
  username?: string;
  displayName?: string;
  organizationId?: string;
  organizationName?: string;
  instanceUrl?: string;
  isSandbox?: boolean;
  apiVersion?: string;
  connectedAt?: string;
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
  liveConnection: boolean; // true if data came from a real system
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
  score: number;
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

export type CheckResult = DuplicateResult | NullResult | CompletenessResult | DistributionResult | FormatResult | RefIntegrityResult;

/** Helpers */
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

export function pickSeverity(pct: number): 'good' | 'warning' | 'critical' {
  if (pct < 5) return 'good';
  if (pct < 15) return 'warning';
  return 'critical';
}

export function fmtPct(n: number): string { return `${n.toFixed(1)}%`; }
export function fmtNum(n: number): string { return new Intl.NumberFormat('en-US').format(Math.round(n)); }

export function guessParentObject(fieldName: string, currentObject: string): string {
  // Salesforce naming convention: AccountId → Account, OwnerId → User, ContactId → Contact
  if (fieldName === 'OwnerId' || fieldName === 'CreatedById' || fieldName === 'LastModifiedById') return 'User';
  if (fieldName === 'ProfileId') return 'Profile';
  if (fieldName === 'UserRoleId') return 'UserRole';
  if (fieldName === 'ParentId' && currentObject === 'FeedItem') return 'Account'; // generic - just for shape
  if (fieldName.endsWith('Id')) return fieldName.slice(0, -2);
  return 'Account';
}
