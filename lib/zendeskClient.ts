// Server-side only.
import type {
  CheckKey, CheckResult, FieldType,
  DuplicateResult, NullResult, CompletenessResult, DistributionResult,
  FormatResult, RefIntegrityResult
} from './dataReadiness';
import { pickSeverity, fmtNum, fmtPct } from './dataReadiness';

// ---------------- Connection ----------------

export interface ZendeskConnectionConfig {
  subdomain: string;
  email: string;
  apiToken: string;
}

export interface ZendeskConnectionInfo {
  connected: boolean;
  subdomain?: string;
  email?: string;
  accountName?: string;
  ownerEmail?: string;
  plan?: string;
  connectedAt?: string;
  apiBaseUrl?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __zdCache: {
    config: ZendeskConnectionConfig | null;
    info: ZendeskConnectionInfo | null;
    objectCache: { at: number; items: ZObjectListItem[] } | null;
    fieldsCache: Record<string, { at: number; fields: ZFieldListItem[] }>;
  } | undefined;
}

if (!globalThis.__zdCache) {
  globalThis.__zdCache = { config: null, info: null, objectCache: null, fieldsCache: {} };
}
const cache = globalThis.__zdCache!;

const OBJECT_TTL_MS = 5 * 60 * 1000;
const FIELD_TTL_MS  = 5 * 60 * 1000;

function baseUrl(sub: string): string {
  const clean = sub.trim().replace(/^https?:\/\//i, '').replace(/\.zendesk\.com.*/i, '').replace(/\/+$/, '');
  return `https://${clean}.zendesk.com`;
}

function authHeader(cfg: ZendeskConnectionConfig): string {
  const token = Buffer.from(`${cfg.email}/token:${cfg.apiToken}`).toString('base64');
  return `Basic ${token}`;
}

async function zdFetch(path: string, log?: BackendLogger): Promise<any> {
  if (!cache.config || !cache.info) throw new Error('Not connected to Zendesk. Save a connection first.');
  const url = `${cache.info.apiBaseUrl}${path}`;
  log?.log(`GET ${url}`);
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader(cache.config),
      'Accept': 'application/json',
      'User-Agent': 'sf-datacloud-suite/4.9'
    }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Zendesk API ${resp.status} ${resp.statusText}${text ? ' - ' + text.slice(0, 200) : ''}`);
  }
  return resp.json();
}

/** Safe fetch that returns null on any error instead of throwing. Used during discovery. */
async function zdFetchSafe(path: string, log?: BackendLogger): Promise<any | null> {
  try { return await zdFetch(path, log); }
  catch (e: any) {
    log?.log(`  (${path} not available: ${e?.message ?? e})`);
    return null;
  }
}

export async function setZendeskConnection(cfg: ZendeskConnectionConfig): Promise<ZendeskConnectionInfo> {
  const apiBaseUrl = baseUrl(cfg.subdomain);
  const testUrl = `${apiBaseUrl}/api/v2/users/me.json`;
  const resp = await fetch(testUrl, {
    headers: { 'Authorization': authHeader(cfg), 'Accept': 'application/json' }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Zendesk auth failed (${resp.status}): ${text.slice(0, 200) || resp.statusText}`);
  }

  let accountName = cfg.subdomain, ownerEmail = '', plan = '';
  try {
    const acctResp = await fetch(`${apiBaseUrl}/api/v2/account.json`, {
      headers: { 'Authorization': authHeader(cfg), 'Accept': 'application/json' }
    });
    if (acctResp.ok) {
      const j = await acctResp.json();
      accountName = j?.account?.name || accountName;
      ownerEmail = j?.account?.owner_email || '';
      plan = j?.account?.subscription?.plan_name || '';
    }
  } catch {}

  const info: ZendeskConnectionInfo = {
    connected: true,
    subdomain: cfg.subdomain,
    email: cfg.email,
    accountName,
    ownerEmail,
    plan,
    connectedAt: new Date().toISOString(),
    apiBaseUrl
  };
  cache.config = cfg;
  cache.info = info;
  cache.objectCache = null;
  cache.fieldsCache = {};
  return info;
}

export function getZendeskConnectionInfo(): ZendeskConnectionInfo {
  if (cache.config && cache.info) return cache.info;
  return { connected: false };
}

export function clearZendeskConnection() {
  cache.config = null;
  cache.info = null;
  cache.objectCache = null;
  cache.fieldsCache = {};
}

// ---------------- Object/field types ----------------

