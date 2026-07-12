'use client';

import type { RateItem } from './types';

export async function extractPdfText(source: File | ArrayBuffer): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf');
  try {
    // @ts-ignore
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  } catch {}
  let data: ArrayBuffer;
  if (source instanceof ArrayBuffer) data = source;
  else data = await source.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageTexts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as any[]).map((it) => ({ str: it.str, x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0 }));
    const lines: Record<string, { x: number; str: string }[]> = {};
    for (const it of items) {
      const key = Math.round(it.y).toString();
      if (!lines[key]) lines[key] = [];
      lines[key].push({ x: it.x, str: it.str });
    }
    const yKeys = Object.keys(lines).map(Number).sort((a, b) => b - a);
    const pageLines: string[] = [];
    for (const yy of yKeys) {
      const line = lines[yy.toString()].sort((a, b) => a.x - b.x).map((s) => s.str).join(' ').replace(/\s+/g, ' ').trim();
      if (line) pageLines.push(line);
    }
    pageTexts.push(pageLines.join('\n'));
  }
  return pageTexts.join('\n\n');
}

export interface ParsedItem { label: string; production: number; sandbox: number; unitHint?: string; raw: string; }

const NUMBER_RE = /-?\d[\d,]*(?:\.\d+)?/g;
const SKIP_CONTAINS_RE = /(https?:\/\/|www\.|help\.salesforce|salesforce\.com|articleView|\?id=)/i;

export function parseRateItems(text: string): ParsedItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (SKIP_CONTAINS_RE.test(line)) continue;
    const nums = line.match(NUMBER_RE) ?? [];
    if (nums.length < 2) continue;
    const production = Number(nums[nums.length - 2].replace(/,/g, ''));
    const sandbox = Number(nums[nums.length - 1].replace(/,/g, ''));
    if (!isFinite(production) || !isFinite(sandbox)) continue;
    if (production <= 0 && sandbox <= 0) continue;
    if (production > 10_000_000 || sandbox > 10_000_000) continue;
    const firstNumIdx = line.indexOf(nums[nums.length - 2]);
    if (firstNumIdx <= 0) continue;
    const label = line.slice(0, firstNumIdx).replace(/[\s\-:]+$/g, '').trim();
    if (!label || label.length < 6) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let unitHint: string | undefined;
    if (/\(mb\)|megabyte/i.test(label)) unitHint = 'Per 1 megabyte processed';
    else if (/\(gb\)|gigabyte/i.test(label)) unitHint = 'Per 1 gigabyte processed';
    else if (/compute\s*unit|code\s*ext/i.test(label)) unitHint = 'Per 1 Compute Unit';
    else if (/row|record|event|inference|action|profile/i.test(label)) unitHint = 'Per 1,000,000 rows processed';
    items.push({ label, production, sandbox, unitHint, raw: line });
  }
  return items;
}

export function parsedToRateItems(parsed: ParsedItem[]): RateItem[] {
  return parsed.map((p, i) => {
    const unit = p.unitHint ?? 'Per 1,000,000 rows processed';
    const isCompute = /compute unit/i.test(unit);
    const isMB = /megabyte/i.test(unit);
    const isGB = /gigabyte/i.test(unit);
    const unitDivisor = isMB || isGB || isCompute ? 1 : 1000000;
    const unitLabel = isMB ? 'megabytes' : isGB ? 'gigabytes' : isCompute ? 'compute units' : 'rows';
    return {
      key: (p.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || `item_${i}`) + '_' + i,
      phase: /(code\s*ext|compute)/.test(p.label.toLowerCase()) ? 'compute' : 'ingestion',
      label: p.label, unit, unitDivisor, unitLabel, unitSingular: unitLabel.replace(/s$/, ''),
      initialLabel: `Initial Load ${unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}`,
      supportsInitial: false,
      credits: { Production: p.production, Sandbox: p.sandbox },
      description: `Parsed from rate sheet: ${p.raw}`,
      processingRateNote: unit, usageNote: 'Auto-extracted from uploaded PDF. Please verify.'
    };
  });
}
