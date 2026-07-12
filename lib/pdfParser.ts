'use client';

import type { RateItem } from './types';

export async function extractPdfText(source: File | ArrayBuffer): Promise<string> {
  // Use the legacy build - browser-safe, doesn't require the 'canvas' node dep.
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf');
  try {
    // @ts-ignore
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  } catch {}

  let data: ArrayBuffer;
  if (source instanceof ArrayBuffer) data = source;
  else data = await source.arrayBuffer();

  const loadingTask = pdfjs.getDocument({ data, disableWorker: false });
  const doc = await loadingTask.promise;
  const pageTexts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as any[]).map((it) => ({
      str: it.str as string,
      x: it.transform?.[4] ?? 0,
      y: it.transform?.[5] ?? 0
    }));
    const lines: Record<string, { x: number; str: string }[]> = {};
    for (const it of items) {
      const key = Math.round(it.y).toString();
      if (!lines[key]) lines[key] = [];
      lines[key].push({ x: it.x, str: it.str });
    }
    const yKeys = Object.keys(lines).map(Number).sort((a, b) => b - a);
    const pageLines: string[] = [];
    for (const yy of yKeys) {
      const line = lines[yy.toString()]
        .sort((a, b) => a.x - b.x)
        .map((s) => s.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) pageLines.push(line);
    }
    pageTexts.push(pageLines.join('\n'));
  }
  return pageTexts.join('\n\n');
}

export interface ParsedItem {
  label: string;
  production: number;
  sandbox: number;
  unitHint?: string;
  raw: string;
}

const NUMBER_RE = /-?\d[\d,]*(?:\.\d+)?/g;

const SKIP_PREFIX_RE = /^(salesforce|data cloud|rate sheet|page|copyright|\u00a9|\d{1,2}\/\d{1,2}\/\d{2,4}|v?\d+\.\d+|table of contents|effective|last updated|last modified|confidential|for internal|https?:|www\.)/i;

const SKIP_CONTAINS_RE = /(https?:\/\/|www\.|help\.salesforce|salesforce\.com|articleView|\?id=|documentation|see the|see also|refer to|footnote|^\*)/i;

function cleanLabel(raw: string): string {
  return raw
    .replace(/^[\s\-\u2013\u2014\u2022\u00b7\d.]+/, '')
    .replace(/[\s\-\u2013\u2014\u2022\u00b7|:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelLooksValid(label: string): boolean {
  if (!label || label.length < 6) return false;
  const words = label.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 1) return false;
  if (/https?:|www\.|\.com|\.pdf|articleView|\?id=/i.test(label)) return false;
  const digits = (label.match(/\d/g) ?? []).length;
  if (digits / label.length > 0.5) return false;
  if (/^[^a-z]{5,}/i.test(label)) return false;
  if (/^(production|sandbox|credits|per|rate|unit|description|type)$/i.test(label)) return false;
  return true;
}

export function parseRateItems(text: string): ParsedItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];
  const seenLabels = new Set<string>();

  for (const line of lines) {
    if (SKIP_PREFIX_RE.test(line)) continue;
    if (SKIP_CONTAINS_RE.test(line)) continue;

    const nums = line.match(NUMBER_RE) ?? [];
    if (nums.length < 2) continue;

    const rawSandbox = nums[nums.length - 1];
    const rawProd = nums[nums.length - 2];
    const production = Number(rawProd.replace(/,/g, ''));
    const sandbox = Number(rawSandbox.replace(/,/g, ''));
    if (!isFinite(production) || !isFinite(sandbox)) continue;
    if (production <= 0 && sandbox <= 0) continue;
    if (production > 10_000_000 || sandbox > 10_000_000) continue;

    const firstNumIdx = line.indexOf(rawProd);
    if (firstNumIdx <= 0) continue;
    const label = cleanLabel(line.slice(0, firstNumIdx));
    if (!labelLooksValid(label)) continue;

    const key = label.toLowerCase();
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);

    let unitHint: string | undefined;
    if (/\(mb\)|megabyte|per\s*mb\b/i.test(label)) unitHint = 'Per 1 megabyte processed';
    else if (/\(gb\)|gigabyte|per\s*gb\b/i.test(label)) unitHint = 'Per 1 gigabyte processed';
    else if (/compute\s*unit|code\s*extension|code\s*ext/i.test(label))
      unitHint = 'Per 1 Compute Unit';
    else if (/row|record|event|inference|action|profile|activation|segment|share|federation/i.test(label))
      unitHint = 'Per 1,000,000 rows processed';

    items.push({ label, production, sandbox, unitHint, raw: line });
  }
  return items;
}

export function parsedToRateItems(parsed: ParsedItem[]): RateItem[] {
  const out: RateItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const key = (p.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || `item_${i}`) + '_' + i;

    const unit = p.unitHint ?? 'Per 1,000,000 rows processed';
    const isCompute = /compute unit/i.test(unit);
    const isMB = /megabyte/i.test(unit);
    const isGB = /gigabyte/i.test(unit);
    const unitDivisor = isMB || isGB || isCompute ? 1 : 1000000;
    const unitLabel = isMB ? 'megabytes'
                    : isGB ? 'gigabytes'
                    : isCompute ? 'compute units'
                    : 'rows';
    const unitSingular = unitLabel.replace(/s$/, '');

    out.push({
      key,
      phase: guessPhase(p.label),
      label: p.label,
      unit, unitDivisor, unitLabel, unitSingular,
      initialLabel: `Initial Load ${unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}`,
      supportsInitial: /ingest|profile|transform|unstruct|federation|private|inference|calculated/i.test(p.label),
      credits: { Production: p.production, Sandbox: p.sandbox },
      description: `Parsed from rate sheet: ${p.raw}`,
      processingRateNote: unit,
      usageNote: 'Auto-extracted from uploaded PDF. Please verify.'
    });
  }
  return out;
}

function guessPhase(label: string): string {
  const s = label.toLowerCase();
  if (/(code\s*ext|compute\s*unit|compute$|\bcompute\b)/.test(s)) return 'compute';
  if (/(ingest|pipeline|federation|share|private connect|transform|unstruct)/.test(s)) return 'ingestion';
  if (/(unif|profile|match|reconc|identity)/.test(s)) return 'harmonization';
  if (/(real.?time|event)/.test(s)) return 'realtime';
  if (/(insight|inference|predict|generative|calculated)/.test(s)) return 'insights';
  if (/(quer|action|api|lookup)/.test(s)) return 'act';
  if (/(segment|activation|audience)/.test(s)) return 'activation';
  return 'ingestion';
}
