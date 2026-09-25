import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFinanceSnapshotRequestGuard } from "./finance-request-guard";

describe("finance snapshot request lifecycle", () => {
  it("invalidates an in-flight realtime refresh when the session ends", () => {
    const guard = createFinanceSnapshotRequestGuard();
    const refresh = guard.begin();

    guard.invalidate();

    assert.equal(guard.isCurrent(refresh), false);
  });

  it("invalidates an initial request when its route effect is cleaned up", () => {
    const guard = createFinanceSnapshotRequestGuard();
    const initial = guard.begin();

    guard.invalidate();

    assert.equal(guard.isCurrent(initial), false);
  });

  it("keeps the latest successful request current", () => {
    const guard = createFinanceSnapshotRequestGuard();
    const first = guard.begin();
    const latest = guard.begin();

    assert.equal(guard.isCurrent(first), false);
    assert.equal(guard.isCurrent(latest), true);
  });
});
