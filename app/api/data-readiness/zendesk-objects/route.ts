import { NextResponse } from 'next/server';
import { getZendeskConnectionInfo, listZendeskObjects } from '@/lib/zendeskClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!getZendeskConnectionInfo().connected) {
      return NextResponse.json({ error: 'Not connected to Zendesk' }, { status: 401 });
    }
    const items = await listZendeskObjects();
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to list objects' }, { status: 500 });
  }
}