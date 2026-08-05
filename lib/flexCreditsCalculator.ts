// Flex Credits is Salesforce's newer, SEPARATE billing model (effective June 17, 2026) -
// distinct from the flat-rate "Credit-Based Consumption" (Data Services Credits) model in
// lib/calculator.ts. Two things make it structurally different, both modeled honestly here
// rather than approximated:
//   1. Production usage is tiered by CUMULATIVE CREDITS per calendar month (not raw volume) -
//      "Tier 2 includes up to the 1,500,000th credit; Tier 3 begins at credit 1,500,001" per
//      the rate card's own footnote. Sandbox is never tiered.
//   2. No $/credit USD rate is published - it's set per Order Form, so USD cost is opt-in here
//      (the user supplies their own rate) rather than assumed.
import type { Environment, Period } from './types';

export interface FlexTierBand { upTo: number | null; label: string; }
export interface FlexRateItem {
  key: string; phase: string; label: string; unit: string; unitDivisor: number;
  unitLabel: string; unitSingular: string; description: string;
  tiersProduction: number[]; // [base, tier2, tier3, tier4], aligned to tierSchedule order
  sandboxMultiplier: number;
}
export interface FlexRatesConfig {
  meta: { version: string; source: string; url: string; warning?: string; note?: string };
  settings: { daysPerYear: number; weeksPerYear: number; monthsPerYear: number };
  tierSchedule: FlexTierBand[];
  items: FlexRateItem[];
}

export interface FlexTierBreakdown { upTo: number | null; label: string; rate: number; unitsInBracket: number; credits: number; }

// Converts a monthly USAGE volume (rows/MB/etc.) into Flex Credits, correctly handling that the
// tier thresholds are denominated in CREDITS, not usage units. Each bracket's usage capacity is
// derived from its own credit capacity at its own rate (creditCapacity / rate * unitDivisor),
// then usage is allocated across brackets in order - the standard graduated/tiered-pricing
// pattern, applied to a credit-denominated (not usage-denominated) threshold.
export function calculateTieredFlexCredits(
  monthlyVolume: number, unitDivisor: number, tiersProduction: number[], tierSchedule: FlexTierBand[]
): { totalCredits: number; breakdown: FlexTierBreakdown[] } {
  let remaining = Math.max(0, monthlyVolume);
  let totalCredits = 0;
  let prevThreshold = 0;
  const breakdown: FlexTierBreakdown[] = [];

  for (let i = 0; i < tierSchedule.length; i++) {
    const band = tierSchedule[i];
    const rate = tiersProduction[i] ?? 0;
    if (remaining <= 0 || rate <= 0) {
      breakdown.push({ upTo: band.upTo, label: band.label, rate, unitsInBracket: 0, credits: 0 });
      continue;
    }
    const creditCapacity = band.upTo === null ? Infinity : band.upTo - prevThreshold;
    const unitCapacity = creditCapacity === Infinity ? Infinity : (creditCapacity / rate) * unitDivisor;
    const unitsInBracket = Math.min(remaining, unitCapacity);
    const creditsInBracket = (unitsInBracket / unitDivisor) * rate;
    totalCredits += creditsInBracket;
    breakdown.push({ upTo: band.upTo, label: band.label, rate, unitsInBracket, credits: creditsInBracket });
    remaining -= unitsInBracket;
    prevThreshold = band.upTo ?? prevThreshold;
  }
  return { totalCredits, breakdown };
}

// Flex Credit tiers reset on the 1st of each calendar month, so tiering math is always done on a
// MONTHLY-equivalent volume regardless of the period the user entered it in - e.g. "1,200,000
// rows/year" becomes 100,000 rows/month for tier purposes, same as Credit-Based Consumption's
// own day/week/month/year -> annual normalization, just centered on month instead of year.
export function monthlyMultiplierFor(period: Period, settings: FlexRatesConfig['settings']): number {
  switch (period) {
    case 'day': return settings.daysPerYear / settings.monthsPerYear;
    case 'week': return settings.weeksPerYear / settings.monthsPerYear;
    case 'month': return 1;
    case 'year': return 1 / settings.monthsPerYear;
  }
}

