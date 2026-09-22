/**
 * Auth gate for the realtime SSE endpoint, factored out of
 * `src/routes/api/realtime.ts` so it can be unit tested without a live
 * request context (session cookie resolution needs one; this doesn't).
 */

import { UnauthorizedError } from "@/server/errors";

export type RealtimeAuthResult = { ok: true; userId: string } | { ok: false; response: Response };

/**
 * Resolve the connecting user id via `resolveUserId` (in production, the
 * existing `requireSessionUserId`). Never trusts anything from the request
 * itself — the only way to get a `userId` back is for `resolveUserId` to
 * succeed. Any `UnauthorizedError` becomes a 401 `Response`; any other
 * error is rethrown so it surfaces the same way every other server error
 * does, rather than being silently swallowed as an auth failure.
 */
export async function resolveRealtimeAuth(resolveUserId: () => Promise<string>): Promise<RealtimeAuthResult> {
  try {
    const userId = await resolveUserId();
    return { ok: true, userId };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
    }
    throw error;
  }
}
