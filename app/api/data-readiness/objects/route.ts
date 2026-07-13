import { NextResponse } from 'next/server';
import { getConnectionInfo, listObjects } from '@/lib/salesforceClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    if (!getConnectionInfo().connected) return NextResponse.json({ error: 'Not connected to Salesforce' }, { status: 401 });
    const url = new URL(req.url);
    const includeAll = url.searchParams.get('includeAll') === '1';
    const items = await listObjects({ includeAll });
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to list objects' }, { status: 500 });
  }
}
