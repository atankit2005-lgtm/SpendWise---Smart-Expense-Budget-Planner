import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { onSessionEnded, sessionEndedListenerCount, signalSessionEnded } from "./session-signal";

describe("session-ended signal (Stage 6.4)", () => {
  it("notifies every listener exactly once per signal", () => {
    let callsA = 0;
    let callsB = 0;
    const unsubA = onSessionEnded(() => {
      callsA += 1;
    });
    const unsubB = onSessionEnded(() => {
      callsB += 1;
    });

    signalSessionEnded();

    assert.equal(callsA, 1);
    assert.equal(callsB, 1);

    unsubA();
    unsubB();
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = onSessionEnded(() => {
      calls += 1;
    });

    unsubscribe();
    signalSessionEnded();

    assert.equal(calls, 0);
    assert.equal(sessionEndedListenerCount(), 0);
  });

  it("isolates listener errors so logout cleanup always completes", () => {
    const unsubscribeBad = onSessionEnded(() => {
      throw new Error("listener failed");
    });
    let goodCalled = false;
    const unsubscribeGood = onSessionEnded(() => {
      goodCalled = true;
    });

    assert.doesNotThrow(() => signalSessionEnded());
    assert.equal(goodCalled, true);

    unsubscribeBad();
    unsubscribeGood();
  });

  it("is a safe no-op with no listeners", () => {
    assert.doesNotThrow(() => signalSessionEnded());
  });
});
