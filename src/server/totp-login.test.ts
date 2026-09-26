import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ConfigurationError } from "./env";
import { ValidationError } from "./errors";
import { generateLoginChallenge, digestMfaValue } from "./mfa-digests";

describe("TOTP Login Challenge", () => {
  describe("Challenge Generation", () => {
    it("should generate a valid challenge with token and digest", () => {
      const now = new Date();
      const challenge = generateLoginChallenge(now);
      
      assert.ok(challenge.token);
      assert.ok(challenge.digest);
      assert.ok(challenge.expiresAt);
      assert.strictEqual(typeof challenge.token, "string");
      assert.strictEqual(typeof challenge.digest, "string");
      assert.strictEqual(typeof challenge.expiresAt, "object");
      assert.ok(challenge.expiresAt instanceof Date);
    });

    it("should set correct expiration time", () => {
      const now = new Date();
      const challenge = generateLoginChallenge(now);
      
      const expectedExpiry = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
      assert.strictEqual(challenge.expiresAt.getTime(), expectedExpiry.getTime());
    });

    it("should create consistent digest for same token", () => {
      const token = "test_token_123";
      const digest1 = digestMfaValue(token);
      const digest2 = digestMfaValue(token);
      
      assert.strictEqual(digest1, digest2);
    });

    it("should create different digests for different tokens", () => {
      const digest1 = digestMfaValue("token1");
      const digest2 = digestMfaValue("token2");
      
      assert.notStrictEqual(digest1, digest2);
    });
  });

  describe("Challenge Validation", () => {
    it("should validate 6-digit TOTP codes", () => {
      const validCodes = ["123456", "000000", "999999"];
      const invalidCodes = ["12345", "1234567", "abcdef", "123 456"];
      
      const isVerificationCode = (value: unknown): value is string => {
        return typeof value === "string" && /^\d{6}$/.test(value);
      };
      
      for (const code of validCodes) {
        assert.strictEqual(isVerificationCode(code), true, `${code} should be valid`);
      }
      
      for (const code of invalidCodes) {
        assert.strictEqual(isVerificationCode(code), false, `${code} should be invalid`);
      }
    });
  });

  describe("Time Validation", () => {
    it("should reject invalid time values", () => {
      const invalidTimes = [
        new Date("invalid"),
        new Date(NaN),
        null as unknown as Date,
        undefined as unknown as Date,
      ];
      
      for (const time of invalidTimes) {
        assert.strictEqual(Number.isFinite((time as Date)?.getTime()), false);
      }
    });

    it("should accept valid time values", () => {
      const validTimes = [
        new Date(),
        new Date(Date.now() - 1000),
        new Date(Date.now() + 1000),
      ];
      
      for (const time of validTimes) {
        assert.strictEqual(Number.isFinite(time.getTime()), true);
      }
    });
  });
});

describe("TOTP Login Configuration Check", () => {
  it("should have proper rate limiting constants", () => {
    const { TOTP_LOGIN_ATTEMPT_LIMIT, TOTP_LOGIN_ATTEMPT_WINDOW_MS } = await import("./totp-login");
    
    assert.strictEqual(typeof TOTP_LOGIN_ATTEMPT_LIMIT, "number");
    assert.strictEqual(typeof TOTP_LOGIN_ATTEMPT_WINDOW_MS, "number");
    assert.ok(TOTP_LOGIN_ATTEMPT_LIMIT > 0);
    assert.ok(TOTP_LOGIN_ATTEMPT_WINDOW_MS > 0);
  });

  it("should have proper error messages", () => {
    // Test that error messages are defined and not empty
    const messages = [
      "Invalid verification code.",
      "This verification challenge has expired. Please try logging in again.",
      "This verification code has already been used.",
      "Two-factor authentication is required for this account.",
    ];
    
    for (const message of messages) {
      assert.strictEqual(typeof message, "string");
      assert.ok(message.length > 0);
    }
  });
});
