/**
 * Minimal "the browser session just ended" signal (Stage 6.4).
 *
 * Logout in SpendWise is a client-side navigation: `logoutFn()` runs on the
 * server and the app navigates to /login without unmounting the root
 * FinanceProvider. Without a signal, the provider would keep its
 * authenticated-user state — and therefore its open SSE connection and any
 * pending reconnect timers — alive after logout.
 *
 * This module is deliberately tiny and dependency-free (same spirit as
 * `src/lib/ai/events.ts`): the logout UI announces the session end, and the
 * FinanceProvider reacts by dropping its authenticated-user state, which
 * closes the realtime connection through the normal effect cleanup.
 *
 * This is NOT an authentication mechanism — the server session remains the
 * only authority. The signal only drives local client cleanup.
 */

type SessionEndedListener = () => void;

const listeners = new Set<SessionEndedListener>();

/** Subscribe to session-ended notifications. Returns an unsubscribe function. */
export function onSessionEnded(listener: SessionEndedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announce that the current browser session has ended (called after logout). */
export function signalSessionEnded(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One failing listener must not block the others (or the logout flow).
    }
  }
}

/** Number of active listeners. Test/diagnostics only. */
export function sessionEndedListenerCount(): number {
  return listeners.size;
}
