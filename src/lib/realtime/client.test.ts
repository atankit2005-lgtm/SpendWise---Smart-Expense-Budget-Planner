import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  REALTIME_ENDPOINT,
  RECONNECT_DELAYS_MS,
  RECONNECT_MAX_DELAY_MS,
  SUPPORTED_REALTIME_EVENTS,
  createRealtimeSync,
  isValidRealtimeFrame,
  type EventSourceLike,
  type TimerToken,
} from "./client";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  private listeners = new Map<string, Array<(event: { data?: string | undefined }) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string | undefined }) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

interface ScheduledTimer {
  id: number;
  callback: () => void;
  delayMs: number;
}

function createFakeTimers() {
  let nextId = 1;
  const pending: ScheduledTimer[] = [];
  return {
    pending,
    setTimer(callback: () => void, delayMs: number): TimerToken {
      const timer: ScheduledTimer = { id: nextId++, callback, delayMs };
      pending.push(timer);
      return timer.id as unknown as TimerToken;
    },
    clearTimer(token: TimerToken): void {
      const index = pending.findIndex((timer) => timer.id === (token as unknown as number));
      if (index !== -1) pending.splice(index, 1);
    },
    runNextTimer(): void {
      const timer = pending.shift();
      assert.ok(timer, "expected a scheduled timer");
      timer.callback();
    },
  };
}

