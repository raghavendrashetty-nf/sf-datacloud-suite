import { NextResponse } from 'next/server';
import { getZendeskConnectionInfo, describeZendeskObjectFields } from '@/lib/zendeskClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { object: string } }) {
  try {
    if (!getZendeskConnectionInfo().connected) {
      return NextResponse.json({ error: 'Not connected to Zendesk' }, { status: 401 });
    }
    const object = decodeURIComponent(params.object || '');
    if (!object) return NextResponse.json({ error: 'Missing object name' }, { status: 400 });
    const fields = await describeZendeskObjectFields(object);
    return NextResponse.json({ object, fields });
  } catch (e: any) {
    const msg = e?.message ?? 'Failed to describe object';
    const status = /not exist|not supported|unknown/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}