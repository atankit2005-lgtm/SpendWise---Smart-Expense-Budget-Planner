/**
 * Publishing seam between the persistence layer and the Stage 6.1 realtime
 * registry (Stage 6.2).
 *
 * Persistence code calls `publishPersistenceEvent(userId, type)` *after* a
 * database mutation has successfully committed — never before, never on a
 * failure path. The event is a payload-free invalidation signal scoped to the
 * authenticated owner's id (see `events.ts` / `registry.ts`).
 *
 * Realtime delivery is strictly best-effort: once PostgreSQL has committed,
 * the mutation is authoritative, so a throwing subscriber (e.g. a client that
 * disconnected mid-publish) must never surface as a persistence failure. The
 * registry already cleans up dead subscribers on stream cancel; this wrapper
 * additionally isolates any synchronous subscriber error.
 */

import type { RealtimeEventType } from "./events";
import { publishRealtimeEvent } from "./registry";

export function publishPersistenceEvent(userId: string, type: RealtimeEventType): void {
  try {
    publishRealtimeEvent(userId, { type });
  } catch {
    // Best-effort delivery: an already-committed database mutation must not
    // be turned into a failure because a connected subscriber misbehaved.
  }
}
