import type { PhaseKey } from './types';

export type RefreshMode =
  | 'full' | 'incremental' | 'streaming'
  | 'scheduled' | 'not_scheduled'
  | 'standard_publish' | 'rapid_publish'
  | 'on_demand';

export type RunFrequency =
  | 'hourly' | 'every3h' | 'every4h' | 'every6h' | 'every12h'
  | 'daily' | 'weekly' | 'monthly' | 'manual';

export interface DocLink { label: string; url: string; }

export interface RefreshModeMeta { key: RefreshMode; label: string; description: string; }
export interface RunFrequencyMeta { key: RunFrequency; label: string; runsPerYear: number | null; description: string; }

export const REFRESH_MODE_META: Record<RefreshMode, RefreshModeMeta> = {
  full: { key: 'full', label: 'Full Refresh', description: 'The entire dataset is removed and rebuilt from scratch on every run.' },
  incremental: { key: 'incremental', label: 'Incremental Refresh', description: 'Only records changed since the last run (by Last Modified Date) are processed.' },
  streaming: { key: 'streaming', label: 'Streaming (Continuous)', description: 'Data is processed continuously in near real time as it arrives - no fixed run schedule.' },
  scheduled: { key: 'scheduled', label: 'Scheduled', description: 'Runs automatically on a fixed interval you configure.' },
  not_scheduled: { key: 'not_scheduled', label: 'Not Scheduled (Manual / API / Flow)', description: 'Triggered on demand via the UI, API, or a Flow - no automatic schedule.' },
  standard_publish: { key: 'standard_publish', label: 'Standard Publish', description: 'Segment/activation refresh on the standard 12 or 24 hour cadence.' },
  rapid_publish: { key: 'rapid_publish', label: 'Rapid Publish', description: 'Faster 1 or 4 hour refresh cadence for Marketing Cloud activation targets; filters to the last 7 days of engagement data.' },
  on_demand: { key: 'on_demand', label: 'On-Demand / Event-Triggered', description: 'Executes only when explicitly invoked (e.g. by an event or manual trigger), not on a fixed schedule.' }
};

export const RUN_FREQUENCY_META: Record<RunFrequency, RunFrequencyMeta> = {
  hourly: { key: 'hourly', label: 'Every Hour', runsPerYear: 8760, description: '24 runs/day' },
  every3h: { key: 'every3h', label: 'Every 3 Hours', runsPerYear: 2920, description: '8 runs/day' },
  every4h: { key: 'every4h', label: 'Every 4 Hours', runsPerYear: 2190, description: '6 runs/day' },
  every6h: { key: 'every6h', label: 'Every 6 Hours', runsPerYear: 1460, description: '4 runs/day' },
  every12h: { key: 'every12h', label: 'Every 12 Hours', runsPerYear: 730, description: '2 runs/day' },
  daily: { key: 'daily', label: 'Daily', runsPerYear: 365, description: '1 run/day' },
  weekly: { key: 'weekly', label: 'Weekly', runsPerYear: 52, description: '1 run/week' },
  monthly: { key: 'monthly', label: 'Monthly', runsPerYear: 12, description: '1 run/month' },
  manual: { key: 'manual', label: 'Manual / On-Demand', runsPerYear: null, description: 'You specify the estimated number of runs per year.' }
};

export const DEFAULT_MANUAL_RUNS_PER_YEAR = 12;

// Compact forms of the labels above - used in narrow table columns (PDF report) and
// auto-generated pipeline names, where the full descriptive labels don't fit.
export const MODE_SHORT_LABELS: Record<RefreshMode, string> = {
  full: 'Full', incremental: 'Incremental', streaming: 'Streaming',
  scheduled: 'Scheduled', not_scheduled: 'Manual',
  standard_publish: 'Std Publish', rapid_publish: 'Rapid Publish', on_demand: 'On-Demand'
};

export const FREQUENCY_SHORT_LABELS: Record<RunFrequency, string> = {
  hourly: 'Hourly', every3h: 'Every 3h', every4h: 'Every 4h', every6h: 'Every 6h', every12h: 'Every 12h',
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', manual: 'Manual'
};

export function runsPerYearFor(frequency: RunFrequency, manualOverride?: number): number {
  const meta = RUN_FREQUENCY_META[frequency];
  if (meta.runsPerYear !== null) return meta.runsPerYear;
  return manualOverride ?? DEFAULT_MANUAL_RUNS_PER_YEAR;
}