export interface ZObjectListItem {
  name: string;             // API resource name, e.g. "tickets" or "custom_objects/car"
  label: string;            // Display label
  labelPlural: string;
  description: string;
  category: 'Support' | 'Custom' | 'Talk' | 'Chat' | 'Sell' | 'Guide' | 'System';
  isCustomObject: boolean;
  recordCount?: number;
  discoveryPath: string;    // Path used to list records (relative to apiBaseUrl)
  recordsKey: string;       // Key in JSON response that holds the array
  countPath?: string;       // Optional path to get exact count
}

export interface ZFieldListItem {
  name: string;
  label: string;
  type: string;
  mappedType: FieldType;
  referenceTo?: string[];
  custom: boolean;
  sampleValue?: any;
}

// ---------------- Standard endpoint catalog ----------------

/**
 * Standard Zendesk resources with paginated list endpoints. This catalog defines
 * WHERE to fetch records; field discovery happens live via record sampling.
 */
interface StandardResource {
  name: string;
  label: string;
  labelPlural: string;
  description: string;
  category: ZObjectListItem['category'];
  listPath: string;
  recordsKey: string;
  countPath?: string;
  requiresPlan?: string;
  probePath?: string; // Simplified path used to check if resource exists
}

const STANDARD_RESOURCES: StandardResource[] = [
  // ---- Support core ----
  { name: 'tickets',              label: 'Ticket',              labelPlural: 'Tickets',              category: 'Support', description: 'Support tickets.',                                     listPath: '/api/v2/tickets.json?page[size]=100',            recordsKey: 'tickets',              countPath: '/api/v2/tickets/count.json' },
  { name: 'users',                label: 'User',                labelPlural: 'Users',                category: 'Support', description: 'End-users, agents, and admins.',                      listPath: '/api/v2/users.json?page[size]=100',              recordsKey: 'users',                countPath: '/api/v2/users/count.json' },
  { name: 'organizations',        label: 'Organization',        labelPlural: 'Organizations',        category: 'Support', description: 'Companies grouping end-users.',                       listPath: '/api/v2/organizations.json?page[size]=100',      recordsKey: 'organizations',        countPath: '/api/v2/organizations/count.json' },
  { name: 'groups',               label: 'Group',               labelPlural: 'Groups',               category: 'Support', description: 'Agent groups.',                                       listPath: '/api/v2/groups.json?page[size]=100',             recordsKey: 'groups',               countPath: '/api/v2/groups/count.json' },
  { name: 'brands',               label: 'Brand',               labelPlural: 'Brands',               category: 'Support', description: 'Zendesk brands.',                                     listPath: '/api/v2/brands.json',                            recordsKey: 'brands' },
  { name: 'ticket_fields',        label: 'Ticket Field',        labelPlural: 'Ticket Fields',        category: 'Support', description: 'Custom and system ticket-field definitions.',         listPath: '/api/v2/ticket_fields.json',                     recordsKey: 'ticket_fields' },
  { name: 'ticket_forms',         label: 'Ticket Form',         labelPlural: 'Ticket Forms',         category: 'Support', description: 'Ticket form definitions.',                            listPath: '/api/v2/ticket_forms.json',                      recordsKey: 'ticket_forms' },
  { name: 'user_fields',          label: 'User Field',          labelPlural: 'User Fields',          category: 'Support', description: 'Custom user-field definitions.',                      listPath: '/api/v2/user_fields.json',                       recordsKey: 'user_fields' },
  { name: 'organization_fields',  label: 'Organization Field',  labelPlural: 'Organization Fields',  category: 'Support', description: 'Custom organization-field definitions.',              listPath: '/api/v2/organization_fields.json',               recordsKey: 'organization_fields' },
  { name: 'satisfaction_ratings', label: 'Satisfaction Rating', labelPlural: 'Satisfaction Ratings', category: 'Support', description: 'CSAT ratings on tickets.',                             listPath: '/api/v2/satisfaction_ratings.json?page[size]=100', recordsKey: 'satisfaction_ratings', countPath: '/api/v2/satisfaction_ratings/count.json' },
  { name: 'macros',               label: 'Macro',               labelPlural: 'Macros',               category: 'Support', description: 'Agent-triggered response templates.',                 listPath: '/api/v2/macros.json',                            recordsKey: 'macros' },
  { name: 'triggers',             label: 'Trigger',             labelPlural: 'Triggers',             category: 'Support', description: 'Automation triggers.',                                listPath: '/api/v2/triggers.json',                          recordsKey: 'triggers' },
  { name: 'automations',          label: 'Automation',          labelPlural: 'Automations',          category: 'Support', description: 'Time-based automations.',                             listPath: '/api/v2/automations.json',                       recordsKey: 'automations' },
  { name: 'views',                label: 'View',                labelPlural: 'Views',                category: 'Support', description: 'Saved ticket views.',                                 listPath: '/api/v2/views.json',                             recordsKey: 'views' },
  { name: 'sla_policies',         label: 'SLA Policy',          labelPlural: 'SLA Policies',         category: 'Support', description: 'SLA policy definitions.',                             listPath: '/api/v2/slas/policies.json',                     recordsKey: 'sla_policies' },
  { name: 'schedules',            label: 'Schedule',            labelPlural: 'Schedules',            category: 'Support', description: 'Business hour schedules.',                            listPath: '/api/v2/business_hours/schedules.json',          recordsKey: 'schedules' },
  { name: 'tags',                 label: 'Tag',                 labelPlural: 'Tags',                 category: 'Support', description: 'Ticket / user / organization tags.',                  listPath: '/api/v2/tags.json',                              recordsKey: 'tags' },
  // ---- Guide / Help Center ----
  { name: 'help_center_articles', label: 'Help Center Article', labelPlural: 'Help Center Articles', category: 'Guide',   description: 'Knowledge-base articles.',                            listPath: '/api/v2/help_center/articles.json?page[size]=100', recordsKey: 'articles' },
  { name: 'help_center_sections', label: 'Help Center Section', labelPlural: 'Help Center Sections', category: 'Guide',   description: 'Help center sections.',                               listPath: '/api/v2/help_center/sections.json?page[size]=100', recordsKey: 'sections' },
  { name: 'help_center_categories', label: 'Help Center Category', labelPlural: 'Help Center Categories', category: 'Guide', description: 'Help center categories.',                        listPath: '/api/v2/help_center/categories.json?page[size]=100', recordsKey: 'categories' },
  // ---- Talk ----
  { name: 'calls',                label: 'Call',                labelPlural: 'Calls',                category: 'Talk',    description: 'Zendesk Talk calls.',                                 listPath: '/api/v2/channels/voice/stats/incremental/calls.json?start_time=0', recordsKey: 'calls', requiresPlan: 'Talk' },
  // ---- Sell (CRM) ----
  { name: 'deals',                label: 'Deal',                labelPlural: 'Deals',                category: 'Sell',    description: 'Sell CRM deals.',                                     listPath: '/api/v2/deals',                                  recordsKey: 'items',                requiresPlan: 'Sell' },
  { name: 'leads',                label: 'Lead',                labelPlural: 'Leads',                category: 'Sell',    description: 'Sell CRM leads.',                                     listPath: '/api/v2/leads',                                  recordsKey: 'items',                requiresPlan: 'Sell' }
];

