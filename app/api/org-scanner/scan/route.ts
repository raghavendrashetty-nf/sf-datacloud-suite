import { getConnectionInfo } from '@/lib/salesforceClient';
import { runOrgScan } from '@/lib/dataCloudClient';
import { ndjsonResponse } from '@/lib/ndjsonStream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Streams newline-delimited JSON so the UI can show real, as-it-happens progress instead of a
// blank spinner - large orgs (100+ paginated DLOs/DMOs) can take well over a minute end to end.
export async function POST() {
  if (!getConnectionInfo().connected) {
    return new Response(JSON.stringify({ error: 'Not connected to Salesforce. Save a connection first.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return ndjsonResponse(
    (send) => runOrgScan((message) => send({ type: 'progress', message })),
    (results) => ({ type: 'done', results })
  );
}