export interface PhaseRefreshConfig {
  hasRefreshControls: boolean;
  modes: RefreshMode[];
  frequenciesByMode: Partial<Record<RefreshMode, RunFrequency[]>>;
  volumeLabelByMode: Partial<Record<RefreshMode, string>>;
  docs: DocLink[];
  streamingNote?: string;
}

const INGESTION_FREQUENCIES: RunFrequency[] = ['hourly', 'every6h', 'every12h', 'daily', 'weekly', 'monthly', 'manual'];
const INSIGHTS_FREQUENCIES: RunFrequency[] = ['hourly', 'every3h', 'every6h', 'every12h', 'daily'];

export const PHASE_REFRESH_CONFIG: Record<string, PhaseRefreshConfig> = {
  ingestion: {
    hasRefreshControls: true,
    modes: ['full', 'incremental', 'streaming'],
    frequenciesByMode: { full: INGESTION_FREQUENCIES, incremental: INGESTION_FREQUENCIES },
    volumeLabelByMode: {
      full: 'Full Dataset Size (rows per run)',
      incremental: 'Incremental Rows (changed/added per run)',
      streaming: 'Rows per Day (continuous)'
    },
    docs: [
      { label: 'Data Stream Settings and Refresh Modes', url: 'https://help.salesforce.com/s/articleView?id=sf.c360_a_data_stream_edit_settings.htm&language=en_US&type=5' },
      { label: 'Data Stream Schedule in Data 360', url: 'https://help.salesforce.com/s/articleView?id=sf.c360_a_data_stream_schedule.htm&language=en_US&type=5' }
    ]
  },
  insights: {
    hasRefreshControls: true,
    modes: ['scheduled', 'not_scheduled', 'streaming'],
    frequenciesByMode: { scheduled: INSIGHTS_FREQUENCIES, not_scheduled: ['manual'] },
    volumeLabelByMode: {
      scheduled: 'Rows Processed per Run',
      not_scheduled: 'Rows Processed per Manual Run',
      streaming: 'Rows per Day (continuous)'
    },
    docs: [
      { label: 'Schedule a Calculated Insight in Data 360', url: 'https://help.salesforce.com/s/articleView?id=sf.c360_a_schedule_a_calculated_insight_in_data_cloud.htm&language=en_US&type=5' }
    ]
  },
  activation: {
    hasRefreshControls: true,
    modes: ['standard_publish', 'rapid_publish'],
    frequenciesByMode: { standard_publish: ['every12h', 'daily'], rapid_publish: ['hourly', 'every4h'] },
    volumeLabelByMode: {
      standard_publish: 'Segment Population Rows per Publish',
      rapid_publish: 'Segment Population Rows per Publish'
    },
    docs: [
      { label: 'Increase Segment Refresh from Data 360 to the Activation Targets (Rapid Publish)', url: 'https://help.salesforce.com/s/articleView?id=sf.c360_a_rapid_segment_publish.htm&language=en_US&type=5' },
      { label: 'Publish a Segment in Data 360', url: 'https://help.salesforce.com/s/articleView?id=data.c360_a_publish_segment.htm&language=en_US&type=5' }
    ]
  },
  compute: {
    hasRefreshControls: true,
    modes: ['on_demand', 'scheduled'],
    // On-demand/event-triggered execution has no fixed schedule by definition, so - same as
    // Insights' "Not Scheduled" mode - it maps to the single 'manual' option, which reveals an
    // "Estimated Runs/Year" input instead of a picklist of cadences that don't actually apply.
    frequenciesByMode: { on_demand: ['manual'], scheduled: ['hourly', 'daily', 'weekly'] },
    volumeLabelByMode: {
      on_demand: 'Compute Units per Invocation',
      scheduled: 'Compute Units per Run'
    },
    docs: []
  },
  realtime: { hasRefreshControls: false, modes: [], frequenciesByMode: {}, volumeLabelByMode: {}, docs: [], streamingNote: 'End-to-end sub-second processing runs continuously - there is no configurable refresh schedule.' },
  act: { hasRefreshControls: false, modes: [], frequenciesByMode: {}, volumeLabelByMode: {}, docs: [], streamingNote: 'Data Queries and Streaming Actions are triggered on demand in real time - there is no configurable refresh schedule.' }
};

export function getPhaseRefreshConfig(phase: PhaseKey): PhaseRefreshConfig {
  return PHASE_REFRESH_CONFIG[phase] ?? { hasRefreshControls: false, modes: [], frequenciesByMode: {}, volumeLabelByMode: {}, docs: [] };
}

