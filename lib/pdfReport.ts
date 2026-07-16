'use client';

import type { CalculationResult, CalculatorInputs, Period, RatesConfig } from './types';
import { fmtCredits, fmtUSD } from './formatters';
import type { Pipeline } from './pipeline';
import { PIPELINE_DRIVEN_ITEM_KEYS, pipelineBreakdown, pipelineDisplayName } from './pipeline';
import {
  findConnection, FREQUENCY_SHORT_LABELS, getPhaseRefreshConfig, MODE_SHORT_LABELS, runsPerYearFor,
  type RefreshMode, type RunFrequency
} from './refreshModes';

export interface AdvancedPdfMeta {
  itemRefreshModes: Record<string, RefreshMode>;
  itemFrequencies: Record<string, RunFrequency>;
  itemManualRuns: Record<string, number>;
}

interface Options {
  rates: RatesConfig; inputs: CalculatorInputs; result: CalculationResult;
  chartsEl?: HTMLElement | null; filename?: string; pipelines?: Pipeline[]; advanced?: AdvancedPdfMeta;
}

// Short forms for the full names shown on-screen (PhaseTheme.tsx) - the table column is too
// narrow for "Connect, Harmonize, and Unify" etc. without ugly mid-word truncation.
const PHASE_LABELS: Record<string, string> = {
  ingestion: 'Ingestion',
  realtime: 'Real-Time',
  insights: 'Insights',
  act: 'Act',
  activation: 'Activation',
  compute: 'Compute'
};

function phaseLabel(key: string): string { return PHASE_LABELS[key] ?? key; }
function periodLabel(p: Period): string { return p.charAt(0).toUpperCase() + p.slice(1); }

// jsPDF's default (WinAnsi-encoded) Helvetica can't render "→" or other non-Latin1 glyphs -
// it silently garbles the whole string's spacing instead of erroring, so scrub known
// offenders from any free-form text (like auto-generated pipeline names) before drawing it.
function pdfSafeText(s: string): string {
  return s.replace(/→/g, '->').replace(/—/g, '-').replace(/×/g, 'x').replace(/·/g, '.');
}