function frame(type: string): string {
  return JSON.stringify({ type, publishedAt: new Date().toISOString() });
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(onInvalidation: () => unknown = async () => {}) {
  const timers = createFakeTimers();
  let invalidations = 0;
  const sync = createRealtimeSync({
    createEventSource: (url) => new FakeEventSource(url),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onInvalidation: () => {
      invalidations += 1;
      return onInvalidation();
    },
  });
  const socket = () => {
    const latest = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    assert.ok(latest, "expected an EventSource to have been created");
    return latest;
  };
  return { sync, timers, socket, invalidations: () => invalidations };
}

beforeEach(() => {
  FakeEventSource.instances.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("realtime client synchronization (Stage 6.3)", () => {
  it("opens exactly one EventSource against /api/realtime with no identifiers in the URL", () => {
    const { sync } = setup();

    assert.equal(FakeEventSource.instances.length, 1);
    assert.equal(FakeEventSource.instances[0]!.url, REALTIME_ENDPOINT);
    assert.ok(!REALTIME_ENDPOINT.includes("?"), "no query params — session cookie auth only");
    sync.close();
  });

  it("triggers exactly one snapshot sync per supported event type", async () => {
    for (const type of SUPPORTED_REALTIME_EVENTS) {
      FakeEventSource.instances.length = 0;
      const { sync, socket, invalidations } = setup();

      socket().emit(type, frame(type));
      await flushMicrotasks();

      assert.equal(invalidations(), 1, `expected one sync for ${type}`);
      sync.close();
    }
  });

  it("ignores unknown event types", async () => {
    const { sync, socket, invalidations } = setup();

    socket().emit("user.changed", frame("user.changed"));
    socket().emit("random.event", frame("random.event"));
    await flushMicrotasks();

    assert.equal(invalidations(), 0);
    sync.close();
  });

  it("ignores malformed, empty, and mismatched frames", async () => {
    const { sync, socket, invalidations } = setup();

    const malformed: Array<string | undefined> = [
      undefined,
      "",
      "not-json",
      "null",
      "{}",
      frame("budget.changed"), // valid JSON but wrong type for this listener
      JSON.stringify({ type: 42 }),
    ];
    for (const data of malformed) {
      socket().emit("transaction.changed", data);
    }
    await flushMicrotasks();

    assert.equal(invalidations(), 0);
    assert.equal(isValidRealtimeFrame(frame("transaction.changed"), "transaction.changed"), true);
    sync.close();
  });

  it("does not sync for heartbeats, unnamed frames, or connection open", async () => {
    const { sync, socket, invalidations } = setup();

    socket().emit("message", "{}"); // unnamed data frame (server sends comments, which never fire)
    socket().emit("message", undefined);
    socket().emit("open");
    await flushMicrotasks();

    assert.equal(invalidations(), 0);
    sync.close();
  });

  it("coalesces a burst of events into one in-flight sync plus one trailing sync", async () => {
    const gate = deferred();
    const { sync, socket, invalidations } = setup(() => gate.promise);

    socket().emit("transaction.changed", frame("transaction.changed"));
    socket().emit("budget.changed", frame("budget.changed"));
    socket().emit("goal.changed", frame("goal.changed"));
    await flushMicrotasks();

    assert.equal(invalidations(), 1, "only one sync may be in flight");

    gate.resolve();
    await flushMicrotasks();
    await flushMicrotasks();

    assert.equal(invalidations(), 2, "events during flight must cause exactly one trailing sync");
    sync.close();
  });

  it("keeps working after a failed sync", async () => {
    let attempt = 0;
    const { sync, socket, invalidations } = setup(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient refetch failure");
    });

    socket().emit("transaction.changed", frame("transaction.changed"));
    await flushMicrotasks();
    socket().emit("transaction.changed", frame("transaction.changed"));
    await flushMicrotasks();

    assert.equal(invalidations(), 2);
    sync.close();
  });

  it("reconnects with bounded backoff after a connection error", () => {
    const { sync, timers, socket } = setup();

    const expectedDelays = [...RECONNECT_DELAYS_MS, RECONNECT_MAX_DELAY_MS, RECONNECT_MAX_DELAY_MS];
    for (const delayMs of expectedDelays) {
      const before = FakeEventSource.instances.length;
      socket().emit("error");

      assert.equal(socket().closed, true, "errored socket must be closed");
      assert.equal(timers.pending.length, 1, "exactly one reconnect timer");
      assert.equal(timers.pending[0]!.delayMs, delayMs);

      timers.runNextTimer();
      assert.equal(FakeEventSource.instances.length, before + 1, "reconnect must open a new socket");
    }
    sync.close();
  });

  it("resets the backoff after a successful open", () => {
    const { sync, timers, socket } = setup();

    socket().emit("error");
    timers.runNextTimer(); // attempt 2 scheduled at 1000ms, now connected
    socket().emit("open");
    socket().emit("error");

    assert.equal(timers.pending.length, 1);
    assert.equal(timers.pending[0]!.delayMs, RECONNECT_DELAYS_MS[0]);
    sync.close();
  });

  it("never stacks multiple reconnect timers", () => {
    const { sync, timers, socket } = setup();

    socket().emit("error");
    socket().emit("error");
    socket().emit("error");

    assert.equal(timers.pending.length, 1);
    sync.close();
  });

  it("closes the socket and cancels pending reconnects on close()", () => {
    const { sync, timers, socket } = setup();

    socket().emit("error");
    assert.equal(timers.pending.length, 1);

    sync.close();

    assert.equal(socket().closed, true);
    assert.equal(timers.pending.length, 0, "close() must cancel the reconnect timer");
  });

  it("ignores events and errors arriving after close()", async () => {
    const { sync, socket, invalidations } = setup();

    sync.close();
    socket().emit("transaction.changed", frame("transaction.changed"));
    socket().emit("error");
    await flushMicrotasks();

    assert.equal(invalidations(), 0);
    assert.equal(FakeEventSource.instances.length, 1, "no reconnect after close");
  });

  it("treats repeated close() calls as safe", () => {
    const { sync } = setup();
    sync.close();
    assert.doesNotThrow(() => sync.close());
  });

  it("restores normal event handling after a successful reconnect", async () => {
    const { sync, timers, socket, invalidations } = setup();

    socket().emit("error");
    timers.runNextTimer();
    const reconnected = socket();
    assert.equal(FakeEventSource.instances.length, 2, "reconnect must open exactly one new socket");
    assert.equal(reconnected.closed, false);

    reconnected.emit("transaction.changed", frame("transaction.changed"));
    await flushMicrotasks();

    assert.equal(invalidations(), 1, "reconnected socket must deliver events normally");
    sync.close();
  });

  it("syncs once per event when no fetch is active (no over-coalescing)", async () => {
    const { sync, socket, invalidations } = setup();

    for (const type of ["transaction.changed", "budget.changed", "goal.changed"] as const) {
      socket().emit(type, frame(type));
      await flushMicrotasks();
    }

    assert.equal(invalidations(), 3, "sequential idle events must each synchronize");
    sync.close();
  });

  it("still performs the trailing sync when the in-flight fetch fails", async () => {
    let attempt = 0;
    const gate = deferred();
    const { sync, socket, invalidations } = setup(() => {
      attempt += 1;
      return attempt === 1 ? gate.promise.then(() => Promise.reject(new Error("refetch failed"))) : Promise.resolve();
    });

    socket().emit("transaction.changed", frame("transaction.changed"));
    socket().emit("notification.changed", frame("notification.changed"));
    await flushMicrotasks();
    assert.equal(invalidations(), 1);

    gate.resolve(); // first fetch settles as a failure
    await flushMicrotasks();
    await flushMicrotasks();

    assert.equal(invalidations(), 2, "the queued trailing sync must recover after the failure");
    sync.close();
  });

  it("ignores structurally valid but non-event payloads", async () => {
    const { sync, socket, invalidations } = setup();

    socket().emit("transaction.changed", "[]");
    socket().emit("transaction.changed", '"transaction.changed"');
    socket().emit("transaction.changed", "123");
    await flushMicrotasks();
    assert.equal(invalidations(), 0);

    // A well-formed event with extra (ignored) fields is still accepted —
    // only `type` is validated; nothing else on the wire is ever trusted.
    socket().emit(
      "transaction.changed",
      JSON.stringify({ type: "transaction.changed", publishedAt: new Date().toISOString(), futureField: 1 }),
    );
    await flushMicrotasks();
    assert.equal(invalidations(), 1);
    sync.close();
  });

  it("stays silent under a flood of unknown/duplicate irrelevant events", async () => {
    const { sync, socket, invalidations } = setup();

    for (let i = 0; i < 50; i += 1) {
      socket().emit("user.changed", frame("user.changed"));
      socket().emit("message", undefined);
      socket().emit("transaction.changed", "garbage");
    }
    await flushMicrotasks();

    assert.equal(invalidations(), 0);
    sync.close();
  });
});
