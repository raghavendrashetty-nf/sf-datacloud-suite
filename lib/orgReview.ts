import type { Skill } from './types';
import type { ScanCategoryResult } from './dataCloudClient';
import { formatSkillsBlock, SOW_TEXT_MAX_CHARS } from './llmProviders';

export interface ReviewFinding {
  area: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  observation: string;
  recommendation: string;
}
export interface SowGap {
  requirement: string;
  status: 'met' | 'partially_met' | 'not_met' | 'not_determinable';
  detail: string;
}
export interface ImplementationReview {
  summary: string;
  findings: ReviewFinding[];
  sowGaps: SowGap[];
}

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'low', 'medium', 'high'] },
          observation: { type: 'string' },
          recommendation: { type: 'string' }
        },
        required: ['area', 'severity', 'observation', 'recommendation'],
        additionalProperties: false
      }
    },
    sowGaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requirement: { type: 'string' },
          status: { type: 'string', enum: ['met', 'partially_met', 'not_met', 'not_determinable'] },
          detail: { type: 'string' }
        },
        required: ['requirement', 'status', 'detail'],
        additionalProperties: false
      }
    }
  },
  required: ['summary', 'findings', 'sowGaps'],
  additionalProperties: false
} as const;

export function buildReviewSystemPrompt(): string {
  return [
    'You are a Salesforce Data Cloud (Data 360) solution architect reviewing the ACTUAL configuration of a live org (already scanned - you are not scanning it yourself) against best practices and, if provided, against a specific SOW.',
    '',
    'Ground every finding in one of two ways - never invent a finding that isn\'t traceable to one of these:',
    '1. A specific item from the "Scanned Org Configuration" section below (cite it by name in the observation).',
    '2. A specific Data 360 Skill\'s whenToUse/bestPractices guidance (name the skill in the recommendation).',
    '',
    'Rules:',
    '- "summary" is required and must never be empty - write 1-3 sentences giving the overall picture of the scanned org\'s Data Cloud maturity/readiness before listing individual findings.',
    '- "findings" covers best-practice observations about what was actually found in the scan - e.g. a Data Stream configured in a way a skill advises against, a missing Identity Resolution ruleset where DMOs suggest one is needed, an activation target with no upstream published segment. Severity reflects delivery/data-quality/cost risk, not cosmetic preference.',
    '- NEVER put SOW-comparison content in "findings", and NEVER invent a finding with area "SOW Gaps" or similar - SOW comparisons ALWAYS go in the separate "sowGaps" array described below, never anywhere else.',
    '- If the scanned configuration is sparse (few or no items in a category), say so plainly in a finding rather than fabricating detail that isn\'t there.',
    '',
    'How to build "sowGaps" when a SOW is provided (follow these steps in order):',
    '1. Read the SOW and list out every distinct, concrete requirement or commitment it states (a numbered clause, a bullet, or a clearly stated capability). Do not skip any - a long SOW should produce many sowGaps entries, one per requirement, not a handful.',
    '2. For EACH requirement, judge its status ONLY by checking the "Scanned Org Configuration" section above - that section is the sole source of truth for what is actually built in the org. NEVER judge status by re-reading what the SOW itself says should happen - the SOW describes intent, not reality; only the scan describes reality.',
    '3. status="met" only when a specific scanned item is evidence the requirement is actually implemented (cite it in "detail"). status="not_met" when the scan positively shows the needed configuration is absent (e.g. a required DMO/Segment/Identity Resolution ruleset category has 0 items). status="partially_met" when some but not all of a multi-part requirement has scan evidence. status="not_determinable" only when the scan simply doesn\'t cover that kind of detail at all (e.g. a requirement about an external system the scan can\'t see into) - this is different from "not_met", which means the scan looked and found nothing.',
    '4. A trial/sandbox org with an otherwise-unimplemented SOW should produce mostly "not_met" entries, each naming the specific empty/missing scan category as evidence - that is a normal, expected, honest result, not a sign something went wrong.',
    '- If no SOW was provided, "sowGaps" MUST be an empty array - do not fabricate requirements to compare against.',
    '- Before finalizing your answer, check every entry in "findings": if its "area" mentions "SOW", "Gap", or "Requirement", delete that entry from "findings" - that content belongs only in "sowGaps", never duplicated into "findings" as well.',
    '- Respond with JSON matching the required schema only - no prose outside the JSON.'
  ].join('\n');
}

function formatScanResults(scanResults: ScanCategoryResult[]): string {
  return scanResults.map((r) => {
    if (r.status === 'error') return `- ${r.category}: ERROR - ${r.error}`;
    const items = r.items ?? [];
    if (items.length === 0) return `- ${r.category}: 0 items found${r.note ? ` (${r.note})` : ''}`;
    const itemLines = items.slice(0, 50).map((it) => {
      const rest = Object.entries(it).filter(([k]) => k !== 'name' && k !== 'displayName')
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
      return `    - ${it.displayName || it.name}${rest ? ` (${rest})` : ''}`;
    });
    const more = items.length > 50 ? `\n    ...and ${items.length - 50} more` : '';
    return `- ${r.category}: ${items.length} items\n${itemLines.join('\n')}${more}`;
  }).join('\n');
}

export function buildReviewUserPrompt(scanResults: ScanCategoryResult[], skills: Skill[], sowText?: string): string {
  const truncatedSow = sowText && sowText.length > SOW_TEXT_MAX_CHARS ? sowText.slice(0, SOW_TEXT_MAX_CHARS) : sowText;
  return [
    '## Data 360 Skills Library',
    formatSkillsBlock(skills),
    '',
    '## Scanned Org Configuration',
    formatScanResults(scanResults),
    '',
    sowText ? '## Statement of Work / Discovery Document (compare implementation against this)' : '',
    sowText && sowText.length > SOW_TEXT_MAX_CHARS ? `[Note: SOW text truncated to the first ${SOW_TEXT_MAX_CHARS.toLocaleString()} characters]` : '',
    truncatedSow ?? '',
    !sowText ? '## No SOW provided - review against general Data 360 best practices only. Return an empty "sowGaps" array.' : ''
  ].filter(Boolean).join('\n');
}

export function safeParseReview(raw: string): ImplementationReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Model response was not valid JSON.');
  }
  const p = parsed as Partial<ImplementationReview> | null;
  if (!p || typeof p !== 'object' || typeof p.summary !== 'string' || !Array.isArray(p.findings)) {
    throw new Error('Model response was missing required fields.');
  }
  return {
    summary: p.summary,
    findings: p.findings ?? [],
    sowGaps: Array.isArray(p.sowGaps) ? p.sowGaps : []
  };
}
