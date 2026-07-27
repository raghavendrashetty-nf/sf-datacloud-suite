export type Environment = 'Production' | 'Sandbox';
export type Period = 'day' | 'week' | 'month' | 'year';
export type PhaseKey = string;

export interface RateItem {
  key: string; phase: PhaseKey; label: string; unit: string; unitDivisor: number;
  unitLabel: string; unitSingular: string; initialLabel: string; supportsInitial: boolean;
  credits: { Production: number; Sandbox: number };
  description: string; processingRateNote: string; usageNote: string;
}
export interface RatesConfig {
  meta: { version: string; source: string; url: string; warning?: string };
  settings: { costPerCreditUSD: number; daysPerYear: number; weeksPerYear: number; monthsPerYear: number };
  items: RateItem[];
}
export interface CalculatorInputs {
  environment: Environment; costPerCreditUSD: number; overheadPct: number;
  itemVolumes: Record<string, number>; itemInitials: Record<string, number>; itemPeriods: Record<string, Period>;
}
export interface ItemResult {
  key: string; effectivePeriod: Period;
  dailyCredits: number; weeklyCredits: number; monthlyCredits: number; annualCredits: number; initialCredits: number;
  dailyCostUSD: number; weeklyCostUSD: number; monthlyCostUSD: number; annualCostUSD: number; initialCostUSD: number;
}
export interface PhaseTotal {
  phase: PhaseKey; annualCredits: number; annualCostUSD: number; initialCredits: number; initialCostUSD: number;
}
export interface CalculationResult {
  perItem: Record<string, ItemResult>;
  totals: {
    dailyCredits: number; weeklyCredits: number; monthlyCredits: number; annualCredits: number; initialCredits: number;
    dailyCostUSD: number; weeklyCostUSD: number; monthlyCostUSD: number; annualCostUSD: number; initialCostUSD: number;
    firstYearGrandTotalUSD: number; firstYearGrandTotalCredits: number;
  };
  perPhase: PhaseTotal[];
}

export interface Skill {
  id: string;
  name: string;
  phase: PhaseKey | '__general__';
  summary: string;
  whenToUse: string;
  bestPractices: string;
  relatedRateItemKeys: string[];
  docs: { label: string; url: string }[];
  createdAt: string;
  updatedAt: string;
}
export interface SkillsConfig {
  meta: { version: string };
  skills: Skill[];
}
