import { NextRequest } from 'next/server';
import { getConnectionInfo } from '@/lib/salesforceClient';
import { generatePackageXml, getDataKitManifestSelections, retrieveMetadataPackage } from '@/lib/dataCloudClient';
import { ndjsonResponse } from '@/lib/ndjsonStream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_VERSION = '64.0';

interface Body { dataKitName?: string; }

// Packages an ALREADY-authored Data Kit (built by hand in Data Cloud Setup's Data Kit Studio -
// no API creates one from scratch) for deployment: fetches its Salesforce-computed manifest
// (real component list, dependencies already resolved), then retrieves that exact metadata via
// the same retrieveMetadataPackage() used by the manual component-selection path. Read-only
// against the source org - retrieve() never mutates anything.
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
  if (!body.dataKitName) {
    return new Response(JSON.stringify({ error: 'Select a Data Kit first.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  return ndjsonResponse(
    async (send) => {
      const onProgress = (message: string) => send({ type: 'progress', message });
      const selections = await getDataKitManifestSelections(body.dataKitName!, onProgress);
      if (selections.length === 0) {
        throw new Error('This Data Kit\'s manifest came back empty - it may not have any components added to it yet in Data Cloud Setup.');
      }
      const pkg = await retrieveMetadataPackage(selections, API_VERSION, onProgress);
      return { pkg, selections };
    },
    ({ pkg, selections }) => ({ type: 'done', zipBase64: pkg.zipBase64, fileCount: pkg.fileCount, packageXml: generatePackageXml(selections, API_VERSION) })
  );
}
