import { NextRequest, NextResponse } from 'next/server';
import { setConnection, getConnectionInfo, clearConnection } from '@/lib/salesforceClient';
import type { SFConnectionConfig } from '@/lib/dataReadiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const info = getConnectionInfo();
  return NextResponse.json({ info });
}

export async function POST(req: NextRequest) {
  try {
    const config: SFConnectionConfig = await req.json();
    if (!config.username || !config.password) {
      return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
    }
    if (!config.domain) {
      config.domain = config.instanceUrl?.includes('sandbox') ? 'test' : 'login';
    }
    const info = await setConnection(config);
    return NextResponse.json({ info });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Failed to connect to Salesforce', name: e?.name, errorCode: e?.errorCode },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  clearConnection();
  return NextResponse.json({ ok: true });
}
