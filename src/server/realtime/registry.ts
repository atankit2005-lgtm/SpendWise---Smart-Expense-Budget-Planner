/**
 * Per-user subscription registry for SpendWise's realtime transport.
 *
 * This is process-local, in-memory state: `Map<userId, Set<subscriber>>`.
 * It is intentionally not a message queue or a second database — it only
 * ever holds live callbacks for currently-connected SSE responses, scoped
 * by the authenticated user id that owns them. A subscriber registered for
 * user A can never be reached by an event published for user B, because
 * publishing only ever looks up the `Set` under that one user's key.
 *
 * `subscribe`/`publishRealtimeEvent` are the only two exports future code
 * needs:
 *  - the SSE route calls `subscribe` once per connection and calls the
 *    returned unsubscribe function on disconnect.
 *  - Stage 6.2 persistence code will call `publishRealtimeEvent(userId, ...)`
 *    after a successful mutation, without knowing anything about SSE.
 */

import type { RealtimeEvent, RealtimeEventInput } from "./events";

export type RealtimeSubscriber = (event: RealtimeEvent) => void;

const subscribersByUser = new Map<string, Set<RealtimeSubscriber>>();

let nextEventId = 1;

/**
 * Register a subscriber for a single authenticated user. Returns an
 * unsubscribe function; calling it is idempotent and safe to call more than
 * once (e.g. once from `cancel()` and once from an error path).
 *
 * Empty per-user sets are removed from the map immediately so a user with
 * no open connections leaves no trace behind — this is what keeps long-lived
 * server processes from slowly accumulating empty `Set`s for every user who
 * has ever connected.
 */
export function subscribe(userId: string, subscriber: RealtimeSubscriber): () => void {
  let subscribers = subscribersByUser.get(userId);
  if (!subscribers) {
    subscribers = new Set();
    subscribersByUser.set(userId, subscribers);
  }
  subscribers.add(subscriber);

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    const current = subscribersByUser.get(userId);
    if (!current) return;
    current.delete(subscriber);
    if (current.size === 0) subscribersByUser.delete(userId);
  };
}

/**
 * Publish an event to every currently-connected subscriber for `userId`.
 * Safe to call when the user has no open connections — this is expected to
 * happen constantly (most mutations happen while the user has no realtime
 * tab open) and must never throw.
 *
 * Delivery is isolated per subscriber (Stage 6.4): one throwing subscriber —
 * e.g. a response whose connection died between cleanup ticks — must neither
 * propagate to the publisher (a committed database mutation can never be
 * failed by realtime delivery) nor interrupt delivery to the remaining
 * subscribers for the same user.
 */
export function publishRealtimeEvent(userId: string, input: RealtimeEventInput): void {
  const subscribers = subscribersByUser.get(userId);
  if (!subscribers || subscribers.size === 0) return;

  const event: RealtimeEvent = {
    type: input.type,
    id: nextEventId++,
    publishedAt: new Date().toISOString(),
  };

  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      // Isolated on purpose; dead subscribers are cleaned up by the stream's
      // cancel path / unsubscribe, not here.
    }
  }
}

/** Number of users with at least one open subscription. Test/diagnostics only. */
export function subscribedUserCount(): number {
  return subscribersByUser.size;
}

/** Number of open subscriptions for one user. Test/diagnostics only. */
export function subscriberCountFor(userId: string): number {
  return subscribersByUser.get(userId)?.size ?? 0;
}
