/**
 * Typed event model for SpendWise's server-side realtime transport (Stage 6.1).
 *
 * This is intentionally a small, closed set of *invalidation* events, not a
 * mirror of the underlying financial records. A connected client reacts to
 * one of these by re-fetching the authoritative `FinanceSnapshot` via the
 * existing persistence layer — the realtime layer never carries the
 * transaction/budget/goal payload itself, so there is nothing sensitive to
 * leak over the wire and no second source of truth to keep in sync with
 * PostgreSQL.
 *
 * Stage 6.1 only defines the transport. Nothing in the app publishes these
 * events yet — that lands in Stage 6.2, which wires successful persistence
 * mutations to `publishRealtimeEvent`.
 */

/** The realtime event families a client can be notified about. */
export type RealtimeEventType =
  | "transaction.changed"
  | "budget.changed"
  | "goal.changed"
  | "notification.changed"
  | "finance.snapshot.invalidated";

/**
 * What a publisher provides. Deliberately payload-free: these are
 * invalidation signals, not data. Callers that need to say *which* record
 * changed can extend this later with an opaque, non-sensitive id — but
 * Stage 6.1 does not need that yet.
 */
export interface RealtimeEventInput {
  type: RealtimeEventType;
}

/**
 * What a subscriber receives. `id` and `publishedAt` are assigned by the
 * registry at publish time so every subscriber for a user sees the same
 * ordering, regardless of when it connected.
 *
 * Deliberately does NOT include the owning user id: the event only ever
 * reaches subscribers already scoped to that user (see `registry.ts`), so
 * repeating the id on the wire would just be redundant exposure.
 */
export interface RealtimeEvent extends RealtimeEventInput {
  /** Monotonically increasing within this server process. Not durable across restarts. */
  id: number;
  /** ISO-8601 timestamp assigned when the event was published. */
  publishedAt: string;
}
