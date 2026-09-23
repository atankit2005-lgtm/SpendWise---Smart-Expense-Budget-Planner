/**
 * Client-side realtime synchronization for SpendWise (Stage 6.3).
 *
 * Opens the single authenticated SSE connection to `GET /api/realtime`
 * (Stage 6.1 transport) and turns payload-free invalidation events
 * (Stage 6.2 publication) into calls to `onInvalidation`, which the
 * FinanceProvider implements as "refetch the authoritative FinanceSnapshot".
 *
 * Design rules this module enforces:
 *  - Session-cookie authentication only: nothing identifying the user is
 *    ever placed in the URL; the server decides who this connection belongs
 *    to (see `src/routes/api/realtime.ts`).
 *  - Exactly one EventSource per handle; `close()` tears everything down
 *    (socket + pending reconnect timer).
 *  - Events are *invalidation signals*: the `data` JSON is validated only to
 *    confirm it is a well-formed event of the expected type, never to
 *    extract financial records — there are none on the wire by design.
 *  - Heartbeats (SSE comment frames) never surface as events in EventSource,
 *    and no default `message` listener is registered, so unnamed/unexpected
 *    frames cannot trigger a refetch either.
 *  - Snapshot syncs are coalesced: at most one `onInvalidation` runs at a
 *    time; events arriving mid-sync schedule exactly one trailing sync, so
 *    rapid transaction/budget/goal bursts collapse without losing freshness.
 *  - Reconnection uses a modest bounded backoff (1s → 2s → 5s → 10s → cap
 *    30s), reset after a successful `open`, with at most one pending timer.
 *
 * Framework-agnostic on purpose (no React imports) so it is unit-testable
 * under `node:test` with an injected EventSource factory and timers.
 */

export const REALTIME_ENDPOINT = "/api/realtime";

/** The closed Stage 6.1 event taxonomy. Anything else on the wire is ignored. */
export const SUPPORTED_REALTIME_EVENTS = [
  "transaction.changed",
  "budget.changed",
  "goal.changed",
  "notification.changed",
  "finance.snapshot.invalidated",
] as const;

export type SupportedRealtimeEvent = (typeof SUPPORTED_REALTIME_EVENTS)[number];

/** Backoff schedule for reconnects; after these, retries cap at 30s. */
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;
export const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * The slice of the browser `EventSource` API this module uses, so tests can
 * substitute a fake without a DOM.
 */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data?: string | undefined }) => void): void;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export type TimerToken = ReturnType<typeof setTimeout>;

export interface RealtimeSyncOptions {
  /**
   * Called when a supported invalidation event arrives. Implementations
   * refetch and apply the authoritative snapshot; errors are caught here so
   * a failed sync can never crash the connection or the provider.
   */
  onInvalidation: () => unknown;
  createEventSource?: EventSourceFactory;
  setTimer?: (callback: () => void, delayMs: number) => TimerToken;
  clearTimer?: (token: TimerToken) => void;
}

export interface RealtimeSyncHandle {
  /** Close the socket, cancel any pending reconnect, and ignore future events. Idempotent. */
  close(): void;
}

function defaultCreateEventSource(url: string): EventSourceLike {
  return new EventSource(url);
}

/**
 * Validate one inbound SSE frame against the expected event type. The server
 * sends `data: {"type":"...","publishedAt":"..."}`; anything unparseable,
 * empty, or mismatched is treated as noise and ignored.
 */
export function isValidRealtimeFrame(data: string | undefined, expectedType: SupportedRealtimeEvent): boolean {
  if (!data) return false;
  try {
    const parsed: unknown = JSON.parse(data);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === expectedType
    );
  } catch {
    return false;
  }
}

export function createRealtimeSync(options: RealtimeSyncOptions): RealtimeSyncHandle {
  const createEventSource = options.createEventSource ?? defaultCreateEventSource;
  const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((token) => clearTimeout(token));

  let closed = false;
  let source: EventSourceLike | null = null;
  let reconnectTimer: TimerToken | null = null;
  let reconnectAttempt = 0;

  // Coalescing state: one sync in flight at a time, plus at most one
  // pending trailing sync regardless of how many events arrived mid-flight.
  let syncing = false;
  let syncQueued = false;

  async function runSync(): Promise<void> {
    if (syncing) {
      syncQueued = true;
      return;
    }
    syncing = true;
    try {
      await options.onInvalidation();
    } catch {
      // A failed refetch (network blip, transient server error) must not
      // break the connection; the next event or reconnect tries again.
    } finally {
      syncing = false;
      if (syncQueued && !closed) {
        syncQueued = false;
        void runSync();
      }
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimer(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer !== null) return;
    const delay = Math.min(
      RECONNECT_DELAYS_MS[reconnectAttempt] ?? RECONNECT_MAX_DELAY_MS,
      RECONNECT_MAX_DELAY_MS,
    );
    reconnectAttempt += 1;
    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect(): void {
    if (closed) return;
    const next = createEventSource(REALTIME_ENDPOINT);
    source = next;

    next.addEventListener("open", () => {
      reconnectAttempt = 0;
    });

    next.addEventListener("error", () => {
      if (closed) return;
      // Take ownership of reconnection: drop this socket (the native
      // EventSource may otherwise retry on its own schedule) and retry with
      // the bounded backoff above. Auth failures surface here too — retrying
      // at ≤ every 30s is deliberate: modest, never hammering, and the
      // provider closes this handle entirely when the session goes away.
      next.close();
      if (source === next) source = null;
      scheduleReconnect();
    });

    for (const type of SUPPORTED_REALTIME_EVENTS) {
      next.addEventListener(type, (event) => {
        if (closed) return;
        if (!isValidRealtimeFrame(event.data, type)) return;
        void runSync();
      });
    }
  }

  connect();

  return {
    close() {
      if (closed) return;
      closed = true;
      clearReconnectTimer();
      source?.close();
      source = null;
    },
  };
}
