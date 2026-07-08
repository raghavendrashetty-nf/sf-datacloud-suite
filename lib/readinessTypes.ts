export type SystemId = "salesforce" | "zendesk" | "sharepoint";
export interface CredentialField { key: string; label: string; type: string; placeholder?: string; helper?: string; required?: boolean; default?: string; secret?: boolean; }
export interface SystemConfig { id: SystemId; label: string; color: string; icon: string; description: string; credentialFields: CredentialField[]; endpoint: string; }
export interface CheckResult { key: string; label: string; score: number; status: "pass" | "warn" | "fail"; detail: string; metrics?: Record<string, number | string>; }
export interface EntityMetric { entity: string; recordCount: number; nullEmailRate?: number; duplicateRate?: number; lastModified?: string; }
export interface LogEntry {
  ts: string;
  level: "info" | "http" | "soql" | "warn" | "error";
  message: string;
  data?: Record<string, any>;
}
export interface MetadataObject { name: string; label: string; recordCount?: number; queryable?: boolean; }
export interface MetadataResponse { system: SystemId; objects: MetadataObject[]; logs: LogEntry[]; }
export interface FieldMetadata { name: string; label: string; type?: string; nillable?: boolean; }
export interface FieldsResponse { system: SystemId; object: string; fields: FieldMetadata[]; logs: LogEntry[]; }
export type CheckRuleType = "duplicate";
export interface Rule { id: string; type: CheckRuleType; object: string; field: string; threshold: number; }
export interface ObjectDupResult {
  ruleId: string;
  object: string; field: string;
  totalRecords: number; nonNullRecords: number;
  uniqueValues?: number;
  duplicateRows: number; uniqueDuplicateValues: number;
  duplicateRate: number; score: number;
  status: "pass" | "warn" | "fail";
  topDuplicates: Array<{ value: string; count: number }>;
  method?: string;
}
export interface ReadinessReport {
  system: SystemId;
  connectedAs?: string;
  connectedAt: string;
  overallScore: number;
  overallRating: "Ready" | "Needs Work" | "At Risk";
  checks: CheckResult[];
  entities: EntityMetric[];
  recommendations: string[];
  logs?: LogEntry[];
  objectResults?: ObjectDupResult[];
}
