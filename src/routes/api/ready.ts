import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/server/db";

/**
 * GET /api/ready — readiness probe.
 *
 * 200 only when PostgreSQL is reachable through the existing Drizzle
 * connection layer (smallest practical read-only query, no mutations, no
 * migrations). Otherwise 503. Public (no auth), and the response never
 * includes error details, stack traces, or connection information.
 */
export const Route = createFileRoute("/api/ready")({
  server: {
    handlers: {
      GET: async () => {
        if (!isDatabaseConfigured()) return unavailable();

        try {
          await getDb().execute(sql`SELECT 1`);
        } catch {
          // Swallow the error on purpose: driver errors can embed hostnames
          // or connection fragments, and none of that may reach the client.
          return unavailable();
        }

        return new Response(JSON.stringify({ status: "ready" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

function unavailable(): Response {
  return new Response(JSON.stringify({ status: "unavailable" }), {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
