/**
 * Stage 6.4 route-level security tests for GET /api/realtime.
 *
 * The route handler is invoked directly (TanStack exposes it via
 * `Route.options.server.handlers.GET`) with the session resolution mocked at
 * the authentication-module boundary, while the real auth gate, stream, and
 * registry run. This verifies the endpoint's security contract end-to-end:
 *
 *  - unauthenticated requests are rejected with 401 and subscribe nobody;
 *  - the subscribed channel is derived ONLY from the server-side session —
 *    the handler accepts no request input at all, so URL/query/body tricks
 *    (e.g. `?userId=victim`) cannot select another user's channel;
 *  - events published for other users never reach the connection.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { randomUUID } from "node:crypto";

import { UnauthorizedError } from "../../server/errors";
import { publishRealtimeEvent, subscriberCountFor } from "../../server/realtime/registry";

const control = {
  sessionUserId: "",
};

mock.module("../../server/authentication", {
  namedExports: {
    requireSessionUserId: async () => {
      if (!control.sessionUserId) {
        throw new UnauthorizedError("You must be signed in to access SpendWise.");
      }
      return control.sessionUserId;
    },
  },
});

const { Route } = await import("./realtime");

type GetHandler = () => Promise<Response>;
const GET = (Route as unknown as { options: { server: { handlers: { GET: GetHandler } } } }).options
  .server.handlers.GET;

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value, done } = await reader.read();
  assert.equal(done, false);
  return new TextDecoder().decode(value);
}

/**
 * Read the next chunk with a short deadline. Resolves null when nothing
 * arrives — used to prove that an event published for another user produces
 * no bytes at all on this connection.
 */
async function readChunkOrNull(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 50,
): Promise<string | null> {
  const result = await Promise.race([
    reader.read().then((r) => (r.done ? null : new TextDecoder().decode(r.value))),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  return result;
}

beforeEach(() => {
  control.sessionUserId = "";
});

describe("GET /api/realtime security (Stage 6.4)", () => {
  it("rejects an unauthenticated request with 401 and subscribes nobody", async () => {
    const victim = randomUUID();
    // Even if the (ignored) request URL tried to name a channel, an
    // unauthenticated caller must end up with no subscription anywhere.
    const response = await GET();

    assert.equal(response.status, 401);
    assert.equal(subscriberCountFor(victim), 0);
  });

  it("derives the channel solely from the server-side session", async () => {
    const sessionUser = randomUUID();
    const victim = randomUUID();
    control.sessionUserId = sessionUser;

    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/event-stream");

    const reader = response.body!.getReader();
    await readChunk(reader); // opening ": connected" comment

    assert.equal(subscriberCountFor(sessionUser), 1, "session user is subscribed");
    assert.equal(subscriberCountFor(victim), 0, "no other channel can be selected");

    await reader.cancel();
    assert.equal(subscriberCountFor(sessionUser), 0);
  });

  it("never delivers another user's events to the connection", async () => {
    const userA = randomUUID();
    const userB = randomUUID();
    control.sessionUserId = userA;

    const response = await GET();
    const reader = response.body!.getReader();
    await readChunk(reader);

    // Publish for User B first: must produce no bytes on A's connection...
    publishRealtimeEvent(userB, { type: "transaction.changed" });
    // ...proven deterministically by the next publish for A being the very
    // next chunk the reader sees (no B frame can precede it).
    publishRealtimeEvent(userA, { type: "budget.changed" });

    const leaked = await readChunkOrNull(reader);
    assert.ok(leaked, "expected user A's event chunk");
    assert.match(leaked, /budget\.changed/);
    assert.ok(!leaked.includes("transaction.changed"), "user B's event must not appear");

    const nothingMore = await readChunkOrNull(reader);
    assert.equal(nothingMore, null, "no further frames should arrive");

    await reader.cancel();
  });
});
