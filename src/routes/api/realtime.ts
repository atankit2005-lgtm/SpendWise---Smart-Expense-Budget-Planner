import { createFileRoute } from "@tanstack/react-router";

import { requireSessionUserId } from "@/server/authentication";
import { resolveRealtimeAuth } from "@/server/realtime/auth-gate";
import { createRealtimeStream } from "@/server/realtime/stream";

/**
 * GET /api/realtime — long-lived Server-Sent Events connection.
 *
 * Stage 6.1: transport foundation only. This endpoint authenticates the
 * request against the existing session cookie, registers exactly one
 * per-user subscriber, and streams events published via
 * `publishRealtimeEvent`. Nothing calls `publishRealtimeEvent` yet — no
 * transaction/budget/goal mutation is wired up until Stage 6.2.
 */
export const Route = createFileRoute("/api/realtime")({
  server: {
    handlers: {
      GET: async () => {
        // The user id MUST come from the existing session mechanism, never
        // from anything the browser could supply on the request — SSE
        // connections carry no request body to trust in the first place.
        const auth = await resolveRealtimeAuth(requireSessionUserId);
        if (!auth.ok) return auth.response;

        return createRealtimeStream(auth.userId).response;
      },
    },
  },
});
