import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import type { RealtimeEvent } from "./events";
import { publishRealtimeEvent, subscribe, subscriberCountFor, subscribedUserCount } from "./registry";

/** Every test uses fresh, random user ids so tests never interfere with each other's state. */
function userId(): string {
  return randomUUID();
}

describe("realtime subscription registry", () => {
  it("registers a subscriber and delivers published events to it", () => {
    const user = userId();
    const received: RealtimeEvent[] = [];
    const unsubscribe = subscribe(user, (event) => received.push(event));

    publishRealtimeEvent(user, { type: "transaction.changed" });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.type, "transaction.changed");
    unsubscribe();
  });

  it("removes a subscriber on unsubscribe so it no longer receives events", () => {
    const user = userId();
    const received: RealtimeEvent[] = [];
    const unsubscribe = subscribe(user, (event) => received.push(event));

    unsubscribe();
    publishRealtimeEvent(user, { type: "budget.changed" });

    assert.equal(received.length, 0);
    assert.equal(subscriberCountFor(user), 0);
  });

  it("only delivers events to the user they were published for (no cross-user leakage)", () => {
    const userA = userId();
    const userB = userId();
    const receivedA: RealtimeEvent[] = [];
    const receivedB: RealtimeEvent[] = [];

    const unsubA = subscribe(userA, (event) => receivedA.push(event));
    const unsubB = subscribe(userB, (event) => receivedB.push(event));

    publishRealtimeEvent(userA, { type: "goal.changed" });

    assert.equal(receivedA.length, 1);
    assert.equal(receivedB.length, 0);

    unsubA();
    unsubB();
  });

  it("delivers to every subscriber registered for the same user", () => {
    const user = userId();
    const receivedFirst: RealtimeEvent[] = [];
    const receivedSecond: RealtimeEvent[] = [];

    const unsubFirst = subscribe(user, (event) => receivedFirst.push(event));
    const unsubSecond = subscribe(user, (event) => receivedSecond.push(event));

    publishRealtimeEvent(user, { type: "notification.changed" });

    assert.equal(receivedFirst.length, 1);
    assert.equal(receivedSecond.length, 1);
    assert.equal(subscriberCountFor(user), 2);

    unsubFirst();
    unsubSecond();
  });

  it("is a no-op, and does not throw, when publishing to a user with no subscribers", () => {
    const user = userId();
    assert.doesNotThrow(() => publishRealtimeEvent(user, { type: "finance.snapshot.invalidated" }));
  });

  it("cleans up the per-user entry once its last subscriber disconnects", () => {
    const user = userId();
    const before = subscribedUserCount();
    const unsubscribe = subscribe(user, () => {});

    assert.equal(subscribedUserCount(), before + 1);

    unsubscribe();

    assert.equal(subscribedUserCount(), before);
    assert.equal(subscriberCountFor(user), 0);
  });

  it("treats repeated unsubscribe calls as safe (idempotent)", () => {
    const user = userId();
    const unsubscribe = subscribe(user, () => {});

    unsubscribe();
    assert.doesNotThrow(() => unsubscribe());
    assert.equal(subscriberCountFor(user), 0);
  });

  it("assigns increasing ids and an ISO timestamp to published events", () => {
    const user = userId();
    const received: RealtimeEvent[] = [];
    const unsubscribe = subscribe(user, (event) => received.push(event));

    publishRealtimeEvent(user, { type: "transaction.changed" });
    publishRealtimeEvent(user, { type: "transaction.changed" });

    assert.ok(received[1]!.id > received[0]!.id);
    assert.doesNotThrow(() => new Date(received[0]!.publishedAt).toISOString());

    unsubscribe();
  });

  it("still delivers to later subscribers when an earlier subscriber throws", () => {
    const user = userId();
    const receivedAfter: RealtimeEvent[] = [];
    const unsubBad = subscribe(user, () => {
      throw new Error("subscriber blew up mid-delivery");
    });
    const unsubGood = subscribe(user, (event) => receivedAfter.push(event));

    assert.doesNotThrow(() => publishRealtimeEvent(user, { type: "transaction.changed" }));
    assert.equal(receivedAfter.length, 1, "the healthy subscriber must still receive the event");

    unsubBad();
    unsubGood();
  });

  it("never propagates subscriber errors to the publisher", () => {
    const user = userId();
    const unsubFirst = subscribe(user, () => {
      throw new Error("first subscriber fails");
    });
    const unsubSecond = subscribe(user, () => {
      throw new Error("second subscriber fails too");
    });

    assert.doesNotThrow(() => publishRealtimeEvent(user, { type: "budget.changed" }));

    unsubFirst();
    unsubSecond();
  });
});
