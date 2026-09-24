import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  consumeRateLimit,
  listRateLimitKeys,
  RATE_LIMIT_MAX_BUCKETS,
  rateLimitBucketCount,
  resetRateLimitState,
} from "./rate-limit";

const WINDOW_MS = 15 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 24, 12, 0, 0);

beforeEach(() => {
  resetRateLimitState();
});

describe("in-process rate limiter (Stage 8.3)", () => {
  it("allows attempts up to the limit, then denies with a retry-after", () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const decision = consumeRateLimit("login:email:a@b.c", 5, WINDOW_MS, T0 + attempt);
      assert.equal(decision.allowed, true, `attempt ${attempt} should be allowed`);
      assert.equal(decision.retryAfterSeconds, 0);
    }

    const denied = consumeRateLimit("login:email:a@b.c", 5, WINDOW_MS, T0 + 6);
    assert.equal(denied.allowed, false);
    assert.ok(denied.retryAfterSeconds > 0);
    assert.ok(denied.retryAfterSeconds <= Math.ceil(WINDOW_MS / 1000));
  });

  it("keeps denying for the rest of the window, then resets on expiry", () => {
    for (let i = 0; i < 3; i++) consumeRateLimit("k", 3, WINDOW_MS, T0);
    assert.equal(consumeRateLimit("k", 3, WINDOW_MS, T0 + 1000).allowed, false);
    assert.equal(consumeRateLimit("k", 3, WINDOW_MS, T0 + WINDOW_MS - 1).allowed, false);

    const afterWindow = consumeRateLimit("k", 3, WINDOW_MS, T0 + WINDOW_MS);
    assert.equal(afterWindow.allowed, true, "state must expire with the window");
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 2; i++) consumeRateLimit("user-a", 2, WINDOW_MS, T0);
    assert.equal(consumeRateLimit("user-a", 2, WINDOW_MS, T0).allowed, false);
    assert.equal(consumeRateLimit("user-b", 2, WINDOW_MS, T0).allowed, true);
  });

  it("prunes expired buckets so memory does not grow forever", () => {
    for (let i = 0; i < 100; i++) consumeRateLimit(`key-${i}`, 5, WINDOW_MS, T0);
    assert.equal(rateLimitBucketCount(), 100);

    // One consume far in the future sweeps every expired bucket.
    consumeRateLimit("fresh", 5, WINDOW_MS, T0 + WINDOW_MS + 1);
    assert.equal(rateLimitBucketCount(), 1);
    assert.deepEqual(listRateLimitKeys(), ["fresh"]);
  });

  it("enforces a hard cap on live buckets even inside one window", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_BUCKETS + 500; i++) {
      consumeRateLimit(`flood-${i}`, 5, WINDOW_MS, T0 + i);
    }
    assert.ok(
      rateLimitBucketCount() <= RATE_LIMIT_MAX_BUCKETS,
      `bucket count ${rateLimitBucketCount()} must stay at or below ${RATE_LIMIT_MAX_BUCKETS}`,
    );
  });
});
