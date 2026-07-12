import { NextRequest, NextResponse } from 'next/server';
import catalog from '@/config/dataReadinessCatalog.json';
import {
  Catalog, CheckKey, CheckRequest, CheckResult, FieldType, SystemKey,
  buildSampleQuery, seededRandom
} from '@/lib/dataReadiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAT = catalog as unknown as Catalog;

function pickSeverity(pct: number): 'good' | 'warning' | 'critical' {
  if (pct < 5) return 'good';
  if (pct < 15) return 'warning';
  return 'critical';
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

/**
 * Deterministic synthetic result generator.
 * The same (system, checkType, object, field) always returns the same numbers.
 */
function generateResult(req: CheckRequest, fieldType: FieldType, sampleQuery: string): CheckResult {
  const seed = `${req.system}|${req.checkType}|${req.object}|${req.field}`;
  const rnd = seededRandom(seed);

  const totalRecords = Math.floor(1000 + rnd() * 500_000);
  const scannedRecords = totalRecords;
  const executedAt = new Date().toISOString();
  const durationMs = Math.floor(120 + rnd() * 900);

  const base = {
    system: req.system,
    checkType: req.checkType,
    object: req.object,
    field: req.field,
    fieldType,
    totalRecords,
    scannedRecords,
    executedAt,
    durationMs,
    sampleQuery
  };

  switch (req.checkType) {
    case 'duplicate': {
      const duplicatePercent = +(rnd() * 8).toFixed(2); // 0-8%
      const duplicateRecords = Math.floor(totalRecords * duplicatePercent / 100);
      const duplicateGroups = Math.max(1, Math.floor(duplicateRecords / (2 + rnd() * 3)));
      const uniqueValues = totalRecords - duplicateRecords + duplicateGroups;
      const examples = Array.from({ length: 6 }, (_, i) => ({
        value: sampleDuplicateValue(req.object, req.field, fieldType, i, rnd),
        count: 2 + Math.floor(rnd() * 8)
      }));
      return {
        ...base,
        checkType: 'duplicate',
        duplicateRecords,
        duplicateGroups,
        uniqueValues,
        duplicatePercent,
        examples,
        severity: pickSeverity(duplicatePercent),
        headlineMetric: {
          label: 'Duplicate rate',
          value: fmtPct(duplicatePercent),
          hint: `${fmtNum(duplicateRecords)} of ${fmtNum(totalRecords)} rows share duplicated ${req.field} values`
        }
      };
    }
    case 'null_empty': {
      const nullPercent = +(rnd() * 35).toFixed(2); // 0-35%
      const nullCount = Math.floor(totalRecords * nullPercent / 100);
      const emptyCount = Math.floor(nullCount * 0.35);
      const populatedCount = totalRecords - nullCount;
      return {
        ...base,
        checkType: 'null_empty',
        nullCount, emptyCount, populatedCount, nullPercent,
        severity: pickSeverity(nullPercent),
        headlineMetric: {
          label: 'NULL / empty rate',
          value: fmtPct(nullPercent),
          hint: `${fmtNum(nullCount)} rows have no value for ${req.field}`
        }
      };
    }
    case 'completeness': {
      const missing = Math.floor(totalRecords * (rnd() * 0.25));
      const defaulted = Math.floor((totalRecords - missing) * (rnd() * 0.10));
      const populated = totalRecords - missing - defaulted;
      const score = Math.max(0, Math.min(100, Math.round(100 * (populated / totalRecords))));
      const components = [
        { label: 'Populated', score: Math.round(100 * populated / totalRecords) },
        { label: 'Non-default', score: Math.round(100 * (populated - defaulted / 2) / totalRecords) },
        { label: 'Reasonable length', score: Math.max(60, Math.round(70 + rnd() * 30)) }
      ];
      const severity = score >= 90 ? 'good' : score >= 75 ? 'warning' : 'critical';
      return {
        ...base,
        checkType: 'completeness',
        score, populated, missing, defaulted, components,
        severity,
        headlineMetric: {
          label: 'Completeness score',
          value: `${score}/100`,
          hint: `${fmtNum(populated)} populated \u00b7 ${fmtNum(missing)} missing \u00b7 ${fmtNum(defaulted)} default`
        }
      };
    }
    case 'value_distribution': {
      const cardinality = 1 + Math.floor(rnd() * Math.min(2500, totalRecords / 4));
      const topN = Math.min(10, cardinality);
      const values: { value: string; count: number; percent: number }[] = [];
      let remaining = totalRecords;
      for (let i = 0; i < topN; i++) {
        const share = Math.max(0.02, (0.4 - i * 0.03) * rnd() + 0.02);
        const count = Math.max(1, Math.floor(remaining * share));
        remaining -= count;
        values.push({
          value: sampleTopValue(req.object, req.field, fieldType, i, rnd),
          count,
          percent: +(100 * count / totalRecords).toFixed(2)
        });
      }
      const topPct = values[0]?.percent ?? 0;
      const severity: 'good' | 'warning' | 'critical' =
        topPct > 70 ? 'critical' : topPct > 40 ? 'warning' : 'good';
      return {
        ...base,
        checkType: 'value_distribution',
        cardinality, topValues: values,
        severity,
        headlineMetric: {
          label: 'Distinct values',
          value: fmtNum(cardinality),
          hint: `Top value covers ${fmtPct(topPct)} of rows`
        }
      };
    }
    case 'format_validation': {
      const kind: 'email' | 'phone' | 'url' =
        fieldType === 'email' ? 'email' :
        fieldType === 'phone' ? 'phone' : 'url';
      const invalidPercent = +(rnd() * 12).toFixed(2);
      const invalidCount = Math.floor(totalRecords * invalidPercent / 100);
      const validCount = totalRecords - invalidCount;
      const invalidExamples = Array.from({ length: 6 }, (_, i) => sampleInvalidFormat(kind, i, rnd));
      return {
        ...base,
        checkType: 'format_validation',
        formatKind: kind,
        validCount, invalidCount, invalidPercent, invalidExamples,
        severity: pickSeverity(invalidPercent),
        headlineMetric: {
          label: `Invalid ${kind}s`,
          value: fmtPct(invalidPercent),
          hint: `${fmtNum(invalidCount)} of ${fmtNum(totalRecords)} values fail format check`
        }
      };
    }
    case 'referential_integrity': {
      const orphanPercent = +(rnd() * 6).toFixed(2);
      const orphanCount = Math.floor(totalRecords * orphanPercent / 100);
      const orphanExamples = Array.from({ length: 6 }, () =>
        // 15-char Salesforce-style ID
        Array.from({ length: 15 }, () => Math.floor(rnd() * 36).toString(36)).join('').toUpperCase()
      );
      return {
        ...base,
        checkType: 'referential_integrity',
        totalReferences: totalRecords,
        orphanCount, orphanPercent, orphanExamples,
        severity: pickSeverity(orphanPercent),
        headlineMetric: {
          label: 'Orphan references',
          value: fmtPct(orphanPercent),
          hint: `${fmtNum(orphanCount)} references point to missing parents`
        }
      };
    }
  }
}

function sampleDuplicateValue(object: string, field: string, type: FieldType, i: number, rnd: () => number): string {
  if (type === 'email') return ['john@acme.com', 'admin@example.com', 'noreply@salesforce.com', 'sales@zendesk.com', 'test@test.com', 'contact@company.io'][i];
  if (type === 'phone') return ['+1-555-0100', '+1-555-0199', '000-000-0000', '+44-20-7946-0958', '+1-800-555-0100', '555-1234'][i];
  if (type === 'picklist') return ['Open', 'Closed', 'New', 'Pending', 'High', 'Low'][i];
  if (type === 'reference') return ['001XX000003DHPh', '003XX000004TrLA', '005XX0000012Aab', '0051p00000Xxyyz', '001800000ABCDE', '0018000000ZzZz'][i];
  return [`Acme Corp`, `Global Industries`, `Salesforce, Inc.`, `Zendesk`, `Test Company`, `Example Ltd.`][i];
}

function sampleTopValue(object: string, field: string, type: FieldType, i: number, rnd: () => number): string {
  if (type === 'picklist') return ['Open', 'Closed', 'In Progress', 'New', 'Pending Review', 'Resolved', 'Cancelled', 'On Hold', 'Escalated', 'Reopened'][i];
  if (type === 'boolean') return i === 0 ? 'true' : 'false';
  if (type === 'string' || type === 'email') return [`United States`, `United Kingdom`, `Germany`, `India`, `Canada`, `France`, `Australia`, `Japan`, `Brazil`, `Netherlands`][i];
  if (type === 'reference') return ['005XX000001Owner', '005XX000002Owner', '005XX000003Owner', '005XX000004Owner', '005XX000005Owner', '005XX000006Owner', '005XX000007Owner', '005XX000008Owner', '005XX000009Owner', '005XX00000AOwner'][i];
  return `Value ${i + 1}`;
}

function sampleInvalidFormat(kind: 'email' | 'phone' | 'url', i: number, rnd: () => number): string {
  if (kind === 'email') return ['no-at-sign.com', 'user@', '@example.com', 'user@.com', 'user @example.com', 'plainname'][i];
  if (kind === 'phone') return ['abc-def-ghij', '123', '555.abcd', '+1', 'phone', '(555) '][i];
  return ['not a url', 'http:/', 'example', 'www.', '://example.com', 'http//example.com'][i];
}

export async function POST(req: NextRequest) {
  try {
    const body: CheckRequest = await req.json();
    const { system, checkType, object, field } = body;
    if (!system || !checkType || !object || !field) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const sys = CAT.systems[system as SystemKey];
    if (!sys) return NextResponse.json({ error: `Unknown system: ${system}` }, { status: 400 });
    const obj = sys.objects[object];
    if (!obj) return NextResponse.json({ error: `Unknown object: ${object}` }, { status: 400 });
    const fld = obj.fields[field];
    if (!fld) return NextResponse.json({ error: `Unknown field: ${field}` }, { status: 400 });
    const check = CAT.checks[checkType as CheckKey];
    if (!check) return NextResponse.json({ error: `Unknown check: ${checkType}` }, { status: 400 });
    if (!check.appliesToTypes.includes(fld.type as any)) {
      return NextResponse.json(
        { error: `Check "${check.name}" does not apply to fields of type "${fld.type}"` },
        { status: 400 }
      );
    }

    const sampleQuery = buildSampleQuery(system as SystemKey, checkType as CheckKey, object, field);

    // Small simulated latency so the UI feels realistic.
    await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 700)));

    const result = generateResult({ system: system as SystemKey, checkType: checkType as CheckKey, object, field }, fld.type as any, sampleQuery);
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Check failed' }, { status: 500 });
  }
}
