import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RealtimeEvent } from "./events";
import { encodeSseComment, encodeSseEvent } from "./sse";

describe("SSE wire-format encoding", () => {
  it("frames an event with id/event/data fields terminated by a blank line", () => {
    const event: RealtimeEvent = {
      type: "transaction.changed",
      id: 7,
      publishedAt: "2026-09-23T00:00:00.000Z",
    };

    const encoded = encodeSseEvent(event);

    assert.equal(encoded, 'id: 7\nevent: transaction.changed\ndata: {"type":"transaction.changed","publishedAt":"2026-09-23T00:00:00.000Z"}\n\n');
  });

  it("serializes only type and publishedAt — never a user id or record payload", () => {
    const event: RealtimeEvent = {
      type: "budget.changed",
      id: 1,
      publishedAt: "2026-09-23T00:00:00.000Z",
    };

    const encoded = encodeSseEvent(event);
    const dataLine = encoded.split("\n").find((line) => line.startsWith("data: "));
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as Record<string, unknown>;

    assert.deepEqual(Object.keys(payload).sort(), ["publishedAt", "type"]);
  });

  it("encodes a comment line that EventSource clients ignore but keeps the connection non-idle", () => {
    assert.equal(encodeSseComment("heartbeat"), ": heartbeat\n\n");
  });
});
