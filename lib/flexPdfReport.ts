'use client';

import type { Period } from './types';
import type { FlexCalculationResult, FlexCalculatorInputs, FlexRatesConfig } from './flexCreditsCalculator';
import { fmtCredits } from './formatters';

interface Options {
  rates: FlexRatesConfig; inputs: FlexCalculatorInputs; result: FlexCalculationResult;
  filename?: string;
}

const PHASE_LABELS: Record<string, string> = {
  ingestion: 'Ingestion', realtime: 'Real-Time', insights: 'Insights',
  act: 'Act', activation: 'Activation', compute: 'Compute'
};
function phaseLabel(key: string): string { return PHASE_LABELS[key] ?? key; }
function periodLabel(p: Period): string { return p.charAt(0).toUpperCase() + p.slice(1); }
function fmtUSDOrDash(n: number | null): string {
  if (n == null || !isFinite(n)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
}

function drawTableHeader(pdf: any, cols: { label: string; w: number }[], x0: number, y: number): number {
  pdf.setFillColor(30, 41, 59);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'bold');
  const rowW = cols.reduce((s, c) => s + c.w, 0);
  pdf.rect(x0, y, rowW, 6, 'F');
  let x = x0;
  for (const c of cols) { pdf.text(c.label, x + 1.5, y + 4); x += c.w; }
  return y + 6;
}

export async function generateFlexPDFReport({ rates, inputs, result, filename = 'sf-datacloud-flex-credits-estimate.pdf' }: Options): Promise<void> {
  const jsPDFmod: any = await import('jspdf');
  const JsPDFCtor = jsPDFmod.jsPDF ?? jsPDFmod.default;
  const pdf = new JsPDFCtor({ orientation: 'l', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;
  const now = new Date();

  function ensureSpace(need: number) {
    if (y + need > pageHeight - margin) { pdf.addPage(); y = margin; }
  }

  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageWidth, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('Salesforce Data Cloud - Flex Credits Estimate', margin, 14);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Generated: ${now.toLocaleString()}`, pageWidth - margin, 14, { align: 'right' });

  y = 30;
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10);
  pdf.text(`Environment: ${inputs.environment}`, margin, y);
  pdf.text(`Cost / Flex Credit: ${inputs.costPerCreditUSD != null ? fmtUSDOrDash(inputs.costPerCreditUSD) : 'Not set (no published rate)'}`, margin + 60, y);
  pdf.text(`Rate Source: ${rates.meta.source}`, margin + 150, y);
  y += 6;
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text('Flex Credits is a separate billing model from Credit-Based Consumption (Data Services Credits) - totals are not comparable across the two.', margin, y);
  y += 8;

  const t = result.totals;
  const kpis = [
    { label: 'Daily', credits: t.dailyCredits, cost: t.dailyCostUSD },
    { label: 'Weekly', credits: t.weeklyCredits, cost: t.weeklyCostUSD },
    { label: 'Monthly', credits: t.monthlyCredits, cost: t.monthlyCostUSD },
    { label: 'Annual', credits: t.annualCredits, cost: t.annualCostUSD }
  ];
  const kpiW = (pageWidth - margin * 2 - 3 * 4) / 4;
  const kpiH = 22;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 4);
    pdf.setFillColor(241, 245, 249); pdf.setTextColor(15, 23, 42);
    pdf.roundedRect(x, y, kpiW, kpiH, 2, 2, 'F');
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    pdf.text(k.label.toUpperCase(), x + 3, y + 5);
    pdf.setFontSize(11);
    pdf.text(fmtCredits(k.credits) + ' credits', x + 3, y + 12);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
    pdf.text(fmtUSDOrDash(k.cost), x + 3, y + 18);
  });
  y += kpiH + 8;
  pdf.setTextColor(15, 23, 42);

  ensureSpace(12);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42);
  pdf.text('Per-Item Detail', margin, y);
  y += 6;
  const cols = [
    { label: 'Phase', w: 34 }, { label: 'Item', w: 62 }, { label: 'Volume', w: 22 }, { label: 'Unit', w: 24 },
    { label: 'Cr/Day', w: 22 }, { label: 'Cr/Month', w: 24 }, { label: 'Cr/Year', w: 24 },
    { label: 'Annual $', w: 24 }
  ];
  y = drawTableHeader(pdf, cols, margin, y);
  const rowW = cols.reduce((s, c) => s + c.w, 0);
  pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
  rates.items.forEach((item, idx) => {
    ensureSpace(6);
    if (idx % 2 === 1) { pdf.setFillColor(248, 250, 252); pdf.rect(margin, y, rowW, 5.5, 'F'); }
    const r = result.perItem[item.key];
    const row = [
      phaseLabel(item.phase), item.label.slice(0, 44),
      fmtCredits(inputs.volumes[item.key] ?? 0), periodLabel(r?.effectivePeriod ?? 'year'),
      fmtCredits(r?.dailyCredits ?? 0), fmtCredits(r?.monthlyCredits ?? 0), fmtCredits(r?.annualCredits ?? 0),
      fmtUSDOrDash(r?.annualCostUSD ?? null)
    ];
    let x = margin;
    for (let i = 0; i < cols.length; i++) { pdf.text(row[i], x + 1.5, y + 4); x += cols[i].w; }
    y += 5.5;
  });

  pdf.save(filename);
}
