import { NextRequest, NextResponse } from 'next/server';
import {
  setZendeskConnection, getZendeskConnectionInfo, clearZendeskConnection
} from '@/lib/zendeskClient';
import type { ZendeskConnectionConfig } from '@/lib/zendeskClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ info: getZendeskConnectionInfo() });
}

export async function POST(req: NextRequest) {
  try {
    const config: ZendeskConnectionConfig = await req.json();
    if (!config.subdomain || !config.email || !config.apiToken) {
      return NextResponse.json({ error: 'Missing subdomain, email, or API token' }, { status: 400 });
    }
    const info = await setZendeskConnection(config);
    return NextResponse.json({ info });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to connect to Zendesk' }, { status: 400 });
  }
}

export async function DELETE() {
  clearZendeskConnection();
  return NextResponse.json({ ok: true });
}