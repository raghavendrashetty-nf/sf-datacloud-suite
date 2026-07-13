import { NextRequest, NextResponse } from 'next/server';
import catalog from '@/config/dataReadinessCatalog.json';
import { Catalog, CheckKey, CheckRequest, CheckResult, FieldType, SystemKey } from '@/lib/dataReadiness';
import { describeObjectFields, getConnectionInfo, runCheck } from '@/lib/salesforceClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAT = catalog as unknown as Catalog;

export async function POST(req: NextRequest) {
  try {
    const body: CheckRequest = await req.json();
    const { system, checkType, object, field } = body;
    if (!system || !checkType || !object || !field) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    const check = CAT.checks[checkType as CheckKey];
    if (!check) return NextResponse.json({ error: `Unknown check: ${checkType}` }, { status: 400 });

    if (system === 'salesforce') {
      const info = getConnectionInfo();
      if (info.connected) {
        try {
          const fields = await describeObjectFields(object);
          const fdef = fields.find((f) => f.name === field);
          if (!fdef) return NextResponse.json({ error: `Field ${field} not found on ${object}` }, { status: 400 });
          if (!check.appliesToTypes.includes(fdef.mappedType as any)) {
            return NextResponse.json({ error: `Check "${check.name}" does not apply to ${fdef.type} fields` }, { status: 400 });
          }
          const result = await runCheck(checkType as CheckKey, object, field, fdef.mappedType as FieldType);
          return NextResponse.json({ result, mode: 'live' });
        } catch (e: any) {
          return NextResponse.json({ error: `Live check failed: ${e?.message ?? e}` }, { status: 500 });
        }
      }
    }
    return NextResponse.json({ error: 'Not connected to Salesforce. Only live checks are supported in this build.' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Check failed' }, { status: 500 });
  }
}
