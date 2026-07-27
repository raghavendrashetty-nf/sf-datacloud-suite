import type { Skill } from './types';

export interface Recommendation {
  architecture: { phase: string; recommendation: string }[];
  matchedSkills: { skillId: string; skillName: string; rationale: string }[];
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  costSignal: { rateItemKeys: string[]; note: string };
}

export const RECOMMENDATION_SCHEMA = {
  type: 'object',
  properties: {
    architecture: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phase: { type: 'string' },
          recommendation: { type: 'string' }
        },
        required: ['phase', 'recommendation'],
        additionalProperties: false
      }
    },
    matchedSkills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          skillId: { type: 'string' },
          skillName: { type: 'string' },
          rationale: { type: 'string' }
        },
        required: ['skillId', 'skillName', 'rationale'],
        additionalProperties: false
      }
    },
    swot: {
      type: 'object',
      properties: {
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
        opportunities: { type: 'array', items: { type: 'string' } },
        threats: { type: 'array', items: { type: 'string' } }
      },
      required: ['strengths', 'weaknesses', 'opportunities', 'threats'],
      additionalProperties: false
    },
    costSignal: {
      type: 'object',
      properties: {
        rateItemKeys: { type: 'array', items: { type: 'string' } },
        note: { type: 'string' }
      },
      required: ['rateItemKeys', 'note'],
      additionalProperties: false
    }
  },
  required: ['architecture', 'matchedSkills', 'swot', 'costSignal'],
  additionalProperties: false
} as const;

export const SOW_TEXT_MAX_CHARS = 100_000;

export function buildSystemPrompt(): string {
  return [
    'You are a Salesforce Data Cloud (Data 360) solution architect helping a project team turn a raw Statement of Work (SOW) or Discovery Document into an architecture recommendation.',
    '',
    'Two distinct kinds of content go in your response - do not confuse them:',
    '1. SKILL-GROUNDED content: any claim in "matchedSkills", and any part of "architecture"/"costSignal" that cites a specific Data Cloud capability, limit, refresh mode, or rate item. This must come ONLY from the Data 360 Skills list below - never invent a specific capability, limit, or rate item that isn\'t in a skill.',
    '2. GENERAL Data Cloud knowledge: standard, widely-known Data Cloud phase concepts (Ingestion/Connect-Harmonize-Unify, Real-Time, Analyze & Predict, Act, Activation, Compute) that you already know as a solution architect. Use this to give a basic, honest recommendation even when no skill matches - just don\'t state it as if it came from a skill, and don\'t invent specific numbers, limits, or feature names.',
    '',
    'Rules:',
    '- ALWAYS return at least one entry in "architecture" and at least one item in each SWOT list, using general Data Cloud domain knowledge if no skill matches the SOW closely. Only "matchedSkills" is allowed to be an empty array - that happens when the SOW genuinely doesn\'t touch anything in the skill library, and is a normal, honest result. Never leave "architecture" or "swot" empty just because "matchedSkills" is empty.',
    '- Organize the "architecture" section by Data Cloud phase (use the phase keys exactly as given in the skills: ingestion, realtime, insights, act, activation, compute, or "__general__" for cross-cutting guidance). Map every phase the SOW plausibly touches, not just the phases a skill happens to cover.',
    '- For "matchedSkills", only include skills whose whenToUse/bestPractices are actually relevant to something stated in the SOW - explain the rationale by pointing at the specific SOW language that triggered the match. Do not force a match that isn\'t really there.',
    '- For "swot", analyze the proposed approach\'s Strengths/Weaknesses/Opportunities/Threats from a delivery-risk and cost perspective, not generic marketing language.',
    '- For "costSignal", list the relatedRateItemKeys from any matched skills that a follow-up cost estimate should include. If nothing matched, return an empty rateItemKeys array and use the note to point at which Credit Calculator phase(s) to size manually instead.',
    '- If the SOW does not give enough detail for a section, say so plainly in that section\'s text rather than leaving the section empty.',
    '- Respond with JSON matching the required schema only - no prose outside the JSON.'
  ].join('\n');
}

export function buildUserPrompt(sowText: string, skills: Skill[]): string {
  const truncated = sowText.length > SOW_TEXT_MAX_CHARS;
  const clippedText = truncated ? sowText.slice(0, SOW_TEXT_MAX_CHARS) : sowText;
  const skillsBlock = skills.map((s) => (
    `- id: ${s.id}\n  name: ${s.name}\n  phase: ${s.phase}\n  summary: ${s.summary}\n  whenToUse: ${s.whenToUse}\n  bestPractices: ${s.bestPractices}\n  relatedRateItemKeys: ${s.relatedRateItemKeys.join(', ') || '(none)'}`
  )).join('\n\n');

  return [
    '## Data 360 Skills Library',
    skillsBlock || '(no skills defined)',
    '',
    '## Statement of Work / Discovery Document',
    truncated ? `[Note: SOW text truncated to the first ${SOW_TEXT_MAX_CHARS.toLocaleString()} characters]` : '',
    clippedText
  ].filter(Boolean).join('\n');
}

export function safeParseRecommendation(raw: string): Recommendation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Model response was not valid JSON.');
  }
  const p = parsed as Partial<Recommendation> | null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.architecture) || !Array.isArray(p.matchedSkills) || !p.swot || !p.costSignal) {
    throw new Error('Model response was missing required fields.');
  }
  return {
    architecture: p.architecture ?? [],
    matchedSkills: p.matchedSkills ?? [],
    swot: {
      strengths: p.swot?.strengths ?? [],
      weaknesses: p.swot?.weaknesses ?? [],
      opportunities: p.swot?.opportunities ?? [],
      threats: p.swot?.threats ?? []
    },
    costSignal: { rateItemKeys: p.costSignal?.rateItemKeys ?? [], note: p.costSignal?.note ?? '' }
  };
}
