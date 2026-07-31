import { NextRequest } from 'next/server';
import { getTargetConnectionInfo, getActiveTargetConnection } from '@/lib/salesforceClient';
import { deployMetadataPackage, deployRecentValidation } from '@/lib/dataCloudClient';
import { ndjsonResponse } from '@/lib/ndjsonStream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body { zipBase64?: string; checkOnly?: boolean; validatedDeployId?: string; }

// Deploys into the TARGET org - the one org-mutating operation in this feature. Two distinct
// modes, both explicit (never inferred): checkOnly=true validates without changing anything
// (the safe default this UI always runs first); passing validatedDeployId instead deploys a
// previously-validated request for real via deployRecentValidation(), Salesforce's own
// documented "validate then commit" path.
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

  if (body.validatedDeployId) {
    return ndjsonResponse(
      (send) => deployRecentValidation(targetConn, body.validatedDeployId!, (message) => send({ type: 'progress', message })),
      (outcome) => ({ type: 'done', outcome })
    );
  }

  if (!body.zipBase64) {
    return new Response(JSON.stringify({ error: 'Missing zipBase64 - create a package first.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const checkOnly = body.checkOnly !== false; // default to the safe validate-only path unless explicitly disabled
  return ndjsonResponse(
    (send) => deployMetadataPackage(targetConn, body.zipBase64!, checkOnly, (message) => send({ type: 'progress', message })),
    (outcome) => ({ type: 'done', outcome })
  );
}
