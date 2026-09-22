/**
 * Server-Sent Events wire-format helpers.
 *
 * Kept separate from `stream.ts` so the byte-level framing (what actually
 * goes over the wire) can be unit tested without spinning up a
 * `ReadableStream`/`Response`.
 */

import type { RealtimeEvent } from "./events";

/**
 * Encode a realtime event as one SSE `event:`/`id:`/`data:` block.
 *
 * Only the small, non-sensitive `RealtimeEvent` shape is ever serialized
 * here — see `events.ts` for why that shape deliberately excludes the
 * owning user id and any underlying record data.
 */
export function encodeSseEvent(event: RealtimeEvent): string {
  const data = JSON.stringify({ type: event.type, publishedAt: event.publishedAt });
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${data}\n\n`;
}

/**
 * Encode an SSE comment line (`:`-prefixed). Comments are ignored by the
 * `EventSource` client but keep intermediary proxies/load balancers from
 * treating the connection as idle, and don't themselves constitute an
 * application event.
 */
export function encodeSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}
