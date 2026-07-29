import { NextResponse } from 'next/server';
import { getConnectionInfo } from '@/lib/salesforceClient';
import { runOrgScan } from '@/lib/dataCloudClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!getConnectionInfo().connected) {
    return NextResponse.json({ error: 'Not connected to Salesforce. Save a connection first.' }, { status: 401 });
  }
  try {
    const results = await runOrgScan();
    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Scan failed: ${message}` }, { status: 500 });
  }
}
