'use client';

import type { CalculationResult, CalculatorInputs, Period, RatesConfig } from './types';
import { fmtCredits, fmtUSD } from './formatters';

interface Options {
  rates: RatesConfig;
  inputs: CalculatorInputs;
  result: CalculationResult;
  chartsEl?: HTMLElement | null;
  filename?: string;
}

const PHASE_LABELS: Record<string, string> = {
  ingestion: 'Connect, Harmonize & Unify',
  harmonization: 'Identity Resolution',
  realtime: 'End-to-End Real-Time Processing',
  insights: 'Analyze & Predict',
  act: 'Act',
  activation: 'Segmentation & Activation',
  compute: 'Compute'
};

function phaseLabel(key: string): string { return PHASE_LABELS[key] ?? key; }
function periodLabel(p: Period): string { return p.charAt(0).toUpperCase() + p.slice(1); }

export async function generatePDFReport({
  rates, inputs, result, chartsEl,
  filename = 'sf-datacloud-credit-estimate.pdf'
}: Options): Promise<void> {
  const jsPDFmod: any = await import('jspdf');
  const JsPDFCtor = jsPDFmod.jsPDF ?? jsPDFmod.default;

  const pdf = new JsPDFCtor({ orientation: 'l', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;
  const now = new Date();

  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageWidth, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('Salesforce Data Cloud - Credit Consumption Estimate', margin, 14);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Generated: ${now.toLocaleString()}`, pageWidth - margin, 14, { align: 'right' });

  y = 30;
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10);
  pdf.text(`Environment: ${inputs.environment}`, margin, y);
  pdf.text(`Cost / Credit: ${fmtUSD(inputs.costPerCreditUSD)}`, margin + 60, y);
  pdf.text(`Overhead: ${inputs.overheadPct}%`, margin + 120, y);
  y += 6;
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(8);
  pdf.text(`Rate source: ${rates.meta.source}`, margin, y);
  y += 4;
  const urlLines = pdf.splitTextToSize(`URL: ${rates.meta.url}`, pageWidth - margin * 2);
  pdf.text(urlLines, margin, y);
  y += urlLines.length * 4 + 4;

  const t = result.totals;
  const kpis = [
    { label: 'Total Daily',   credits: t.dailyCredits,   cost: t.dailyCostUSD, dark: false },
    { label: 'Total Weekly',  credits: t.weeklyCredits,  cost: t.weeklyCostUSD, dark: false },
    { label: 'Total Monthly', credits: t.monthlyCredits, cost: t.monthlyCostUSD, dark: false },
    { label: 'Total Annual',  credits: t.annualCredits,  cost: t.annualCostUSD, dark: false },
    { label: 'Initial (Day 0)', credits: t.initialCredits, cost: t.initialCostUSD, dark: false },
    { label: 'First-Year Grand Total', credits: t.firstYearGrandTotalCredits, cost: t.firstYearGrandTotalUSD, dark: true }
  ];
  const kpiW = (pageWidth - margin * 2 - 5 * 4) / 6;
  const kpiH = 22;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 4);
    if (k.dark) { pdf.setFillColor(15, 23, 42); pdf.setTextColor(255, 255, 255); }
    else { pdf.setFillColor(241, 245, 249); pdf.setTextColor(15, 23, 42); }
    pdf.roundedRect(x, y, kpiW, kpiH, 2, 2, 'F');
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text(k.label.toUpperCase(), x + 3, y + 5);
    pdf.setFontSize(11);
    pdf.text(fmtCredits(k.credits) + ' credits', x + 3, y + 12);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(fmtUSD(k.cost), x + 3, y + 18);
  });
  y += kpiH + 8;
  pdf.setTextColor(15, 23, 42);

  if (chartsEl) {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartsEl, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: chartsEl.scrollWidth
      });
      const imgData = canvas.toDataURL('image/png');
      const imgW = pageWidth - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (y + imgH > pageHeight - margin) { pdf.addPage(); y = margin; }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('Summary Charts', margin, y);
      y += 4;
      pdf.addImage(imgData, 'PNG', margin, y, imgW, imgH);
      y += imgH + 6;
    } catch {}
  }

  ensureSpace(pdf, y, 40, margin, () => (y = margin));
  y = drawSectionTitle(pdf, 'Phase Totals', margin, y);
  const phaseCols = [
    { key: 'phase', label: 'Phase', width: 70 },
    { key: 'annualCredits', label: 'Annual Credits', width: 40, align: 'right' as const },
    { key: 'annualCost', label: 'Annual $', width: 40, align: 'right' as const },
    { key: 'initialCredits', label: 'Initial Credits', width: 40, align: 'right' as const },
    { key: 'initialCost', label: 'Initial $', width: 40, align: 'right' as const }
  ];
  const phaseRows = result.perPhase.map((p) => ({
    phase: phaseLabel(p.phase),
    annualCredits: fmtCredits(p.annualCredits),
    annualCost: fmtUSD(p.annualCostUSD),
    initialCredits: fmtCredits(p.initialCredits),
    initialCost: fmtUSD(p.initialCostUSD)
  }));
  y = drawTable(pdf, phaseCols, phaseRows, margin, y, pageWidth, pageHeight);
  y += 6;

  ensureSpace(pdf, y, 30, margin, () => (y = margin));
  y = drawSectionTitle(pdf, 'Per-Item Detail', margin, y);
  const itemCols = [
    { key: 'phase', label: 'Phase', width: 34 },
    { key: 'label', label: 'Item', width: 46 },
    { key: 'rate', label: 'Rate', width: 18, align: 'right' as const },
    { key: 'volume', label: 'Volume', width: 22, align: 'right' as const },
    { key: 'period', label: 'Unit', width: 14 },
    { key: 'initial', label: 'Initial', width: 20, align: 'right' as const },
    { key: 'dailyCredits', label: 'Credits / Day', width: 22, align: 'right' as const },
    { key: 'monthlyCredits', label: 'Credits / Month', width: 24, align: 'right' as const },
    { key: 'annualCredits', label: 'Credits / Year', width: 24, align: 'right' as const },
    { key: 'totalCredits', label: 'Total Credits', width: 24, align: 'right' as const },
    { key: 'dailyCost', label: '$ / Day', width: 18, align: 'right' as const },
    { key: 'monthlyCost', label: '$ / Month', width: 20, align: 'right' as const },
    { key: 'annualCost', label: '$ / Year', width: 20, align: 'right' as const },
    { key: 'totalCost', label: 'Total $', width: 22, align: 'right' as const }
  ];
  const itemRows = rates.items.map((item) => {
    const r = result.perItem[item.key];
    const rate = item.credits[inputs.environment] ?? 0;
    return {
      phase: phaseLabel(item.phase), label: item.label, rate: `${rate}`,
      volume: fmtCredits(inputs.itemVolumes[item.key] ?? 0),
      period: periodLabel(r?.effectivePeriod ?? 'year'),
      initial: item.supportsInitial ? fmtCredits(inputs.itemInitials[item.key] ?? 0) : '-',
      dailyCredits: fmtCredits(r?.dailyCredits ?? 0),
      monthlyCredits: fmtCredits(r?.monthlyCredits ?? 0),
      annualCredits: fmtCredits(r?.annualCredits ?? 0),
      totalCredits: fmtCredits((r?.annualCredits ?? 0) + (r?.initialCredits ?? 0)),
      dailyCost: fmtUSD(r?.dailyCostUSD ?? 0),
      monthlyCost: fmtUSD(r?.monthlyCostUSD ?? 0),
      annualCost: fmtUSD(r?.annualCostUSD ?? 0),
      totalCost: fmtUSD((r?.annualCostUSD ?? 0) + (r?.initialCostUSD ?? 0))
    };
  });
  y = drawTable(pdf, itemCols, itemRows, margin, y, pageWidth, pageHeight);

  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text(
      `Salesforce Data Cloud Suite - v${rates.meta.version} - Page ${p} of ${pageCount}`,
      pageWidth / 2, pageHeight - 5, { align: 'center' }
    );
  }
  pdf.save(filename);
}

function ensureSpace(pdf: any, y: number, needed: number, margin: number, resetY: () => void) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (y + needed > pageHeight - margin) { pdf.addPage(); resetY(); }
}

function drawSectionTitle(pdf: any, title: string, x: number, y: number): number {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text(title, x, y);
  pdf.setDrawColor(226, 232, 240);
  pdf.line(x, y + 1.5, x + 60, y + 1.5);
  return y + 6;
}

interface ColDef { key: string; label: string; width: number; align?: 'left' | 'right'; }
type Row = Record<string, string>;

function drawTable(pdf: any, cols: ColDef[], rows: Row[], margin: number, startY: number, pageWidth: number, pageHeight: number): number {
  const rowH = 6;
  const headerH = 7;
  let y = startY;
  const drawHeader = () => {
    let x = margin;
    pdf.setFillColor(30, 41, 59);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.rect(margin, y, cols.reduce((s, c) => s + c.width, 0), headerH, 'F');
    for (const c of cols) {
      const tx = c.align === 'right' ? x + c.width - 1.5 : x + 1.5;
      pdf.text(c.label, tx, y + 5, { align: c.align === 'right' ? 'right' : 'left' });
      x += c.width;
    }
    y += headerH;
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
  };
  drawHeader();
  rows.forEach((row, idx) => {
    if (y + rowH > pageHeight - margin - 5) { pdf.addPage(); y = margin; drawHeader(); }
    if (idx % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, cols.reduce((s, c) => s + c.width, 0), rowH, 'F');
    }
    let x = margin;
    for (const c of cols) {
      const raw = row[c.key] ?? '';
      const val = truncateToWidth(pdf, raw, c.width - 3);
      const tx = c.align === 'right' ? x + c.width - 1.5 : x + 1.5;
      pdf.text(val, tx, y + 4, { align: c.align === 'right' ? 'right' : 'left' });
      x += c.width;
    }
    y += rowH;
  });
  return y + 2;
}

function truncateToWidth(pdf: any, s: string, maxW: number): string {
  if (pdf.getTextWidth(s) <= maxW) return s;
  let out = s;
  while (out.length > 1 && pdf.getTextWidth(out + '...') > maxW) out = out.slice(0, -1);
  return out + '...';
}
