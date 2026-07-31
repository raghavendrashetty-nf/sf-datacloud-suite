// Server-side only. Shared newline-delimited-JSON streaming response builder, so long-running
// operations (org scan, deployment package retrieve/deploy) can report real, as-it-happens
// progress instead of leaving the UI blocked on a single request with no feedback.
export function ndjsonResponse<T>(run: (send: (obj: unknown) => void) => Promise<T>, toDoneMessage: (result: T) => unknown) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const result = await run(send);
        send(toDoneMessage(result));
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  });
}
