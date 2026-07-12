import { NextRequest, NextResponse } from 'next/server';
import catalog from '@/config/dataReadinessCatalog.json';
import {
  Catalog, CheckKey, CheckRequest, CheckResult, FieldType, SystemKey,
  seededRandom, pickSeverity, fmtNum, fmtPct
} from '@/lib/dataReadiness';
import { getConnectionInfo, runCheck } from '@/lib/salesforceClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAT = catalog as unknown as Catalog;

function buildSampleQuery(system: SystemKey, checkType: CheckKey, object: string, field: string): string {
  if (system === 'salesforce') {
    switch (checkType) {
      case 'duplicate': return `SELECT ${field}, COUNT(Id) FROM ${object} GROUP BY ${field} HAVING COUNT(Id) > 1`;
      case 'null_empty': return `SELECT COUNT() FROM ${object} WHERE ${field} = NULL`;
      case 'completeness': return `SELECT COUNT(Id) total, COUNT(${field}) populated FROM ${object}`;
      case 'value_distribution': return `SELECT ${field}, COUNT(Id) c FROM ${object} GROUP BY ${field} ORDER BY c DESC LIMIT 10`;
      case 'format_validation': return `SELECT ${field} FROM ${object} WHERE ${field} != NULL LIMIT 200`;
      case 'referential_integrity': return `SELECT DISTINCT ${field} FROM ${object} WHERE ${field} != NULL`;
    }
  }
  return `GET /api/v2/${object.toLowerCase()}s.json (scan ${field})`;
}

