import { NextRequest, NextResponse } from 'next/server';
import { clearOAuthClientConfig, getOAuthClientConfigStatus, setOAuthClientConfig } from '@/lib/salesforceOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lets a user configure the Connected App Consumer Key/Secret from the browser instead of
// editing .env.local + restarting the server. Stored in-memory only (globalThis, same pattern as
// the rest of this app's session state) - never written to disk, cleared on server restart.

interface Body { clientId?: string; clientSecret?: string; redirectUri?: string; }

export async function GET() {
  return NextResponse.json(getOAuthClientConfigStatus());
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.clientId) {
    return NextResponse.json({ error: 'Consumer Key (Client ID) is required.' }, { status: 400 });
  }
  setOAuthClientConfig({
    clientId: body.clientId.trim(),
    clientSecret: body.clientSecret?.trim() || undefined,
    redirectUri: body.redirectUri?.trim() || ''
  });
  return NextResponse.json(getOAuthClientConfigStatus());
}

export async function DELETE() {
  clearOAuthClientConfig();
  return NextResponse.json(getOAuthClientConfigStatus());
}