// ---------------- Live object discovery ----------------

/**
 * Probes every standard resource in parallel with a HEAD-like GET (limit=1).
 * Also fetches Sunshine custom objects. Returns everything that exists in
 * the connected org.
 */
export async function listZendeskObjects(): Promise<ZObjectListItem[]> {
  const now = Date.now();
  if (cache.objectCache && (now - cache.objectCache.at) < OBJECT_TTL_MS) return cache.objectCache.items;
  if (!cache.config) throw new Error('Not connected to Zendesk.');

  const items: ZObjectListItem[] = [];

  // Probe each standard resource in parallel
  const probes = STANDARD_RESOURCES.map(async (r) => {
    // Try a lightweight probe first
    const probeSep = r.listPath.includes('?') ? '&' : '?';
    const probePath = r.listPath + probeSep + 'per_page=1&page[size]=1';
    const j = await zdFetchSafe(probePath);
    if (!j) return null;
    // Confirm the expected records key is present (some resources return errors as 200)
    if (!(r.recordsKey in j) && !Array.isArray(j[r.recordsKey])) return null;

    let recordCount: number | undefined;
    if (r.countPath) {
      const cj = await zdFetchSafe(r.countPath);
      const raw = cj?.count?.value;
      if (typeof raw === 'number') recordCount = raw;
    }

    const item: ZObjectListItem = {
      name: r.name,
      label: r.label,
      labelPlural: r.labelPlural,
      description: r.description,
      category: r.category,
      isCustomObject: false,
      recordCount,
      discoveryPath: r.listPath,
      recordsKey: r.recordsKey,
      countPath: r.countPath
    };
    return item;
  });

  const results = await Promise.all(probes);
  for (const r of results) if (r) items.push(r);

  // Sunshine custom objects — discover live if available
  const customJ = await zdFetchSafe('/api/v2/custom_objects.json');
  const customObjects: any[] = customJ?.custom_objects ?? [];
  for (const co of customObjects) {
    const key = co.key || co.name; // Sunshine uses `key` as identifier
    if (!key) continue;
    const label = co.title || co.raw_title || key;
    const labelPlural = co.title_pluralized || (label + 's');
    const item: ZObjectListItem = {
      name: `custom_objects/${key}`,
      label,
      labelPlural,
      description: co.description || `Sunshine custom object (${key}).`,
      category: 'Custom',
      isCustomObject: true,
      discoveryPath: `/api/v2/custom_objects/${key}/records.json?page[size]=100`,
      recordsKey: 'custom_object_records'
    };
    items.push(item);
  }

  items.sort((a, b) => {
    // Custom objects first, then category order, then alphabetical
    if (a.isCustomObject !== b.isCustomObject) return a.isCustomObject ? -1 : 1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.label.localeCompare(b.label);
  });

  cache.objectCache = { at: now, items };
  return items;
}