function generateMockResult(req: CheckRequest, fieldType: FieldType, sampleQuery: string): CheckResult {
  const seed = `${req.system}|${req.checkType}|${req.object}|${req.field}`;
  const rnd = seededRandom(seed);
  const totalRecords = Math.floor(1000 + rnd() * 500_000);
  const executedAt = new Date().toISOString();
  const durationMs = Math.floor(120 + rnd() * 900);
  const base = {
    system: req.system, checkType: req.checkType, object: req.object, field: req.field, fieldType,
    totalRecords, scannedRecords: totalRecords, executedAt, durationMs, sampleQuery,
    liveConnection: false as const
  };
  switch (req.checkType) {
    case 'duplicate': {
      const duplicatePercent = +(rnd() * 8).toFixed(2);
      const duplicateRecords = Math.floor(totalRecords * duplicatePercent / 100);
      const duplicateGroups = Math.max(1, Math.floor(duplicateRecords / (2 + rnd() * 3)));
      return {
        ...base, checkType: 'duplicate',
        duplicateRecords, duplicateGroups,
        uniqueValues: totalRecords - duplicateRecords + duplicateGroups,
        duplicatePercent,
        examples: [
          { value: 'john@acme.com', count: 3 },
          { value: 'test@test.com', count: 2 },
          { value: 'admin@example.com', count: 2 }
        ],
        severity: pickSeverity(duplicatePercent),
        headlineMetric: {
          label: 'Duplicate rate', value: fmtPct(duplicatePercent),
          hint: `${fmtNum(duplicateRecords)} of ${fmtNum(totalRecords)} rows share duplicated ${req.field} values`
        }
      };
    }
    case 'null_empty': {
      const nullPercent = +(rnd() * 35).toFixed(2);
      const nullCount = Math.floor(totalRecords * nullPercent / 100);
      return {
        ...base, checkType: 'null_empty',
        nullCount, emptyCount: Math.floor(nullCount * 0.35),
        populatedCount: totalRecords - nullCount, nullPercent,
        severity: pickSeverity(nullPercent),
        headlineMetric: {
          label: 'NULL / empty rate', value: fmtPct(nullPercent),
          hint: `${fmtNum(nullCount)} rows have no value`
        }
      };
    }
    case 'completeness': {
      const missing = Math.floor(totalRecords * (rnd() * 0.25));
      const populated = totalRecords - missing;
      const score = Math.round(100 * populated / totalRecords);
      return {
        ...base, checkType: 'completeness',
        score, populated, missing, defaulted: 0,
        components: [
          { label: 'Populated', score },
          { label: 'Non-NULL', score: Math.max(60, score - 5) },
          { label: 'Non-empty', score: Math.max(70, score + 3) }
        ],
        severity: score >= 90 ? 'good' : score >= 75 ? 'warning' : 'critical',
        headlineMetric: {
          label: 'Completeness score', value: `${score}/100`,
          hint: `${fmtNum(populated)} populated`
        }
      };
    }
    case 'value_distribution': {
      const cardinality = 1 + Math.floor(rnd() * 500);
      const topValues = Array.from({ length: 8 }, (_, i) => {
        const c = Math.max(1, Math.floor(totalRecords * (0.3 - i * 0.03) * rnd()));
        return { value: `Value ${i + 1}`, count: c, percent: +(100 * c / totalRecords).toFixed(2) };
      });
      const topPct = topValues[0]?.percent ?? 0;
      return {
        ...base, checkType: 'value_distribution',
        cardinality, topValues,
        severity: topPct > 70 ? 'critical' : topPct > 40 ? 'warning' : 'good',
        headlineMetric: {
          label: 'Distinct values', value: fmtNum(cardinality),
          hint: `Top value covers ${fmtPct(topPct)} of rows`
        }
      };
    }
    case 'format_validation': {
      const kind = fieldType === 'email' ? 'email' : fieldType === 'phone' ? 'phone' : 'url';
      const invalidPercent = +(rnd() * 12).toFixed(2);
      const invalidCount = Math.floor(totalRecords * invalidPercent / 100);
      return {
        ...base, checkType: 'format_validation', formatKind: kind as any,
        validCount: totalRecords - invalidCount, invalidCount, invalidPercent,
        invalidExamples: kind === 'email' ? ['no-at-sign.com', 'user@', '@example.com'] :
                          kind === 'phone' ? ['abc-def', '123', 'phone'] :
                          ['not a url', 'http:/', 'example'],
        severity: pickSeverity(invalidPercent),
        headlineMetric: {
          label: `Invalid ${kind}s`, value: fmtPct(invalidPercent),
          hint: `${fmtNum(invalidCount)} of ${fmtNum(totalRecords)} fail format check`
        }
      };
    }
    case 'referential_integrity': {
      const orphanPercent = +(rnd() * 6).toFixed(2);
      const orphanCount = Math.floor(totalRecords * orphanPercent / 100);
      return {
        ...base, checkType: 'referential_integrity',
        totalReferences: totalRecords, orphanCount, orphanPercent,
        orphanExamples: ['001XX000003DHPh', '003XX000004TrLA', '005XX0000012Aab'],
        severity: pickSeverity(orphanPercent),
        headlineMetric: {
          label: 'Orphan references', value: fmtPct(orphanPercent),
          hint: `${fmtNum(orphanCount)} references point to missing parents`
        }
      };
    }
  }
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
      return NextResponse.json({ error: `Check "${check.name}" does not apply to ${fld.type} fields` }, { status: 400 });
    }

    const sampleQuery = buildSampleQuery(system as SystemKey, checkType as CheckKey, object, field);

    // Live Salesforce path
    if (system === 'salesforce') {
      const info = getConnectionInfo();
      if (info.connected) {
        try {
          const result = await runCheck(checkType as CheckKey, object, field, fld.type as FieldType);
          return NextResponse.json({ result, mode: 'live' });
        } catch (e: any) {
          return NextResponse.json(
            { error: `Live check failed: ${e?.message ?? e}. Verify object and field exist in your org and you have permission.` },
            { status: 500 }
          );
        }
      }
    }

    // Mock fallback (for Zendesk or Salesforce-without-connection)
    await new Promise((r) => setTimeout(r, 300));
    const result = generateMockResult(
      { system: system as SystemKey, checkType: checkType as CheckKey, object, field },
      fld.type as FieldType,
      sampleQuery
    );
    return NextResponse.json({ result, mode: 'mock' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Check failed' }, { status: 500 });
  }
}
