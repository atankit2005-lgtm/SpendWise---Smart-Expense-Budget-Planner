import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import type { RealtimeEvent } from "./events";
import { publishPersistenceEvent } from "./publish";
import { subscribe } from "./registry";
import { encodeSseEvent } from "./sse";

function userId(): string {
  return randomUUID();
}

describe("persistence realtime publishing seam", () => {
  it("delivers a payload-free event to the owning user's subscribers", () => {
    const user = userId();
    const received: RealtimeEvent[] = [];
    const unsubscribe = subscribe(user, (event) => received.push(event));

    publishPersistenceEvent(user, "transaction.changed");

    assert.equal(received.length, 1);
    assert.equal(received[0]?.type, "transaction.changed");
    assert.deepEqual(Object.keys(received[0]!).sort(), ["id", "publishedAt", "type"]);
    unsubscribe();
  });

  it("never scopes events to any user other than the owner", () => {
    const userA = userId();
    const userB = userId();
    const receivedB: RealtimeEvent[] = [];
    const unsubB = subscribe(userB, (event) => receivedB.push(event));

    publishPersistenceEvent(userA, "budget.changed");

    assert.equal(receivedB.length, 0);
    unsubB();
  });

  it("isolates subscriber errors so persistence callers never see them", () => {
    const user = userId();
    const unsubscribe = subscribe(user, () => {
      throw new Error("subscriber blew up (e.g. client disconnected mid-publish)");
    });

    assert.doesNotThrow(() => publishPersistenceEvent(user, "goal.changed"));
    unsubscribe();
  });

  it("is a silent no-op when the user has no open connections", () => {
    assert.doesNotThrow(() => publishPersistenceEvent(userId(), "notification.changed"));
  });

  it("never puts financial details on the wire", () => {
    const user = userId();
    const received: RealtimeEvent[] = [];
    const unsubscribe = subscribe(user, (event) => received.push(event));

    publishPersistenceEvent(user, "transaction.changed");

    const wire = encodeSseEvent(received[0]!);
    const dataLine = wire.split("\n").find((line) => line.startsWith("data: "))!;
    const payload = JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;

    assert.deepEqual(Object.keys(payload).sort(), ["publishedAt", "type"]);
    assert.equal(payload["type"], "transaction.changed");
    unsubscribe();
  });
});