export interface FlexCalculatorInputs {
  environment: Environment;
  costPerCreditUSD: number | null; // null = not supplied - no published rate exists
  volumes: Record<string, number>;
  periods: Record<string, Period>; // defaults to 'year' per item if absent
}

export interface FlexItemResult {
  key: string; effectivePeriod: Period;
  monthlyCredits: number; weeklyCredits: number; dailyCredits: number; annualCredits: number;
  monthlyCostUSD: number | null; weeklyCostUSD: number | null; dailyCostUSD: number | null; annualCostUSD: number | null;
  breakdown: FlexTierBreakdown[]; // always monthly-scoped (tiers reset monthly) - empty for Sandbox (not tiered)
}
export interface FlexCalculationResult {
  perItem: Record<string, FlexItemResult>;
  totals: {
    dailyCredits: number; weeklyCredits: number; monthlyCredits: number; annualCredits: number;
    dailyCostUSD: number | null; weeklyCostUSD: number | null; monthlyCostUSD: number | null; annualCostUSD: number | null;
  };
}

export function calculateFlexCredits(inputs: FlexCalculatorInputs, rates: FlexRatesConfig): FlexCalculationResult {
  const perItem: Record<string, FlexItemResult> = {};
  let totalMonthlyCredits = 0;
  const cost = (credits: number) => (inputs.costPerCreditUSD != null ? credits * inputs.costPerCreditUSD : null);

  for (const item of rates.items) {
    const effectivePeriod: Period = inputs.periods[item.key] ?? 'year';
    const rawVolume = inputs.volumes[item.key] ?? 0;
    const monthlyVolume = rawVolume * monthlyMultiplierFor(effectivePeriod, rates.settings);

    let monthlyCredits: number;
    let breakdown: FlexTierBreakdown[] = [];
    if (inputs.environment === 'Sandbox') {
      monthlyCredits = (monthlyVolume / item.unitDivisor) * item.sandboxMultiplier;
    } else {
      const tiered = calculateTieredFlexCredits(monthlyVolume, item.unitDivisor, item.tiersProduction, rates.tierSchedule);
      monthlyCredits = tiered.totalCredits;
      breakdown = tiered.breakdown;
    }
    const annualCredits = monthlyCredits * rates.settings.monthsPerYear;
    const dailyCredits = annualCredits / rates.settings.daysPerYear;
    const weeklyCredits = annualCredits / rates.settings.weeksPerYear;
    perItem[item.key] = {
      key: item.key, effectivePeriod,
      dailyCredits, weeklyCredits, monthlyCredits, annualCredits,
      dailyCostUSD: cost(dailyCredits), weeklyCostUSD: cost(weeklyCredits), monthlyCostUSD: cost(monthlyCredits), annualCostUSD: cost(annualCredits),
      breakdown
    };
    totalMonthlyCredits += monthlyCredits;
  }

  const totalAnnualCredits = totalMonthlyCredits * rates.settings.monthsPerYear;
  const totalDailyCredits = totalAnnualCredits / rates.settings.daysPerYear;
  const totalWeeklyCredits = totalAnnualCredits / rates.settings.weeksPerYear;
  return {
    perItem,
    totals: {
      dailyCredits: totalDailyCredits, weeklyCredits: totalWeeklyCredits,
      monthlyCredits: totalMonthlyCredits, annualCredits: totalAnnualCredits,
      dailyCostUSD: cost(totalDailyCredits), weeklyCostUSD: cost(totalWeeklyCredits),
      monthlyCostUSD: cost(totalMonthlyCredits), annualCostUSD: cost(totalAnnualCredits)
    }
  };
}
