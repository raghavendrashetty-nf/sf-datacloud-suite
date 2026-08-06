import { NextRequest } from 'next/server';
import { getTargetConnectionInfo, getActiveTargetConnection } from '@/lib/salesforceClient';
import { deployMetadataPackage } from '@/lib/dataCloudClient';
import { ndjsonResponse } from '@/lib/ndjsonStream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body { zipBase64?: string; checkOnly?: boolean; }

// Deploys into the TARGET org - the one org-mutating operation in this feature. checkOnly=true
// validates without changing anything (the safe default this UI always runs first); checkOnly=
// false actually commits it, re-submitting the same zip fresh rather than reusing the validated
// request ID - confirmed live that Salesforce's "quick deploy" shortcut for reusing a validated
// ID (deployRecentValidation) fails with "Source validate did not run tests in the org" for this
// app's Data-Cloud-only packages regardless of testLevel, while re-submitting the zip directly
// works cleanly.
export async function POST(req: NextRequest) {
  if (!getTargetConnectionInfo().connected) {
    return new Response(JSON.stringify({ error: 'Not connected to a target Salesforce org. Connect a target org first.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const targetConn = getActiveTargetConnection();

  if (!body.zipBase64) {
    return new Response(JSON.stringify({ error: 'Missing zipBase64 - create a package first.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const checkOnly = body.checkOnly !== false; // default to the safe validate-only path unless explicitly disabled
  return ndjsonResponse(
    (send) => deployMetadataPackage(targetConn, body.zipBase64!, checkOnly, (message) => send({ type: 'progress', message })),
    (outcome) => ({ type: 'done', outcome })
  );
}
