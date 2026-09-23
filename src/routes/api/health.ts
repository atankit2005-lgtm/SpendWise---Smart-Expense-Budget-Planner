import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/health — liveness probe.
 *
 * Returns 200 as long as the server process can handle requests. Public
 * (no auth), fixed-size JSON, and deliberately never touches the database
 * or exposes configuration details.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        }),
    },
  },
});
