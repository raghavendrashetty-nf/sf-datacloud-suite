import { NextResponse } from 'next/server';
import { getConnectionInfo } from '@/lib/salesforceClient';
import { listDataKits } from '@/lib/dataCloudClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lists Data Kits (DataPackageKitDefinition) already authored in the SOURCE org - read-only,
// via the standard Metadata API list()/read() calls.
export async function GET() {
  if (!getConnectionInfo().connected) {
    return NextResponse.json({ error: 'Not connected to a source Salesforce org. Connect first.' }, { status: 401 });
  }
  try {
    const dataKits = await listDataKits();
    return NextResponse.json({ dataKits });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to list Data Kits' }, { status: 500 });
  }
}
