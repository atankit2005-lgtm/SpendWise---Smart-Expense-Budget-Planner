import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hashPassword, needsRehash, verifyPassword } from "./password";

/**
 * A hash produced by the pre-Stage-8.3 implementation (Node scrypt defaults:
 * N=16384, r=8, p=1, keylen 64) for the password "legacy-password-123" with
 * salt 0123456789abcdef0123456789abcdef. Legacy-format hashes must keep
 * verifying forever so existing users are never invalidated.
 */
const LEGACY_HASH =
  "scrypt$0123456789abcdef0123456789abcdef$58e5e1438af702942418671957e1b7910c3faa322eaed128fc053361d863dc79ac00c8f5825cd6672517e27eb8fac24a4e1d9fb430be61a91f1b5f8e33a042d1";

describe("password hashing", () => {
  it("stores a salted hash with explicit cost parameters and validates only the original password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    // New self-describing format: scrypt$N$r$p$saltHex$hashHex
    assert.match(hash, /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(await verifyPassword("correct horse battery staple", hash), true);
    assert.equal(await verifyPassword("incorrect password", hash), false);
  });

  it("never stores the plaintext password and salts every hash uniquely", async () => {
    const password = "correct horse battery staple";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    assert.ok(!first.includes(password));
    assert.notEqual(first, second, "random salt must make hashes unique");
    assert.equal(await verifyPassword(password, second), true);
  });

  it("keeps verifying legacy (Node-default parameter) hashes", async () => {
    assert.equal(await verifyPassword("legacy-password-123", LEGACY_HASH), true);
    assert.equal(await verifyPassword("wrong-password-456", LEGACY_HASH), false);
  });

  it("flags legacy hashes for rehash but not current-format hashes", async () => {
    assert.equal(needsRehash(LEGACY_HASH), true);
    assert.equal(needsRehash(null), true);
    assert.equal(needsRehash("garbage"), true);

    const current = await hashPassword("rehash-me-not");
    assert.equal(needsRehash(current), false);
  });

  it("rejects malformed or tampered encodings without throwing", async () => {
    assert.equal(await verifyPassword("x", null), false);
    assert.equal(await verifyPassword("x", ""), false);
    assert.equal(await verifyPassword("x", "bcrypt$abc$def"), false);
    assert.equal(await verifyPassword("x", "scrypt$onlytwoparts"), false);
    assert.equal(await verifyPassword("x", "scrypt$32768$8$1$salt$shorthash"), false);
    // Out-of-bounds cost parameters (tampered hash string) are refused
    // instead of being handed to scrypt.
    assert.equal(
      await verifyPassword("x", `scrypt$99999999$8$1$${"0".repeat(32)}$${"0".repeat(128)}`),
      false,
    );
    assert.equal(
      await verifyPassword("x", `scrypt$abc$8$1$${"0".repeat(32)}$${"0".repeat(128)}`),
      false,
    );
  });
});
