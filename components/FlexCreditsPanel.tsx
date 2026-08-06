'use client';

import { useMemo, useState } from 'react';
import { PHASES, getPhaseTheme } from '@/components/PhaseTheme';
import CollapsibleSection from '@/components/CollapsibleSection';
import ExportFlexPDFButton from '@/components/ExportFlexPDFButton';
import type { useFlexCredits } from '@/hooks/useFlexCredits';
import type { FlexRateItem } from '@/lib/flexCreditsCalculator';
import type { Period } from '@/lib/types';

type FlexCreditsState = ReturnType<typeof useFlexCredits>;

function ChevronDown({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function fmtUSD(n: number | null): string {
  return n == null ? '—' : `$${fmt(n, 2)}`;
}

const PERIOD_LABEL_PER: Record<Period, string> = { day: '/ day', week: '/ week', month: '/ month', year: '/ year' };
const PERIOD_WORD: Record<Period, string> = { day: 'day', week: 'week', month: 'month', year: 'year' };
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Left column - mirrors CalculatorSidebar's position/role for the Credit-Based Consumption mode
// (environment + cost controls), plus the model-disambiguation warning specific to Flex Credits.
export function FlexCreditsControls({ flex }: { flex: FlexCreditsState }) {
  const { rates, environment, setEnvironment, costPerCreditUSD, setCostPerCreditUSD, inputs, result, reset } = flex;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <strong>Flex Credits</strong> is a separate, newer Salesforce billing model (effective June 17, 2026) - a shared credit pool spanning Data 360, Agentforce, and Slack. It is NOT the same currency as Credit-Based Consumption (Data Services Credits); the two totals are not comparable. Only orgs purchasing/renewing after Feb 24, 2026 can be on this model.
        {rates.meta.url ? <> <a href={rates.meta.url} target="_blank" rel="noreferrer" className="underline font-semibold">View the official rate card &rarr;</a></> : null}
      </div>

      <div className="card p-3 space-y-3">
        <div>
          <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Environment</span>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {(['Production', 'Sandbox'] as const).map((env) => (
              <button key={env} type="button" onClick={() => setEnvironment(env)}
                className={`flex-1 px-2 py-1.5 text-sm font-semibold ${environment === env ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {env}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Cost / Flex Credit ($)</label>
          <input type="number" min={0} step="0.0001" placeholder="from your Order Form"
            value={costPerCreditUSD ?? ''} onChange={(e) => setCostPerCreditUSD(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        {costPerCreditUSD == null ? (
          <p className="text-[11px] text-slate-500">No public $/credit rate exists for Flex Credits - it&apos;s set per Order Form. Enter your own rate to see USD estimates.</p>
        ) : (
          <p className="text-[11px] text-slate-500">Defaulted to $0.005 (Credit-Based Consumption&apos;s rate) - Flex Credits has no published $/credit rate of its own. Replace with your Order Form&apos;s actual rate for a real estimate.</p>
        )}
        {environment === 'Sandbox' ? (
          <p className="text-[11px] text-slate-500">Sandbox usage is not tiered - a single flat rate applies regardless of volume.</p>
        ) : (
          <p className="text-[11px] text-slate-500">Production usage is tiered by cumulative credits per calendar month (resets on the 1st). Whatever Input Unit you choose per item below is converted to a monthly-equivalent volume for tiering - see Example Breakdown on any item for the math.</p>
        )}
      </div>

      <div className="card p-3 space-y-2">
        <h2 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">Export & Reset</h2>
        <ExportFlexPDFButton rates={rates} inputs={inputs} result={result} />
        <button type="button" onClick={reset}
          className="w-full text-xs text-slate-500 hover:text-rose-600 underline underline-offset-2">
          Reset all values
        </button>
      </div>
    </div>
  );
}

function FlexItemCard({ item, flex }: { item: FlexRateItem; flex: FlexCreditsState }) {
  const { rates, environment, volumes, periods, setVolume, setPeriod, result } = flex;
  const theme = getPhaseTheme(item.phase);
  const itemResult = result.perItem[item.key];
  const effectivePeriod: Period = periods[item.key] ?? 'year';
  const primaryLabel = `${capitalize(item.unitLabel)} ${PERIOD_LABEL_PER[effectivePeriod]}`;
  const perPeriodCredits =
    effectivePeriod === 'day' ? itemResult.dailyCredits :
    effectivePeriod === 'week' ? itemResult.weeklyCredits :
    effectivePeriod === 'month' ? itemResult.monthlyCredits : itemResult.annualCredits;
  const perPeriodCostUSD =
    effectivePeriod === 'day' ? itemResult.dailyCostUSD :
    effectivePeriod === 'week' ? itemResult.weeklyCostUSD :
    effectivePeriod === 'month' ? itemResult.monthlyCostUSD : itemResult.annualCostUSD;

  return (
    <div className={`card p-3 border-t-4 border-t-${theme.color}-500`}>
      <h3 className="text-sm font-semibold text-slate-900">{item.label}</h3>
      <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>

      <div className={`mt-2 rounded-lg border border-${theme.color}-200 bg-${theme.color}-50 p-2 flex items-center gap-2 flex-wrap`}>
        <label htmlFor={`flex-period-${item.key}`} className={`text-[10px] uppercase font-bold tracking-wide text-${theme.color}-700`}>Input Unit</label>
        <select id={`flex-period-${item.key}`} value={effectivePeriod}
          onChange={(e) => setPeriod(item.key, e.target.value as Period)}
          className={`border border-${theme.color}-300 bg-white rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-${theme.color}-400`}>
          <option value="day">Per Day</option>
          <option value="week">Per Week</option>
          <option value="month">Per Month</option>
          <option value="year">Per Year (default)</option>
        </select>
      </div>

      <div className="mt-2 rounded-lg border border-slate-200 p-2">
        <label className="block text-[11px] font-medium text-slate-700 mb-1">{primaryLabel}</label>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <input type="number" min={0} value={volumes[item.key] ?? ''} placeholder="0"
            onChange={(e) => setVolume(item.key, Number(e.target.value) || 0)}
            className="flex-1 min-w-[9rem] max-w-[15rem] border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <div className="ml-auto text-right shrink-0 text-sm">
            <span className="font-semibold tabular-nums text-slate-900">{fmt(perPeriodCredits, 2)} credits per {PERIOD_WORD[effectivePeriod]}</span>
            {perPeriodCostUSD != null ? <><span className="text-slate-400"> | </span><span className="text-slate-500 tabular-nums">{fmtUSD(perPeriodCostUSD)}</span></> : null}
          </div>
        </div>
      </div>

      <CollapsibleSection title="Example Breakdown">
        <div className="space-y-1">
          <div>Input: <strong>{fmt(volumes[item.key] ?? 0)}</strong> {item.unitLabel} per {PERIOD_WORD[effectivePeriod]}
            <span className="text-slate-500"> &rarr; normalized to a monthly-equivalent volume for tiering (tiers reset each calendar month)</span>
          </div>
          {environment === 'Production' ? (
            <table className="w-full text-[11px] mt-1">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-semibold pb-1">Monthly Tier</th>
                  <th className="text-right font-semibold pb-1">Rate</th>
                  <th className="text-right font-semibold pb-1">{item.unitLabel} used</th>
                  <th className="text-right font-semibold pb-1">Credits</th>
                </tr>
              </thead>
              <tbody>
                {itemResult.breakdown.map((b, i) => (
                  <tr key={i} className={b.unitsInBracket > 0 ? 'text-slate-800' : 'text-slate-400'}>
                    <td className="py-0.5">{b.label}</td>
                    <td className="py-0.5 text-right">{fmt(b.rate, 2)}</td>
                    <td className="py-0.5 text-right">{fmt(b.unitsInBracket)}</td>
                    <td className="py-0.5 text-right">{fmt(b.credits, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>Sandbox flat rate: <strong>{fmt(item.sandboxMultiplier, 2)}</strong> credits {item.unit.toLowerCase()} (not tiered)</div>
          )}
          <div>Per-period credits ({PERIOD_WORD[effectivePeriod]}): <strong>{fmt(perPeriodCredits, 2)}</strong>
            {perPeriodCostUSD != null ? <span className="text-slate-500"> &middot; {fmtUSD(perPeriodCostUSD)}</span> : null}</div>
          <div>Monthly credits: <strong>{fmt(itemResult.monthlyCredits, 2)}</strong>
            {itemResult.monthlyCostUSD != null ? <span className="text-slate-500"> &middot; {fmtUSD(itemResult.monthlyCostUSD)}</span> : null}</div>
          <div>Annual credits: <strong>{fmt(itemResult.annualCredits, 2)}</strong>
            {itemResult.annualCostUSD != null ? <span className="text-slate-500"> &middot; {fmtUSD(itemResult.annualCostUSD)}</span> : null}</div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Usage Details">
        <div className="space-y-1">
          <div><strong>Unit:</strong> {item.unit}</div>
          <div><strong>Production tiers (per 1M-equivalent unless noted):</strong> {item.tiersProduction.map((r, i) => `${rates.tierSchedule[i]?.label ?? `Tier ${i + 1}`}: ${fmt(r, 2)}`).join(' · ')}</div>
          <div><strong>Sandbox:</strong> {fmt(item.sandboxMultiplier, 2)} (flat, not tiered)</div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// Middle column - items grouped into numbered stage sections (same Phase 1/2/3... grouping and
// collapsed-by-default convention as Credit-Based Consumption's Rate Item Phases list), so both
// modes feel like the same product. Input Unit + Example Breakdown/Usage Details per item mirror
// ItemCard's pattern from that mode for a consistent experience.
export function FlexCreditsItemList({ flex }: { flex: FlexCreditsState }) {
  const { rates } = flex;

  const grouped = useMemo(() => {
    const map: Record<string, FlexRateItem[]> = {};
    for (const item of rates.items) {
      if (!map[item.phase]) map[item.phase] = [];
      map[item.phase].push(item);
    }
    return map;
  }, [rates.items]);

  const orderedPhaseKeys = useMemo(() => {
    const known = PHASES.map((p) => p.key as string);
    const extras: string[] = [];
    for (const item of rates.items) {
      if (!known.includes(item.phase) && !extras.includes(item.phase)) extras.push(item.phase);
    }
    return [...known, ...extras];
  }, [rates.items]);

  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  function togglePhase(key: string) { setExpandedPhases((prev) => ({ ...prev, [key]: !prev[key] })); }
  function setAllPhases(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const key of orderedPhaseKeys) next[key] = open;
    setExpandedPhases(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-2">Stages</span>
        <button type="button" onClick={() => setAllPhases(true)} className="text-xs text-sky-600 hover:text-sky-800 hover:underline">Expand all</button>
        <span className="text-slate-300">|</span>
        <button type="button" onClick={() => setAllPhases(false)} className="text-xs text-slate-500 hover:text-slate-900 hover:underline">Collapse all</button>
        <span className="ml-auto text-[11px] text-slate-500 italic">All stages collapsed by default</span>
      </div>

      {orderedPhaseKeys.map((phaseKey) => {
        const items = grouped[phaseKey] ?? [];
        if (items.length === 0) return null;
        const known = PHASES.find((p) => p.key === phaseKey);
        const label = known?.label ?? phaseKey;
        const order = known?.order;
        const color = known?.color ?? 'slate';
        const isOpen = expandedPhases[phaseKey] === true;
        return (
          <section key={phaseKey} className="card overflow-hidden">
            <button type="button" onClick={() => togglePhase(phaseKey)}
              className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left" aria-expanded={isOpen}>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
              <span className={`chip bg-${color}-100 text-${color}-700`}>{order ? `Stage ${order}` : 'Custom Stage'}</span>
              <h2 className="text-lg font-semibold text-slate-900 flex-1">{label}</h2>
              <span className="text-xs text-slate-500">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </button>
            {isOpen ? (
              <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
                  {items.map((item) => <FlexItemCard key={item.key} item={item} flex={flex} />)}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function StatCard({ label, credits, cost }: { label: string; credits: number; cost: number | null }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{fmt(credits, 1)}</div>
      <div className="text-[9px] font-medium uppercase tracking-wide text-slate-500">credits</div>
      {cost != null ? <div className="mt-0.5 text-xs tabular-nums text-slate-500">${fmt(cost, 2)}</div> : null}
    </div>
  );
}

// Right column - sticky totals, in the same grid position and visual language (dark hero card +
// stat grid) as ResultsSummary uses for Credit-Based Consumption, for a consistent experience.
export function FlexCreditsSummary({ flex }: { flex: FlexCreditsState }) {
  const t = flex.result.totals;
  const nonZeroItems = flex.rates.items
    .map((item) => ({ item, r: flex.result.perItem[item.key] }))
    .filter(({ r }) => r.annualCredits > 0);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 pb-3 bg-[#f7f8fb]">
        <div className="rounded-2xl bg-slate-900 text-white shadow-md p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Total Flex Credits (Annual)</div>
          <div className="mt-1.5 text-3xl font-black tabular-nums text-white leading-none">{fmt(t.annualCredits, 1)}</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">credits/year &middot; {fmt(t.monthlyCredits, 1)}/mo</div>
          {t.annualCostUSD != null ? (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-emerald-300">Estimated USD Cost</div>
              <div className="mt-0.5 text-xl font-bold tabular-nums text-white">${fmt(t.annualCostUSD, 2)}<span className="text-xs font-normal text-slate-400">/yr</span></div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Daily" credits={t.dailyCredits} cost={t.dailyCostUSD} />
        <StatCard label="Weekly" credits={t.weeklyCredits} cost={t.weeklyCostUSD} />
        <StatCard label="Monthly" credits={t.monthlyCredits} cost={t.monthlyCostUSD} />
        <StatCard label="Annual" credits={t.annualCredits} cost={t.annualCostUSD} />
      </div>
      <div className="card p-3">
        <h3 className="text-[11px] font-semibold text-slate-900 mb-1.5 uppercase tracking-wide">By Usage Type (annual)</h3>
        {nonZeroItems.length === 0 ? (
          <p className="text-xs text-slate-500">Enter volumes to see a breakdown.</p>
        ) : (
          <ul className="space-y-1">
            {nonZeroItems.map(({ item, r }) => {
              const theme = getPhaseTheme(item.phase);
              return (
                <li key={item.key} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: theme.hex }} />
                  <span className="text-slate-700 flex-1 truncate">{item.label}</span>
                  <span className="tabular-nums text-slate-500 shrink-0">{fmt(r.annualCredits, 1)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
