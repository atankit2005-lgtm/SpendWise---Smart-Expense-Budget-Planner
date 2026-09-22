/**
 * Builds the actual `Response` returned by the authenticated SSE endpoint.
 *
 * Framework-agnostic on purpose: this only uses standard `ReadableStream`
 * and `Response` Web APIs, so it doesn't need to invent anything beyond
 * what the installed TanStack Start server-routes support (see
 * `src/routes/api/realtime.ts`, which is the only caller).
 */

import type { RealtimeEvent } from "./events";
import { subscribe } from "./registry";
import { encodeSseComment, encodeSseEvent } from "./sse";

/**
 * How often to send a keepalive comment on an otherwise-idle connection.
 * Comfortably under typical intermediary idle-connection timeouts (often
 * 30-60s) without generating meaningful traffic.
 */
const HEARTBEAT_INTERVAL_MS = 25_000;

export interface RealtimeStreamHandle {
  response: Response;
  /**
   * Exposed for tests only: production code never calls this directly, the
   * stream's own `cancel()` (invoked when the client disconnects) does.
   */
  stop: () => void;
}

/**
 * Create the SSE `Response` for one authenticated connection belonging to
 * `userId`. Registers exactly one subscriber with the registry for the
 * lifetime of the stream, and guarantees it's removed — along with the
 * heartbeat timer — when the stream is cancelled (client disconnect,
 * navigation away, tab close) so long-lived server processes don't leak
 * subscribers or timers.
 */
export function createRealtimeStream(userId: string): RealtimeStreamHandle {
  let stop: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The underlying connection is already gone; cancel() (or the
          // next heartbeat/publish tick) will run cleanup.
        }
      };

      const onEvent = (event: RealtimeEvent) => enqueue(encodeSseEvent(event));
      const unsubscribe = subscribe(userId, onEvent);

      const heartbeat = setInterval(() => enqueue(encodeSseComment("heartbeat")), HEARTBEAT_INTERVAL_MS);

      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      };

      // Opening comment: gives the client/any buffering proxy an immediate
      // byte so the connection is confirmed open, without being a real event.
      enqueue(encodeSseComment("connected"));
    },
    cancel() {
      stop();
    },
  });

  const response = new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Prevents common reverse proxies (nginx et al.) from buffering the
      // stream, which would otherwise defeat the point of SSE.
      "X-Accel-Buffering": "no",
    },
  });

  return { response, stop };
}
