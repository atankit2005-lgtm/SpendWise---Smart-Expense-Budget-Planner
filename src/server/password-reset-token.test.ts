import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  isValidPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "./password-reset-token";

describe("password reset token utility", () => {
  it("generates independent 256-bit base64url tokens", () => {
    const first = generatePasswordResetToken();
    const second = generatePasswordResetToken();

    assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(isValidPasswordResetToken(first.token), true);
    assert.notEqual(first.token, second.token);
    assert.equal(Buffer.from(first.token, "base64url").byteLength, 32);
  });

  it("rejects malformed and non-canonical token encodings", () => {
    assert.equal(isValidPasswordResetToken(""), false);
    assert.equal(isValidPasswordResetToken("not-a-reset-token"), false);
    assert.equal(isValidPasswordResetToken(`${"A".repeat(42)}B`), false);
    assert.equal(isValidPasswordResetToken(null), false);
  });

  it("hashes deterministically and produces distinct digests for distinct tokens", () => {
    const first = generatePasswordResetToken();
    const second = generatePasswordResetToken();

    assert.equal(hashPasswordResetToken(first.token), first.tokenHash);
    assert.notEqual(first.tokenHash, second.tokenHash);
    assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  });

  it("sets the configured short expiry without persisting the raw token as its digest", () => {
    const now = new Date("2026-09-25T12:00:00.000Z");
    const generated = generatePasswordResetToken(now);

    assert.equal(generated.expiresAt.getTime(), now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
    assert.equal(PASSWORD_RESET_TOKEN_TTL_MS, 30 * 60 * 1000);
    assert.notEqual(generated.token, generated.tokenHash);
  });
});
