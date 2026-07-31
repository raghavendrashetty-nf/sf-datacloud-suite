import { NextRequest } from 'next/server';
import { getConnectionInfo } from '@/lib/salesforceClient';
import { retrieveMetadataPackage, generatePackageXml } from '@/lib/dataCloudClient';
import { ndjsonResponse } from '@/lib/ndjsonStream';
import type { PackageComponentSelection } from '@/lib/deploymentPackage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_VERSION = '64.0';

interface Body { selections?: PackageComponentSelection[]; }

// Retrieves the real metadata XML for the selected components from the SOURCE org - read-only,
// mutates nothing (Metadata API retrieve() never writes). Returns a downloadable zip + the
// package.xml manifest text for review.
export async function POST(req: NextRequest) {
  if (!getConnectionInfo().connected) {
    return new Response(JSON.stringify({ error: 'Not connected to a source Salesforce org. Connect first.' }), {
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
  const selections = Array.isArray(body.selections) ? body.selections : [];
  if (selections.every((s) => !s.members || s.members.length === 0)) {
    return new Response(JSON.stringify({ error: 'Select at least one component before creating a package.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  return ndjsonResponse(
    (send) => retrieveMetadataPackage(selections, API_VERSION, (message) => send({ type: 'progress', message })),
    (pkg) => ({ type: 'done', zipBase64: pkg.zipBase64, fileCount: pkg.fileCount, packageXml: generatePackageXml(selections, API_VERSION) })
  );
}