// ---------------- Live field discovery ----------------

/** Infer our internal FieldType from a raw JS value + hint from field name. */
function inferFieldType(name: string, value: any): FieldType {
  const nameLc = name.toLowerCase();
  if (nameLc === 'email' || nameLc.endsWith('_email')) return 'email';
  if (nameLc === 'phone' || nameLc.endsWith('_phone')) return 'phone';
  if (nameLc === 'url' || nameLc.endsWith('_url') || nameLc === 'website') return 'url';
  if (nameLc.endsWith('_id') || nameLc === 'id' || nameLc === 'ticket_id' || nameLc === 'requester_id') return 'reference';
  if (nameLc.endsWith('_at') || nameLc.endsWith('_date') || nameLc.endsWith('_time')) return 'date';

  if (value == null) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return 'int';
    return 'number';
  }
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'text';
  if (typeof value === 'string') {
    // Value-based heuristic
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    if (/^https?:\/\//i.test(value)) return 'url';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    if (/^\+?[\d\s\-().]{7,}$/.test(value)) return 'phone';
    return 'string';
  }
  return 'string';
}

/** Guess parent resource from a reference field name (best-effort). */
function guessReferenceTargets(fieldName: string): string[] | undefined {
  const n = fieldName.toLowerCase();
  if (n === 'requester_id' || n === 'submitter_id' || n === 'assignee_id' || n === 'author_id' || n === 'user_id') return ['users'];
  if (n === 'organization_id') return ['organizations'];
  if (n === 'group_id') return ['groups'];
  if (n === 'brand_id') return ['brands'];
  if (n === 'ticket_id') return ['tickets'];
  if (n === 'schedule_id') return ['schedules'];
  if (n === 'ticket_form_id') return ['ticket_forms'];
  if (n === 'form_id') return ['ticket_forms'];
  return undefined;
}

/**
 * Discover fields by sampling a real record. For custom objects, prefers the
 * schema endpoint; falls back to sampling.
 */
