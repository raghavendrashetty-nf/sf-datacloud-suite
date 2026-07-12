'use client';

import type { Environment, ItemResult, Period, RateItem } from '@/lib/types';
import { fmtCredits, fmtUSD } from '@/lib/formatters';
import { getPhaseTheme } from './PhaseTheme';
import NumberSpinner from './NumberSpinner';
import CollapsibleSection from './CollapsibleSection';

interface Props {
  item: RateItem;
  environment: Environment;
  itemPeriod: Period;
  volume: number;
  initial: number;
  overheadPct: number;
  costPerCreditUSD: number;
  result: ItemResult;
  onVolumeChange: (n: number) => void;
  onInitialChange: (n: number) => void;
  onPeriodChange: (p: Period) => void;
}

const PERIOD_LABEL_PER: Record<Period, string> = {
  day: '/ day', week: '/ week', month: '/ month', year: '/ year'
};

const PERIOD_WORD: Record<Period, string> = {
  day: 'day', week: 'week', month: 'month', year: 'year'
};

const MULTIPLIER: Record<Period, number> = {
  day: 365, week: 52, month: 12, year: 1
};

const MULTIPLIER_NOTE: Record<Period, string> = {
  day: '365 days per year',
  week: '52 weeks per year',
  month: '12 months per year',
  year: 'input is already annual, so multiplier is 1'
};

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export default function ItemCard({
  item, environment, itemPeriod,
  volume, initial, overheadPct, costPerCreditUSD, result,
  onVolumeChange, onInitialChange, onPeriodChange
}: Props) {
  const theme = getPhaseTheme(item.phase);
  const rate = item.credits[environment] ?? 0;

  // Detect FREE item (no charge in this environment)
  const isFree = rate === 0;

  const overheadFactor = 1 + overheadPct / 100;
  const showOverhead = overheadPct > 0;

  const effectivePeriod: Period = itemPeriod ?? 'year';
  const primaryLabel = `${capitalize(item.unitLabel)} ${PERIOD_LABEL_PER[effectivePeriod]}`;
  const suffix = `${item.unitLabel} ${PERIOD_LABEL_PER[effectivePeriod]}`;
  const multiplier = MULTIPLIER[effectivePeriod];

  const perPeriodCredits =
    effectivePeriod === 'day'   ? result.dailyCredits :
    effectivePeriod === 'week'  ? result.weeklyCredits :
    effectivePeriod === 'month' ? result.monthlyCredits :
                                  result.annualCredits;
  const perPeriodCost = perPeriodCredits * costPerCreditUSD;

  const formulaParts = [
    `(volume ÷ ${item.unitDivisor})`,
    `× ${rate}`,
    `× ${multiplier}`
  ];
  if (showOverhead) formulaParts.push(`× ${overheadFactor.toFixed(2)}`);
  const formula = formulaParts.join(' ');

  return (
    <div className={`card p-3 relative border-t-4 border-t-${theme.color}-500 ${isFree ? 'bg-emerald-50/30' : ''}`}>
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {isFree ? (
          <span
            className="chip bg-emerald-500 text-white font-bold"
            title="This item is free — no credits are consumed"
          >
            FREE
          </span>
        ) : null}
        <span
          className={`chip bg-${theme.color}-100 text-${theme.color}-700`}
          title={`Phase: ${theme.label}`}
        >
          {theme.label}
        </span>
      </div>

      <h3 className={`text-sm font-semibold text-slate-900 ${isFree ? 'pr-32' : 'pr-24'}`}>{item.label}</h3>
      <p className="text-[11px] text-slate-500 mt-1 leading-snug">{item.description}</p>

      {/* FREE explanation banner */}
      {isFree ? (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5">
            <path d="M20 12l-8 8-4-4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <p className="text-[11px] text-emerald-800 leading-snug">
            <strong>This item is free in {environment}.</strong> No credits are consumed no matter how many
            {' '}{item.unitLabel} you enter. The calculator will always show 0 credits and $0 for this item.
          </p>
        </div>
      ) : null}

      {/* Per-item Input Unit selector */}
      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2 flex items-center gap-2 flex-wrap">
        <label
          htmlFor={`period-${item.key}`}
          className="text-[10px] uppercase font-bold tracking-wide text-sky-700"
        >
          Input Unit
        </label>
        <select
          id={`period-${item.key}`}
          value={effectivePeriod}
          onChange={(e) => onPeriodChange(e.target.value as Period)}
          className="border border-sky-300 bg-white rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          <option value="day">Per Day</option>
          <option value="week">Per Week</option>
          <option value="month">Per Month</option>
          <option value="year">Per Year (default)</option>
        </select>
      </div>

      <div className="mt-2">
        <label className="block text-[11px] font-medium text-slate-700 mb-1">
          {primaryLabel}
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <NumberSpinner
              value={volume}
              onChange={onVolumeChange}
              ariaLabel={`${item.label} — ${primaryLabel}`}
              suffix={suffix}
            />
          </div>
          <div className="text-right min-w-[90px] shrink-0">
            <div className="text-[9px] uppercase tracking-wide text-slate-500">Credits / {PERIOD_WORD[effectivePeriod]}</div>
            <div
              className={`text-sm font-semibold tabular-nums ${isFree ? 'text-emerald-700' : 'text-slate-900'}`}
              title={`${environment} rate: ${rate} credits per ${item.unit.toLowerCase()}`}
            >
              {isFree ? 'FREE' : fmtCredits(perPeriodCredits)}
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">{fmtUSD(perPeriodCost)}</div>
          </div>
        </div>
      </div>

      {item.supportsInitial ? (
        <div className={`mt-2 rounded-lg bg-${theme.color}-50 border border-${theme.color}-100 p-2`}>
          <label className="block text-[11px] font-semibold text-slate-800 mb-1">
            {item.initialLabel} (Day 0, one-time)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <NumberSpinner
                value={initial}
                onChange={onInitialChange}
                ariaLabel={`${item.label} — ${item.initialLabel}`}
                suffix={item.unitLabel}
              />
            </div>
            <div className="text-right min-w-[90px] shrink-0">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">Credits</div>
              <div className={`text-sm font-semibold tabular-nums ${isFree ? 'text-emerald-700' : 'text-slate-900'}`}>
                {isFree ? 'FREE' : fmtCredits(result.initialCredits)}
              </div>
              <div className="text-[10px] text-slate-500 tabular-nums">{fmtUSD(result.initialCostUSD)}</div>
            </div>
          </div>
          <p className="mt-1 text-[10px] italic text-slate-500 leading-snug">
            Credits consumed only during the initial Day&nbsp;0 load. Added once to the first-year
            total and never repeated.
          </p>
        </div>
      ) : null}

      <CollapsibleSection title="Example Breakdown">
        <div className="space-y-1">
          <div>
            Rate ({environment}): <strong>{rate}</strong> credits per <em>{item.unit.toLowerCase()}</em>
            {isFree ? <span className="ml-1 text-emerald-700 font-semibold">(this item is free)</span> : null}
          </div>
          <div>
            Annualizer: <strong>{multiplier}</strong>
            <span className="text-slate-400"> ({MULTIPLIER_NOTE[effectivePeriod]})</span>
          </div>
          {showOverhead ? (
            <div>Overhead multiplier: <strong>{overheadFactor.toFixed(2)}</strong> (from {overheadPct}% overhead)</div>
          ) : null}
          <div>
            Formula: <code className="text-[11px]">{formula}</code>
          </div>
          <div>
            Per-period credits ({PERIOD_WORD[effectivePeriod]}): <strong>{fmtCredits(perPeriodCredits)}</strong>
            <span className="text-slate-400"> · {fmtUSD(perPeriodCost)}</span>
          </div>
          <div>Monthly credits: <strong>{fmtCredits(result.monthlyCredits)}</strong>
            <span className="text-slate-400"> · {fmtUSD(result.monthlyCostUSD)}</span>
          </div>
          <div>Annual credits: <strong>{fmtCredits(result.annualCredits)}</strong>
            <span className="text-slate-400"> · {fmtUSD(result.annualCostUSD)}</span>
          </div>
          {item.supportsInitial ? (
            <div>
              Initial (Day 0): <strong>{fmtCredits(result.initialCredits)}</strong>
              <span className="text-slate-400"> · {fmtUSD(result.initialCostUSD)}</span>
            </div>
          ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Usage Details">
        <div className="space-y-1">
          <div><strong>Processing Rate:</strong> {item.processingRateNote}</div>
          <div><strong>Note:</strong> {item.usageNote}</div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
