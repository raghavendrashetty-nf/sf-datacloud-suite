import { getConnectionInfo } from '@/lib/salesforceClient';
import { listDeployableComponents } from '@/lib/dataCloudClient';
import { ndjsonResponse } from '@/lib/ndjsonStream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Discovers real, currently-configured Data Cloud components in the SOURCE org that are
// confirmed deployable via the standard Metadata API - read-only, mutates nothing.
export async function POST() {
  if (!getConnectionInfo().connected) {
    return new Response(JSON.stringify({ error: 'Not connected to a source Salesforce org. Connect first.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return ndjsonResponse(
    (send) => listDeployableComponents((message) => send({ type: 'progress', message })),
    (categories) => ({ type: 'done', categories })
  );
}