export async function describeZendeskObjectFields(objectName: string): Promise<ZFieldListItem[]> {
  const now = Date.now();
  const cached = cache.fieldsCache[objectName];
  if (cached && (now - cached.at) < FIELD_TTL_MS) return cached.fields;

  const objects = await listZendeskObjects();
  const obj = objects.find((o) => o.name === objectName);
  if (!obj) throw new Error(`Unknown Zendesk object: ${objectName}`);

  const fields: ZFieldListItem[] = [];

  // ---- Sunshine custom object: use fields metadata endpoint ----
  if (obj.isCustomObject) {
    const key = objectName.replace(/^custom_objects\//, '');
    const j = await zdFetchSafe(`/api/v2/custom_objects/${key}/fields.json`);
    const custom_object_fields: any[] = j?.custom_object_fields ?? [];
    fields.push({ name: 'id',  label: 'ID',  type: 'integer', mappedType: 'int',    custom: false });
    fields.push({ name: 'name', label: 'Name', type: 'string',  mappedType: 'string', custom: false });
    fields.push({ name: 'external_id', label: 'External ID', type: 'string', mappedType: 'string', custom: false });
    for (const f of custom_object_fields) {
      const type = String(f.type || 'text').toLowerCase();
      let mapped: FieldType = 'string';
      if (type === 'checkbox') mapped = 'boolean';
      else if (type === 'integer') mapped = 'int';
      else if (type === 'decimal') mapped = 'number';
      else if (type === 'date') mapped = 'date';
      else if (type === 'dropdown' || type === 'multiselect') mapped = 'picklist';
      else if (type === 'lookup') mapped = 'reference';
      else if (type === 'textarea') mapped = 'text';

      fields.push({
        name: f.key || f.name || f.title,
        label: f.title || f.key,
        type,
        mappedType: mapped,
        custom: true,
        referenceTo: mapped === 'reference' && f.relationship_target_type
          ? [String(f.relationship_target_type)]
          : undefined
      });
    }
    // Always add the standard record timestamps
    fields.push({ name: 'created_at', label: 'Created At', type: 'date', mappedType: 'date', custom: false });
    fields.push({ name: 'updated_at', label: 'Updated At', type: 'date', mappedType: 'date', custom: false });
    cache.fieldsCache[objectName] = { at: now, fields };
    return fields.sort((a, b) => a.label.localeCompare(b.label));
  }

  // ---- Standard resource: sample one record and infer ----
  const sep = obj.discoveryPath.includes('?') ? '&' : '?';
  const sampleJ = await zdFetchSafe(obj.discoveryPath + sep + 'per_page=1&page[size]=1');
  const records: any[] = sampleJ?.[obj.recordsKey] ?? [];
  const sample = records[0];

  if (!sample) {
    // Empty resource — return at least the id field so the UI is usable
    cache.fieldsCache[objectName] = {
      at: now,
      fields: [{ name: 'id', label: 'ID', type: 'integer', mappedType: 'int', custom: false }]
    };
    return cache.fieldsCache[objectName].fields;
  }

  // Iterate top-level keys of the sample record
  for (const [key, value] of Object.entries(sample)) {
    if (typeof value === 'function') continue;
    const mapped = inferFieldType(key, value);
    const referenceTo = mapped === 'reference' ? guessReferenceTargets(key) : undefined;
    fields.push({
      name: key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      type: value == null ? 'null' : (Array.isArray(value) ? 'array' : typeof value),
      mappedType: mapped,
      custom: false,
      referenceTo,
      sampleValue: (typeof value === 'string' && value.length > 50) ? value.slice(0, 50) + '\u2026' : value
    });
  }

  // Ticket-specific: also expose custom_fields as individual fields when present
  if (objectName === 'tickets' && Array.isArray(sample.custom_fields)) {
    // Fetch the ticket_fields definitions to get real labels for the custom-field IDs
    const tfJ = await zdFetchSafe('/api/v2/ticket_fields.json');
    const defs: any[] = tfJ?.ticket_fields ?? [];
    const labelById = new Map<string, string>();
    const typeById = new Map<string, string>();
    for (const d of defs) {
      labelById.set(String(d.id), d.title || d.raw_title || `Custom ${d.id}`);
      typeById.set(String(d.id), String(d.type || 'text'));
    }
    for (const cf of sample.custom_fields) {
      const id = String(cf.id);
      const type = typeById.get(id) || 'text';
      let mapped: FieldType = 'string';
      if (type === 'checkbox') mapped = 'boolean';
      else if (type === 'integer') mapped = 'int';
      else if (type === 'decimal') mapped = 'number';
      else if (type === 'date') mapped = 'date';
      else if (type === 'dropdown' || type === 'tagger' || type === 'multiselect') mapped = 'picklist';
      else if (type === 'textarea') mapped = 'text';
      fields.push({
        name: id,
        label: (labelById.get(id) || `Custom ${id}`) + ` (custom)`,
        type,
        mappedType: mapped,
        custom: true,
        sampleValue: cf.value
      });
    }
  }

  fields.sort((a, b) => {
    // Standard "id" first, then alphabetical
    if (a.name === 'id') return -1;
    if (b.name === 'id') return 1;
    return a.label.localeCompare(b.label);
  });

  cache.fieldsCache[objectName] = { at: now, fields };
  return fields;
}

// ---------------- Backend logger ----------------

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

// ---------------- Pagination helpers ----------------

async function* iterateZendeskRecords(objectName: string, log?: BackendLogger): AsyncGenerator<any> {
  const objects = await listZendeskObjects();
  const obj = objects.find((o) => o.name === objectName);
  if (!obj) throw new Error(`Unknown Zendesk object: ${objectName}`);

  let url: string = obj.discoveryPath;
  let page = 1;
  let total = 0;

  while (url) {
    log?.log(`Fetching page ${page}...`);
    const j: any = await zdFetch(url, log);
    const records: any[] = j[obj.recordsKey] ?? j.results ?? [];
    for (const rec of records) { yield rec; total++; }
    log?.log(`  page ${page} returned ${records.length} records (total: ${total})`);

    // Try cursor pagination first (newer endpoints)
    const nextLink = j.links?.next;
    const hasMore = !!j.meta?.has_more;
    if (nextLink && hasMore) {
      const parsed = new URL(nextLink);
      url = parsed.pathname + parsed.search;
    } else if (j.next_page) {
      // Offset pagination fallback
      const parsed = new URL(j.next_page);
      url = parsed.pathname + parsed.search;
    } else {
      url = '';
    }
    page++;
  }
  log?.log(`Iteration complete: ${total} records across ${page - 1} page${page === 2 ? '' : 's'}`);
}

async function countZendeskRecords(objectName: string, log?: BackendLogger): Promise<number> {
  const objects = await listZendeskObjects();
  const obj = objects.find((o) => o.name === objectName);
  if (!obj) return 0;

  if (obj.countPath) {
    try {
      const j: any = await zdFetch(obj.countPath, log);
      const c = Number(j?.count?.value ?? 0);
      log?.log(`  count endpoint returned ${c}`);
      return c;
    } catch (e: any) {
      log?.log(`  count endpoint failed (${e?.message ?? e}); iterating`);
    }
  }
  let n = 0;
  for await (const _rec of iterateZendeskRecords(objectName, log)) n++;
  return n;
}

function getFieldValue(record: any, field: string): any {
  if (Object.prototype.hasOwnProperty.call(record, field)) return record[field];
  if (Array.isArray(record.custom_fields)) {
    const cf = record.custom_fields.find((c: any) => String(c.id) === String(field));
    if (cf) return cf.value;
  }
  // Sunshine custom object records store user-defined fields under `attributes`
  if (record.attributes && typeof record.attributes === 'object' && field in record.attributes) {
    return record.attributes[field];
  }
  return undefined;
}

// ---------------- Check runners ----------------

async function runDuplicate(object: string, field: string, fieldType: FieldType): Promise<DuplicateResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Zendesk Duplicate check on ${object}.${field}`);
  const total = await countZendeskRecords(object, log);

  const freq = new Map<string, number>();
  let scanned = 0;
  for await (const rec of iterateZendeskRecords(object, log)) {
    const v = getFieldValue(rec, field);
    if (v == null || v === '') continue;
    const key = String(v);
    freq.set(key, (freq.get(key) ?? 0) + 1);
    scanned++;
    if (scanned % 5000 === 0) log.log(`  ...scanned ${scanned.toLocaleString()}, distinct ${freq.size.toLocaleString()}`);
  }

  let dupGroups = 0, dupRecords = 0;
  const dupList: { value: string; count: number }[] = [];
  for (const [value, count] of freq) {
    if (count > 1) { dupGroups++; dupRecords += count; dupList.push({ value, count }); }
  }
  dupList.sort((a, b) => b.count - a.count);
  const examples = dupList.slice(0, 6);
  const duplicatePercent = total > 0 ? +(100 * dupRecords / total).toFixed(2) : 0;

  log.log(`Groups: ${dupGroups}, duplicate records: ${dupRecords}`);
  log.log(`<<< Complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'zendesk', checkType: 'duplicate', object, field, fieldType,
    totalRecords: total, scannedRecords: scanned,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: `GET ${object} (paginated) | group by ${field}`,
    liveConnection: true, fullTableAnalyzed: true,
    duplicateRecords: dupRecords, duplicateGroups: dupGroups,
    uniqueValues: freq.size, duplicatePercent, examples,
    severity: pickSeverity(duplicatePercent),
    headlineMetric: {
      label: 'Duplicate rate', value: fmtPct(duplicatePercent),
      hint: `${fmtNum(dupRecords)} of ${fmtNum(total)} records across ${fmtNum(dupGroups)} groups`
    },
    backendLog: log.toArray()
  };
}

