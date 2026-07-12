'use client';

import type { CalculationResult, CalculatorInputs, Period, RatesConfig } from './types';
import { fmtCredits, fmtUSD } from './formatters';

interface Options {
  rates: RatesConfig; inputs: CalculatorInputs; result: CalculationResult;
  chartsEl?: HTMLElement | null; filename?: string;
}

const PHASE_LABELS: Record<string, string> = {
  ingestion: 'Connect, Harmonize & Unify', harmonization: 'Identity Resolution',
  realtime: 'End-to-End Real-Time Processing', insights: 'Analyze & Predict',
  act: 'Act', activation: 'Segmentation & Activation', compute: 'Compute'
};

function phaseLabel(key: string): string { return PHASE_LABELS[key] ?? key; }
function periodLabel(p: Period): string { return p.charAt(0).toUpperCase() + p.slice(1); }

export async function generatePDFReport({ rates, inputs, result, chartsEl, filename = 'sf-datacloud-credit-estimate.pdf' }: Options): Promise<void> {
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
  y += 8;

  const t = result.totals;
  const kpis = [
    { label: 'Total Daily', credits: t.dailyCredits, cost: t.dailyCostUSD, dark: false },
    { label: 'Total Monthly', credits: t.monthlyCredits, cost: t.monthlyCostUSD, dark: false },
    { label: 'Total Annual', credits: t.annualCredits, cost: t.annualCostUSD, dark: false },
    { label: 'Initial (Day 0)', credits: t.initialCredits, cost: t.initialCostUSD, dark: false },
    { label: 'First-Year Grand Total', credits: t.firstYearGrandTotalCredits, cost: t.firstYearGrandTotalUSD, dark: true }
  ];
  const kpiW = (pageWidth - margin * 2 - 4 * 4) / 5;
  const kpiH = 22;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 4);
    if (k.dark) { pdf.setFillColor(15, 23, 42); pdf.setTextColor(255, 255, 255); }
    else { pdf.setFillColor(241, 245, 249); pdf.setTextColor(15, 23, 42); }
    pdf.roundedRect(x, y, kpiW, kpiH, 2, 2, 'F');
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    pdf.text(k.label.toUpperCase(), x + 3, y + 5);
    pdf.setFontSize(11);
    pdf.text(fmtCredits(k.credits) + ' credits', x + 3, y + 12);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
    pdf.text(fmtUSD(k.cost), x + 3, y + 18);
  });
  y += kpiH + 8;
  pdf.setTextColor(15, 23, 42);

  if (chartsEl) {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartsEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: chartsEl.scrollWidth });
      const imgData = canvas.toDataURL('image/png');
      const imgW = pageWidth - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (y + imgH > pageHeight - margin) { pdf.addPage(); y = margin; }
      pdf.addImage(imgData, 'PNG', margin, y, imgW, imgH);
      y += imgH + 6;
    } catch {}
  }

  // Per-item table
  if (y + 40 > pageHeight - margin) { pdf.addPage(); y = margin; }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
  pdf.text('Per-Item Detail', margin, y);
  y += 6;
  const cols = [
    { label: 'Phase', w: 34 }, { label: 'Item', w: 46 }, { label: 'Rate', w: 18 },
    { label: 'Volume', w: 22 }, { label: 'Unit', w: 14 },
    { label: 'Cr/Day', w: 22 }, { label: 'Cr/Month', w: 24 }, { label: 'Cr/Year', w: 24 },
    { label: 'Total Cr', w: 24 }, { label: '$/Year', w: 20 }, { label: 'Total $', w: 22 }
  ];
  pdf.setFillColor(30, 41, 59);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7.5);
  const rowW = cols.reduce((s, c) => s + c.w, 0);
  pdf.rect(margin, y, rowW, 6, 'F');
  let x = margin;
  for (const c of cols) { pdf.text(c.label, x + 1.5, y + 4); x += c.w; }
  y += 6;
  pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', 'normal');
  rates.items.forEach((item, idx) => {
    if (y + 6 > pageHeight - margin - 5) { pdf.addPage(); y = margin; }
    if (idx % 2 === 1) { pdf.setFillColor(248, 250, 252); pdf.rect(margin, y, rowW, 5.5, 'F'); }
    const r = result.perItem[item.key];
    const rate = item.credits[inputs.environment] ?? 0;
    const row = [
      phaseLabel(item.phase).slice(0, 18),
      item.label.slice(0, 26),
      `${rate}`,
      fmtCredits(inputs.itemVolumes[item.key] ?? 0),
      periodLabel(r?.effectivePeriod ?? 'year'),
      fmtCredits(r?.dailyCredits ?? 0),
      fmtCredits(r?.monthlyCredits ?? 0),
      fmtCredits(r?.annualCredits ?? 0),
      fmtCredits((r?.annualCredits ?? 0) + (r?.initialCredits ?? 0)),
      fmtUSD(r?.annualCostUSD ?? 0),
      fmtUSD((r?.annualCostUSD ?? 0) + (r?.initialCostUSD ?? 0))
    ];
    x = margin;
    for (let i = 0; i < cols.length; i++) { pdf.text(row[i], x + 1.5, y + 4); x += cols[i].w; }
    y += 5.5;
  });

  pdf.save(filename);
}
