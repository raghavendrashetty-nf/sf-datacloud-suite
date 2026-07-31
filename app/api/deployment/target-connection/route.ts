import { NextRequest, NextResponse } from 'next/server';
import { setTargetConnection, getTargetConnectionInfo, clearTargetConnection } from '@/lib/salesforceClient';
import type { SFConnectionConfig } from '@/lib/dataReadiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() { return NextResponse.json({ info: getTargetConnectionInfo() }); }

export async function POST(req: NextRequest) {
  try {
    const config: SFConnectionConfig = await req.json();
    if (!config.username || !config.password) return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
    if (!config.domain) config.domain = config.instanceUrl?.includes('sandbox') ? 'test' : 'login';
    const info = await setTargetConnection(config);
    return NextResponse.json({ info });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to connect', name: e?.name, errorCode: e?.errorCode }, { status: 400 });
  }
}

export async function DELETE() { clearTargetConnection(); return NextResponse.json({ ok: true }); }