async function runNull(object: string, field: string, fieldType: FieldType): Promise<NullResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Zendesk NULL/Empty check on ${object}.${field}`);
  const total = await countZendeskRecords(object, log);

  let nullCount = 0, emptyCount = 0, populatedCount = 0, scanned = 0;
  for await (const rec of iterateZendeskRecords(object, log)) {
    scanned++;
    const v = getFieldValue(rec, field);
    if (v == null) nullCount++;
    else if (v === '') emptyCount++;
    else populatedCount++;
    if (scanned % 5000 === 0) log.log(`  ...scanned ${scanned.toLocaleString()}`);
  }
  const missingCount = nullCount + emptyCount;
  const nullPercent = scanned > 0 ? +(100 * missingCount / scanned).toFixed(2) : 0;

  log.log(`Populated: ${populatedCount}, NULL: ${nullCount}, empty: ${emptyCount}`);
  log.log(`<<< Complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'zendesk', checkType: 'null_empty', object, field, fieldType,
    totalRecords: total || scanned, scannedRecords: scanned,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: `GET ${object} (paginated) | count(${field} missing)`,
    liveConnection: true,
    nullCount, emptyCount, populatedCount, nullPercent,
    severity: pickSeverity(nullPercent),
    headlineMetric: {
      label: 'NULL / empty rate', value: fmtPct(nullPercent),
      hint: `${fmtNum(missingCount)} of ${fmtNum(scanned)} records have no value for ${field}`
    },
    backendLog: log.toArray()
  };
}