export type PipelineType = 'batch' | 'streaming';

export interface ConnectionCatalogEntry { key: string; label: string; pipelineType: PipelineType; isOther?: boolean; }

// Categorization verified against Salesforce Data Cloud docs (this session):
// - Web SDK / Mobile SDK / S2S are explicitly "Real-Time Ingestion" channels - streaming only.
//   ("Real-time ingestion supports multiple channels, including Web SDK, Mobile SDK, and
//   Server-to-Server (S2S) ingestion... Only streaming data ingestion is supported.")
// - Salesforce CRM connector runs full/incremental refreshes on a schedule - batch.
// - Cloud storage (S3/GCS/Azure/SFTP) and data warehouse connectors refresh on a schedule - batch.
// - Ingestion API explicitly supports both patterns, so it's offered as two distinct connections.
export const BATCH_CONNECTIONS: ConnectionCatalogEntry[] = [
  { key: 'salesforce_crm', label: 'Salesforce CRM', pipelineType: 'batch' },
  { key: 'marketing_cloud', label: 'Marketing Cloud Engagement', pipelineType: 'batch' },
  { key: 'commerce_cloud', label: 'Commerce Cloud', pipelineType: 'batch' },
  { key: 'amazon_s3', label: 'Amazon S3', pipelineType: 'batch' },
  { key: 'gcs', label: 'Google Cloud Storage', pipelineType: 'batch' },
  { key: 'azure_blob', label: 'Azure Blob Storage', pipelineType: 'batch' },
  { key: 'snowflake', label: 'Snowflake', pipelineType: 'batch' },
  { key: 'databricks', label: 'Databricks', pipelineType: 'batch' },
  { key: 'bigquery', label: 'Google BigQuery', pipelineType: 'batch' },
  { key: 'redshift', label: 'Amazon Redshift', pipelineType: 'batch' },
  { key: 'sftp', label: 'SFTP', pipelineType: 'batch' },
  { key: 'mulesoft', label: 'MuleSoft Anypoint', pipelineType: 'batch' },
  { key: 'ingestion_api_batch', label: 'Ingestion API (Bulk)', pipelineType: 'batch' },
  { key: 'zendesk', label: 'Zendesk', pipelineType: 'batch' },
  { key: 'other_batch', label: 'Other (specify)', pipelineType: 'batch', isOther: true }
];

export const STREAMING_CONNECTIONS: ConnectionCatalogEntry[] = [
  { key: 'ingestion_api_streaming', label: 'Ingestion API (Streaming)', pipelineType: 'streaming' },
  { key: 'kafka_webhook', label: 'Kafka / Webhook Event Stream', pipelineType: 'streaming' },
  { key: 'web_mobile_sdk', label: 'Web SDK / Mobile SDK', pipelineType: 'streaming' },
  { key: 's2s_realtime', label: 'Server-to-Server (S2S) Real-Time', pipelineType: 'streaming' },
  { key: 'other_streaming', label: 'Other (specify)', pipelineType: 'streaming', isOther: true }
];

export const CONNECTION_CATALOG: ConnectionCatalogEntry[] = [...BATCH_CONNECTIONS, ...STREAMING_CONNECTIONS];

export function connectionsFor(pipelineType: PipelineType): ConnectionCatalogEntry[] {
  return pipelineType === 'batch' ? BATCH_CONNECTIONS : STREAMING_CONNECTIONS;
}

export function findConnection(key: string): ConnectionCatalogEntry | undefined {
  return CONNECTION_CATALOG.find((c) => c.key === key);
}

export const PIPELINE_TYPE_DOCS: Record<PipelineType, DocLink[]> = {
  batch: [
    { label: 'Data Stream Settings and Refresh Modes', url: 'https://help.salesforce.com/s/articleView?id=sf.c360_a_data_stream_edit_settings.htm&language=en_US&type=5' },
    { label: 'Data Stream Schedule in Data 360', url: 'https://help.salesforce.com/s/articleView?id=sf.c360_a_data_stream_schedule.htm&language=en_US&type=5' }
  ],
  streaming: [
    { label: 'Real-Time Ingestion (Web SDK, Mobile SDK, S2S)', url: 'https://developer.salesforce.com/docs/data/data-cloud-int/references/data-cloud-ingestionapi-ref/c360-a-real-time-ingestion-api.html' },
    { label: 'Streaming Ingestion | Data 360 Ingestion API Reference', url: 'https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360a_api_streaming_ingestion.htm' }
  ]
};
