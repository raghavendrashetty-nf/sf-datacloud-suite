import type { CalculationResult, CalculatorInputs, ItemResult, Period, PhaseTotal, RatesConfig } from './types';

function annualMultiplierFor(period: Period, rates: RatesConfig): number {
  switch (period) {
    case 'day':   return rates.settings.daysPerYear;
    case 'week':  return rates.settings.weeksPerYear;
    case 'month': return rates.settings.monthsPerYear;
    case 'year':  return 1;
  }
}

export function calculate(inputs: CalculatorInputs, rates: RatesConfig): CalculationResult {
  const overheadFactor = 1 + (inputs.overheadPct || 0) / 100;
  const daysPerYear = rates.settings.daysPerYear;
  const weeksPerYear = rates.settings.weeksPerYear;
  const monthsPerYear = rates.settings.monthsPerYear;

  const perItem: Record<string, ItemResult> = {};
  const phaseAccumulator: Record<string, PhaseTotal> = {};
  let totDailyCredits = 0, totWeeklyCredits = 0, totMonthlyCredits = 0, totAnnualCredits = 0, totInitialCredits = 0;

  for (const item of rates.items) {
    const rate = item.credits[inputs.environment] ?? 0;
    const volume = inputs.itemVolumes[item.key] ?? 0;
    const initial = item.supportsInitial ? (inputs.itemInitials[item.key] ?? 0) : 0;
    const effectivePeriod: Period = inputs.itemPeriods[item.key] ?? 'year';
    const annualMul = annualMultiplierFor(effectivePeriod, rates);
    const annualCredits = (volume / item.unitDivisor) * rate * annualMul * overheadFactor;
    const dailyCredits = annualCredits / daysPerYear;
    const weeklyCredits = annualCredits / weeksPerYear;
    const monthlyCredits = annualCredits / monthsPerYear;
    const initialCredits = (initial / item.unitDivisor) * rate * overheadFactor;
    const dailyCostUSD = dailyCredits * inputs.costPerCreditUSD;
    const weeklyCostUSD = weeklyCredits * inputs.costPerCreditUSD;
    const monthlyCostUSD = monthlyCredits * inputs.costPerCreditUSD;
    const annualCostUSD = annualCredits * inputs.costPerCreditUSD;
    const initialCostUSD = initialCredits * inputs.costPerCreditUSD;
    perItem[item.key] = { key: item.key, effectivePeriod, dailyCredits, weeklyCredits, monthlyCredits, annualCredits, initialCredits, dailyCostUSD, weeklyCostUSD, monthlyCostUSD, annualCostUSD, initialCostUSD };
    totDailyCredits += dailyCredits; totWeeklyCredits += weeklyCredits; totMonthlyCredits += monthlyCredits; totAnnualCredits += annualCredits; totInitialCredits += initialCredits;
    if (!phaseAccumulator[item.phase]) phaseAccumulator[item.phase] = { phase: item.phase, annualCredits: 0, annualCostUSD: 0, initialCredits: 0, initialCostUSD: 0 };
    const acc = phaseAccumulator[item.phase];
    acc.annualCredits += annualCredits; acc.annualCostUSD += annualCostUSD; acc.initialCredits += initialCredits; acc.initialCostUSD += initialCostUSD;
  }
  const dailyCostUSD = totDailyCredits * inputs.costPerCreditUSD;
  const weeklyCostUSD = totWeeklyCredits * inputs.costPerCreditUSD;
  const monthlyCostUSD = totMonthlyCredits * inputs.costPerCreditUSD;
  const annualCostUSD = totAnnualCredits * inputs.costPerCreditUSD;
  const initialCostUSD = totInitialCredits * inputs.costPerCreditUSD;
  return {
    perItem,
    totals: {
      dailyCredits: totDailyCredits, weeklyCredits: totWeeklyCredits, monthlyCredits: totMonthlyCredits, annualCredits: totAnnualCredits, initialCredits: totInitialCredits,
      dailyCostUSD, weeklyCostUSD, monthlyCostUSD, annualCostUSD, initialCostUSD,
      firstYearGrandTotalUSD: annualCostUSD + initialCostUSD, firstYearGrandTotalCredits: totAnnualCredits + totInitialCredits
    },
    perPhase: Object.values(phaseAccumulator)
  };
}
