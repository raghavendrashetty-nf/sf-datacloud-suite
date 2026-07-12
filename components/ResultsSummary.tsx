'use client';

import { useState } from 'react';
import type { CalculationResult } from '@/lib/types';
import { fmtCredits, fmtUSD } from '@/lib/formatters';
import { PHASES, getPhaseTheme } from './PhaseTheme';

interface Props {
  result: CalculationResult;
}

function StatCard({ label, credits, cost }: { label: string; credits: number; cost: number }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{fmtCredits(credits)}</div>
      <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">credits</div>
      <div className="mt-0.5 text-xs tabular-nums text-slate-500">{fmtUSD(cost)}</div>
    </div>
  );
}

function FirstYearHero({ credits, cost }: { credits: number; cost: number }) {
  return (
    <div className="rounded-2xl bg-slate-900 text-white shadow-md p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-sky-300">
        First-Year Grand Total
      </div>
      <div className="mt-1.5 text-3xl font-black tabular-nums text-white leading-none">
        {fmtCredits(credits)}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
        credits
      </div>
      <div className="mt-2 pt-2 border-t border-slate-700">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-sky-300">
          Estimated USD Cost
        </div>
        <div className="mt-0.5 text-xl font-bold tabular-nums text-white">
          {fmtUSD(cost)}
        </div>
      </div>
      <p className="mt-2 text-[9px] text-slate-400 leading-tight">
        First-year total = Initial Load (one-time) + Annual Recurring
      </p>
    </div>
  );
}

function DonutChart({ result }: { result: CalculationResult }) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 68;
  const inner = 44;
  const total = result.perPhase.reduce((s, p) => s + p.annualCredits, 0);

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center h-[160px] w-full text-xs text-slate-400 text-center">
        Enter volumes to see distribution
      </div>
    );
  }

  // Count non-zero segments to detect single-phase case
  const nonZeroSegments = result.perPhase.filter((p) => p.annualCredits > 0);

  // SINGLE-PHASE CASE: draw a full annulus (ring) using that phase's color
  if (nonZeroSegments.length === 1) {
    const only = nonZeroSegments[0];
    const theme = getPhaseTheme(only.phase);
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[160px] h-auto mx-auto">
        <circle cx={cx} cy={cy} r={r} fill={theme.hex} />
        <circle cx={cx} cy={cy} r={inner - 1} fill="#fff" />
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-slate-500" fontSize="8">
          Annual
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-slate-900" fontSize="11" fontWeight="600">
          {fmtCredits(total)}
        </text>
      </svg>
    );
  }

  // MULTI-PHASE CASE: draw arcs
  let acc = 0;
  const segments = result.perPhase.map((p) => {
    const theme = getPhaseTheme(p.phase);
    const value = p.annualCredits;
    if (value <= 0) return null;
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += value;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const xi2 = cx + inner * Math.cos(end);
    const yi2 = cy + inner * Math.sin(end);
    const xi1 = cx + inner * Math.cos(start);
    const yi1 = cy + inner * Math.sin(start);
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`;
    return <path key={p.phase} d={d} fill={theme.hex} />;
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[160px] h-auto mx-auto">
      {segments}
      <circle cx={cx} cy={cy} r={inner - 1} fill="#fff" />
      <text x={cx} y={cy - 2} textAnchor="middle" className="fill-slate-500" fontSize="8">
        Annual
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="fill-slate-900" fontSize="11" fontWeight="600">
        {fmtCredits(total)}
      </text>
    </svg>
  );
}

function BarChart({ result }: { result: CalculationResult }) {
  const all = [...PHASES.map((p) => p.key), ...result.perPhase.map((p) => p.phase)];
  const uniquePhases = Array.from(new Set(all));
  const max = Math.max(1, ...result.perPhase.map((p) => p.annualCredits));
  return (
    <div className="w-full space-y-1.5">
      {uniquePhases.map((phaseKey) => {
        const theme = getPhaseTheme(phaseKey);
        const p = result.perPhase.find((x) => x.phase === phaseKey);
        const v = p?.annualCredits ?? 0;
        const pct = (v / max) * 100;
        return (
          <div key={phaseKey}>
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-slate-600 truncate mr-2">{theme.label}</span>
              <span className="tabular-nums text-slate-500 shrink-0">{fmtCredits(v)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: theme.hex }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

export default function ResultsSummary({ result }: Props) {
  const t = result.totals;
  const [showBar, setShowBar] = useState(true);

  return (
    <div className="space-y-3">
      <FirstYearHero
        credits={t.firstYearGrandTotalCredits}
        cost={t.firstYearGrandTotalUSD}
      />

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Daily"   credits={t.dailyCredits}   cost={t.dailyCostUSD} />
        <StatCard label="Monthly" credits={t.monthlyCredits} cost={t.monthlyCostUSD} />
        <StatCard label="Annual"  credits={t.annualCredits}  cost={t.annualCostUSD} />
        <StatCard label="Initial" credits={t.initialCredits} cost={t.initialCostUSD} />
      </div>

      <div className="card p-3">
        <h3 className="text-[11px] font-semibold text-slate-900 mb-1.5 uppercase tracking-wide">
          Annual Credits by Phase
        </h3>
        <DonutChart result={result} />
        <ul className="mt-2 space-y-0.5 text-[10px]">
          {result.perPhase.map((p) => {
            const theme = getPhaseTheme(p.phase);
            return (
              <li key={p.phase} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: theme.hex }} />
                <span className="text-slate-700 flex-1 truncate">{theme.label}</span>
                <span className="tabular-nums text-slate-500 shrink-0">{fmtCredits(p.annualCredits)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {showBar ? (
        <div className="card p-3">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-[11px] font-semibold text-slate-900 uppercase tracking-wide">
              Phase Breakdown
            </h3>
            <button
              type="button"
              onClick={() => setShowBar(false)}
              aria-label="Hide phase breakdown"
              title="Hide phase breakdown"
              className="text-slate-400 hover:text-slate-700 p-1 -m-1"
            >
              <ChartIcon />
            </button>
          </div>
          <BarChart result={result} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowBar(true)}
          className="w-full card p-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 hover:text-sky-600 hover:bg-slate-50 transition-colors"
        >
          <ChartIcon className="w-3.5 h-3.5" />
          Show phase breakdown
        </button>
      )}
    </div>
  );
}