// Small unit prices like $0.005/credit round to "$0.01" under fmtUSD's 2-decimal display -
// misleading in a documentation report, so use more precision for this one line.
function fmtUnitPrice(n: number): string {
  if (!isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(n);
}

function modeFrequencyCols(itemKey: string, phase: string, isPipelineDriven: boolean, advanced?: AdvancedPdfMeta): [string, string] {
  if (isPipelineDriven) return ['See Pipelines', ''];
  if (!advanced) return ['', ''];
  const cfg = getPhaseRefreshConfig(phase);
  if (!cfg.hasRefreshControls) return ['', ''];
  const mode = advanced.itemRefreshModes[itemKey];
  if (!mode) return ['', ''];
  if (mode === 'streaming') return [MODE_SHORT_LABELS[mode], 'Continuous'];
  const freq = advanced.itemFrequencies[itemKey];
  const freqLabel = freq === 'manual' ? `${advanced.itemManualRuns[itemKey] ?? 12}/yr` : FREQUENCY_SHORT_LABELS[freq] ?? '';
  return [MODE_SHORT_LABELS[mode], freqLabel];
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

export async function generatePDFReport({ rates, inputs, result, chartsEl, filename = 'sf-datacloud-credit-estimate.pdf', pipelines, advanced }: Options): Promise<void> {
  const jsPDFmod: any = await import('jspdf');
  const JsPDFCtor = jsPDFmod.jsPDF ?? jsPDFmod.default;
  const pdf = new JsPDFCtor({ orientation: 'l', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;
  const now = new Date();
  const title = advanced
    ? 'Salesforce Data Cloud — Credit Consumption & Pipeline Estimate (Advanced)'
    : 'Salesforce Data Cloud - Credit Consumption Estimate';

  function ensureSpace(need: number) {
    if (y + need > pageHeight - margin) { pdf.addPage(); y = margin; }
  }

  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageWidth, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(title, margin, 14);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Generated: ${now.toLocaleString()}`, pageWidth - margin, 14, { align: 'right' });

  y = 30;
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10);
  pdf.text(`Environment: ${inputs.environment}`, margin, y);
  pdf.text(`Cost / Credit: ${fmtUnitPrice(inputs.costPerCreditUSD)}`, margin + 60, y);
  pdf.text(`Overhead: ${inputs.overheadPct}%`, margin + 120, y);
  pdf.text(`Rate Source: ${rates.meta.source}`, margin + 170, y);
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
      ensureSpace(imgH);
      pdf.addImage(imgData, 'PNG', margin, y, imgW, imgH);
      y += imgH + 6;
    } catch {}
  }

  if (advanced) {
    ensureSpace(24);
    pdf.setFillColor(238, 242, 255);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 20, 2, 2, 'F');
    pdf.setTextColor(67, 56, 202);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
    pdf.text('METHODOLOGY', margin + 3, y + 5.5);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdf.setTextColor(51, 65, 85);
    const methodology = [
      'Annual credits per item = (Volume per Run / Unit Divisor) x Rate x Runs/Year (from the selected Run Frequency), x an optional Overhead multiplier.',
      'Full Refresh assumes the entire dataset is reprocessed every run. Incremental Refresh assumes only changed/added records are processed per run.',
      'Streaming assumes continuous processing (365 day-equivalents/year). Data Ingestion Pipeline volumes below roll into the External Data Pipeline items above.'
    ];
    methodology.forEach((line, i) => pdf.text(line, margin + 3, y + 10.5 + i * 4));
    y += 24;
  }

  ensureSpace(12);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42);
  pdf.text('Per-Item Detail', margin, y);
  y += 6;
  const cols = advanced
    ? [
        { label: 'Phase', w: 22 }, { label: 'Item', w: 58 }, { label: 'Rate', w: 12 },
        { label: 'Volume', w: 18 }, { label: 'Mode', w: 22 }, { label: 'Frequency', w: 20 },
        { label: 'Cr/Day', w: 16 }, { label: 'Cr/Month', w: 18 }, { label: 'Cr/Year', w: 18 },
        { label: 'Total Cr', w: 18 }, { label: '$/Year', w: 15 }, { label: 'Total $', w: 17 }
      ]
    : [
        { label: 'Phase', w: 40 }, { label: 'Item', w: 58 }, { label: 'Rate', w: 14 },
        { label: 'Volume', w: 20 }, { label: 'Unit', w: 16 },
        { label: 'Cr/Day', w: 20 }, { label: 'Cr/Month', w: 20 }, { label: 'Cr/Year', w: 20 },
        { label: 'Total Cr', w: 20 }, { label: '$/Year', w: 18 }, { label: 'Total $', w: 20 }
      ];
  y = drawTableHeader(pdf, cols, margin, y);
  const rowW = cols.reduce((s, c) => s + c.w, 0);
  pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
  rates.items.forEach((item, idx) => {
    ensureSpace(6);
    if (idx % 2 === 1) { pdf.setFillColor(248, 250, 252); pdf.rect(margin, y, rowW, 5.5, 'F'); }
    const r = result.perItem[item.key];
    const rate = item.credits[inputs.environment] ?? 0;
    const isPipelineDriven = item.key === PIPELINE_DRIVEN_ITEM_KEYS.batch || item.key === PIPELINE_DRIVEN_ITEM_KEYS.streaming;
    const row = advanced
      ? (() => {
          const [modeCol, freqCol] = modeFrequencyCols(item.key, item.phase, isPipelineDriven, advanced);
          return [
            phaseLabel(item.phase), item.label.slice(0, 40), `${rate}`,
            fmtCredits(inputs.itemVolumes[item.key] ?? 0), modeCol, freqCol,
            fmtCredits(r?.dailyCredits ?? 0), fmtCredits(r?.monthlyCredits ?? 0), fmtCredits(r?.annualCredits ?? 0),
            fmtCredits((r?.annualCredits ?? 0) + (r?.initialCredits ?? 0)),
            fmtUSD(r?.annualCostUSD ?? 0), fmtUSD((r?.annualCostUSD ?? 0) + (r?.initialCostUSD ?? 0))
          ];
        })()
      : [
          phaseLabel(item.phase), item.label.slice(0, 40), `${rate}`,
          fmtCredits(inputs.itemVolumes[item.key] ?? 0), periodLabel(r?.effectivePeriod ?? 'year'),
          fmtCredits(r?.dailyCredits ?? 0), fmtCredits(r?.monthlyCredits ?? 0), fmtCredits(r?.annualCredits ?? 0),
          fmtCredits((r?.annualCredits ?? 0) + (r?.initialCredits ?? 0)),
          fmtUSD(r?.annualCostUSD ?? 0), fmtUSD((r?.annualCostUSD ?? 0) + (r?.initialCostUSD ?? 0))
        ];
    let x = margin;
    for (let i = 0; i < cols.length; i++) { pdf.text(row[i], x + 1.5, y + 4); x += cols[i].w; }
    y += 5.5;
  });

  if (pipelines && pipelines.length > 0) {
    const batchPipelines = pipelines.filter((p) => p.runMode !== 'streaming');
    const streamingPipelines = pipelines.filter((p) => p.runMode === 'streaming');
    pdf.addPage();
    y = margin;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(15, 23, 42);
    pdf.text('Data Ingestion Pipelines', margin, y);
    y += 8;

    if (batchPipelines.length > 0) y = drawPipelineTable(pdf, { title: 'Batch Pipelines', pipelines: batchPipelines, rates, environment: inputs.environment, overheadPct: inputs.overheadPct, margin, y, pageWidth, pageHeight, ensureSpace, kind: 'batch' });
    if (streamingPipelines.length > 0) {
      ensureSpace(20);
      y += 4;
      y = drawPipelineTable(pdf, { title: 'Streaming Pipelines', pipelines: streamingPipelines, rates, environment: inputs.environment, overheadPct: inputs.overheadPct, margin, y, pageWidth, pageHeight, ensureSpace, kind: 'streaming' });
    }
  }

  pdf.save(filename);
}

function drawPipelineTable(pdf: any, opts: {
  title: string; pipelines: Pipeline[]; rates: RatesConfig; environment: CalculatorInputs['environment']; overheadPct: number;
  margin: number; y: number; pageWidth: number; pageHeight: number; ensureSpace: (n: number) => void; kind: 'batch' | 'streaming';
}): number {
  const { title, pipelines, rates, environment, overheadPct, margin, ensureSpace, kind } = opts;
  let y = opts.y;
  ensureSpace(14);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(15, 23, 42);
  pdf.text(title, margin, y);
  y += 5;

  const cols = kind === 'batch'
    ? [
        { label: 'Connection', w: 34 }, { label: 'Pipeline', w: 52 }, { label: 'Object', w: 22 },
        { label: 'Volume/Run', w: 22 }, { label: 'Run Mode', w: 22 }, { label: 'Frequency', w: 20 },
        { label: 'Annual Credits', w: 26 }, { label: 'Annual Cost', w: 24 }
      ]
    : [
        { label: 'Connection', w: 44 }, { label: 'Pipeline', w: 62 }, { label: 'Object', w: 26 },
        { label: 'Volume/Day', w: 24 }, { label: 'Annual Credits', w: 28 }, { label: 'Annual Cost', w: 26 }
      ];
  y = drawTableHeader(pdf, cols, margin, y);
  const rowW = cols.reduce((s, c) => s + c.w, 0);
  pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);

  let totalCredits = 0, totalCost = 0;
  pipelines.forEach((p, idx) => {
    ensureSpace(6);
    if (idx % 2 === 1) { pdf.setFillColor(248, 250, 252); pdf.rect(margin, y, rowW, 5.5, 'F'); }
    const conn = findConnection(p.connectionKey);
    const connLabel = conn?.isOther ? (p.customConnectionName || 'Other') : (conn?.label ?? p.connectionKey);
    const displayName = pdfSafeText(pipelineDisplayName(p, connLabel));
    const bd = pipelineBreakdown(p, rates, environment, overheadPct);
    totalCredits += bd.annualCredits; totalCost += bd.annualCostUSD;
    const row = kind === 'batch'
      ? [
          connLabel.slice(0, 22), displayName.slice(0, 36), (p.object || '-').slice(0, 14),
          fmtCredits(p.volumePerRun), MODE_SHORT_LABELS[p.runMode],
          p.frequency === 'manual' ? `${runsPerYearFor(p.frequency, p.manualRunsPerYear)}/yr` : FREQUENCY_SHORT_LABELS[p.frequency],
          fmtCredits(bd.annualCredits), fmtUSD(bd.annualCostUSD)
        ]
      : [
          connLabel.slice(0, 30), displayName.slice(0, 46), (p.object || '-').slice(0, 16),
          fmtCredits(p.volumePerRun), fmtCredits(bd.annualCredits), fmtUSD(bd.annualCostUSD)
        ];
    let x = margin;
    for (let i = 0; i < cols.length; i++) { pdf.text(row[i], x + 1.5, y + 4); x += cols[i].w; }
    y += 5.5;
  });

  ensureSpace(6);
  pdf.setFillColor(226, 232, 240);
  pdf.rect(margin, y, rowW, 6, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
  pdf.text(`Subtotal (${pipelines.length} pipeline${pipelines.length === 1 ? '' : 's'})`, margin + 1.5, y + 4.2);
  pdf.text(fmtCredits(totalCredits) + ' cr', margin + rowW - (kind === 'batch' ? 50 : 54), y + 4.2);
  pdf.text(fmtUSD(totalCost), margin + rowW - 24, y + 4.2);
  y += 6 + 4;
  return y;
}