async function runCompleteness(object: string, field: string, fieldType: FieldType): Promise<CompletenessResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Zendesk Completeness on ${object}.${field}`);
  const total = await countZendeskRecords(object, log);

  let missing = 0, populated = 0, scanned = 0, nullOnly = 0, emptyOnly = 0;
  for await (const rec of iterateZendeskRecords(object, log)) {
    scanned++;
    const v = getFieldValue(rec, field);
    if (v == null) { missing++; nullOnly++; }
    else if (v === '') { missing++; emptyOnly++; }
    else populated++;
  }
  const denom = scanned || 1;
  const score = Math.round(100 * populated / denom);
  const severity: 'good' | 'warning' | 'critical' = score >= 90 ? 'good' : score >= 75 ? 'warning' : 'critical';

  log.log(`Score = ${score}/100`);
  log.log(`<<< Complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'zendesk', checkType: 'completeness', object, field, fieldType,
    totalRecords: total || scanned, scannedRecords: scanned,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: `GET ${object} (paginated)`,
    liveConnection: true,
    score, populated, missing, defaulted: 0,
    components: [
      { label: 'Populated', score },
      { label: 'Non-NULL', score: Math.round(100 * (scanned - nullOnly) / denom) },
      { label: 'Non-empty text', score: Math.round(100 * (scanned - emptyOnly) / denom) }
    ],
    severity,
    headlineMetric: {
      label: 'Completeness score', value: `${score}/100`,
      hint: `${fmtNum(populated)} populated of ${fmtNum(scanned)}`
    },
    backendLog: log.toArray()
  };
}

async function runDistribution(object: string, field: string, fieldType: FieldType): Promise<DistributionResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Zendesk Value Distribution on ${object}.${field}`);
  const total = await countZendeskRecords(object, log);

  const freq = new Map<string, number>();
  let scanned = 0;
  for await (const rec of iterateZendeskRecords(object, log)) {
    scanned++;
    const v = getFieldValue(rec, field);
    if (v == null || v === '') continue;
    const key = String(v);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({
      value, count,
      percent: scanned > 0 ? +(100 * count / scanned).toFixed(2) : 0
    }));
  const topPct = sorted[0]?.percent ?? 0;
  const severity: 'good' | 'warning' | 'critical' = topPct > 70 ? 'critical' : topPct > 40 ? 'warning' : 'good';

  log.log(`Cardinality: ${freq.size}, top ${topPct}%`);
  log.log(`<<< Complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'zendesk', checkType: 'value_distribution', object, field, fieldType,
    totalRecords: total || scanned, scannedRecords: scanned,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: `GET ${object} (paginated) | histogram(${field})`,
    liveConnection: true,
    cardinality: freq.size, topValues: sorted, severity,
    headlineMetric: {
      label: 'Distinct values', value: fmtNum(freq.size),
      hint: `Top value covers ${fmtPct(topPct)} of records`
    },
    backendLog: log.toArray()
  };
}

