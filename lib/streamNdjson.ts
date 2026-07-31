'use client';

// Consumes a newline-delimited-JSON streaming Response (the pattern used by every long-running
// operation in this app - org scan, deployment package build/validate/deploy) and invokes
// onMessage for each parsed line as it arrives.
export async function streamNdjson(url: string, init: RequestInit, onMessage: (msg: any) => void): Promise<void> {
  const resp = await fetch(url, init);
  if (!resp.ok) {
    let message = `Request failed with HTTP ${resp.status}`;
    try { const json = await resp.json(); message = json.error ?? message; } catch { /* body wasn't JSON */ }
    throw new Error(message);
  }
  if (!resp.body) throw new Error('Streaming response body not available in this browser.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line) onMessage(JSON.parse(line));
    }
  }
}