async function runFormatValidation(object: string, field: string, fieldType: FieldType): Promise<FormatResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  const kind: 'email' | 'phone' | 'url' = fieldType === 'email' ? 'email' : fieldType === 'phone' ? 'phone' : 'url';
  log.log(`>>> Zendesk Format check (${kind}) on ${object}.${field}`);
  const total = await countZendeskRecords(object, log);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^[+()\-\s\d]{7,}$/;
  const URL_RE = /^https?:\/\/[^\s]+$/i;
  const isValid = (v: string) => kind === 'email' ? EMAIL_RE.test(v) : kind === 'phone' ? PHONE_RE.test(v) : URL_RE.test(v);

  let validCount = 0, invalidCount = 0, scanned = 0;
  const invalidSamples: string[] = [];
  for await (const rec of iterateZendeskRecords(object, log)) {
    const v = getFieldValue(rec, field);
    if (v == null || v === '') continue;
    scanned++;
    const s = String(v);
    if (isValid(s)) validCount++;
    else {
      invalidCount++;
      if (invalidSamples.length < 6) invalidSamples.push(s);
    }
  }
  const invalidPercent = scanned > 0 ? +(100 * invalidCount / scanned).toFixed(2) : 0;

  log.log(`Valid: ${validCount}, Invalid: ${invalidCount}`);
  log.log(`<<< Complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'zendesk', checkType: 'format_validation', object, field, fieldType,
    totalRecords: total || scanned, scannedRecords: scanned,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: `GET ${object} (paginated) | regex(${field})`,
    liveConnection: true, fullTableAnalyzed: true,
    formatKind: kind, validCount, invalidCount, invalidPercent,
    invalidExamples: invalidSamples,
    severity: pickSeverity(invalidPercent),
    headlineMetric: {
      label: `Invalid ${kind}s`, value: fmtPct(invalidPercent),
      hint: `${fmtNum(invalidCount)} of ${fmtNum(scanned)} values fail format check`
    },
    backendLog: log.toArray()
  };
}

async function runRefIntegrity(object: string, field: string, fieldType: FieldType): Promise<RefIntegrityResult> {
  const log = new BackendLogger();
  const startedAt = Date.now();
  log.log(`>>> Zendesk Referential Integrity on ${object}.${field}`);

  const fields = await describeZendeskObjectFields(object);
  const fdef = fields.find((f) => f.name === field);
  const parent = fdef?.referenceTo?.[0];
  if (!parent) throw new Error(`Field ${field} on ${object} is not a reference field, or parent is unknown.`);
  log.log(`Parent object: ${parent}`);

  const total = await countZendeskRecords(object, log);

  const distinctIds = new Set<string>();
  let scanned = 0;
  for await (const rec of iterateZendeskRecords(object, log)) {
    scanned++;
    const v = getFieldValue(rec, field);
    if (v == null) continue;
    distinctIds.add(String(v));
  }
  log.log(`Found ${distinctIds.size} distinct FK ids across ${scanned} records`);

  const existingIds = new Set<string>();
  const idsList = Array.from(distinctIds);
  const CHUNK = 100;
  const orphanExamples: string[] = [];

  for (let i = 0; i < idsList.length; i += CHUNK) {
    const chunk = idsList.slice(i, i + CHUNK);
    const ids = chunk.join(',');
    const path = `/api/v2/${parent}/show_many.json?ids=${ids}`;
    log.log(`Chunk ${Math.floor(i / CHUNK) + 1}: ${chunk.length} ids`);
    try {
      const j: any = await zdFetch(path, log);
      const parentRecs: any[] = j[parent] ?? [];
      for (const p of parentRecs) if (p.id != null) existingIds.add(String(p.id));
    } catch (e: any) {
      log.log(`  chunk failed (${e?.message ?? e})`);
    }
  }

  let orphanCount = 0;
  for (const id of idsList) {
    if (!existingIds.has(id)) {
      orphanCount++;
      if (orphanExamples.length < 6) orphanExamples.push(id);
    }
  }
  const orphanPercent = idsList.length > 0 ? +(100 * orphanCount / idsList.length).toFixed(2) : 0;
  log.log(`Orphans: ${orphanCount} / ${idsList.length} (${orphanPercent}%)`);
  log.log(`<<< Complete in ${Date.now() - startedAt} ms`);

  return {
    system: 'zendesk', checkType: 'referential_integrity', object, field, fieldType,
    totalRecords: total || scanned, scannedRecords: idsList.length,
    executedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    sampleQuery: `GET ${object} + GET /api/v2/${parent}/show_many.json?ids=...`,
    liveConnection: true, fullTableAnalyzed: true,
    totalReferences: total || scanned, orphanCount, orphanPercent, orphanExamples,
    severity: pickSeverity(orphanPercent),
    headlineMetric: {
      label: 'Orphan references', value: fmtPct(orphanPercent),
      hint: `${fmtNum(orphanCount)} of ${fmtNum(idsList.length)} distinct ids point to missing parents in ${parent}`
    },
    backendLog: log.toArray()
  };
}

export async function runZendeskCheck(checkType: CheckKey, object: string, field: string, fieldType: FieldType): Promise<CheckResult> {
  switch (checkType) {
    case 'duplicate':             return runDuplicate(object, field, fieldType);
    case 'null_empty':            return runNull(object, field, fieldType);
    case 'completeness':          return runCompleteness(object, field, fieldType);
    case 'value_distribution':    return runDistribution(object, field, fieldType);
    case 'format_validation':     return runFormatValidation(object, field, fieldType);
    case 'referential_integrity': return runRefIntegrity(object, field, fieldType);
  }
}