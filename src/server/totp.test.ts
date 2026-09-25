import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Secret, TOTP } from "otpauth";

import { ConfigurationError } from "./env";
import { decryptTotpSecret, encryptTotpSecret, TotpSecretEncryptionError } from "./totp-crypto";
import { createTotp, createTotpUri, generateTotpSecret, validateTotpCode } from "./totp";
import {
  digestMfaValue,
  digestRecoveryCode,
  generateLoginChallenge,
  MFA_LOGIN_CHALLENGE_TTL_MS,
} from "./mfa-digests";

describe("TOTP utility", () => {
  it("matches the RFC 6238 SHA-1 known vector", () => {
    const token = new TOTP({
      secret: Secret.fromUTF8("12345678901234567890"),
      algorithm: "SHA1",
      digits: 8,
      period: 30,
    }).generate({ timestamp: 59_000 });

    assert.equal(token, "94287082");
  });

  it("generates base32 secrets and validates six-digit codes at a fixed time", () => {
    const secret = generateTotpSecret();
    const now = new Date("2026-09-25T12:00:00.000Z");
    const token = createTotp(secret, "SpendWise", "person@example.com").generate({
      timestamp: now.getTime(),
    });

    assert.match(secret, /^[A-Z2-7]+$/);
    assert.equal(validateTotpCode(secret, token, now), Math.floor(now.getTime() / 30_000));
    assert.equal(validateTotpCode(secret, "bad", now), null);
    assert.equal(validateTotpCode(secret, "000000", new Date(Number.NaN)), null);
    assert.match(createTotpUri(secret, "SpendWise", "person@example.com"), /^otpauth:\/\/totp\//);
  });
});

describe("TOTP secret encryption", () => {
  const key = Buffer.alloc(32, 0x31);
  const otherKey = Buffer.alloc(32, 0x32);
  const configuration = { key, keyId: "key-2026" };
  const resolver = (providedKey: Uint8Array) => (keyId: string) => {
    assert.equal(keyId, "key-2026");
    return providedKey;
  };

  it("round-trips AES-256-GCM envelopes and uses a fresh nonce", () => {
    const one = encryptTotpSecret("JBSWY3DPEHPK3PXP", configuration);
    const two = encryptTotpSecret("JBSWY3DPEHPK3PXP", configuration);

    assert.equal(one.keyId, "key-2026");
    assert.match(one.ciphertext, /^sw-totp:v1:key-2026:/);
    assert.notEqual(one.ciphertext, two.ciphertext);
    assert.notEqual(one.ciphertext.split(":")[3], two.ciphertext.split(":")[3]);
    assert.equal(decryptTotpSecret(one.ciphertext, resolver(key)), "JBSWY3DPEHPK3PXP");
  });

  it("rejects tampering, a wrong key, and malformed envelopes", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", configuration).ciphertext;
    const parts = encrypted.split(":");
    const tag = parts[4] ?? "";
    parts[4] = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;

    assert.throws(
      () => decryptTotpSecret(parts.join(":"), resolver(key)),
      TotpSecretEncryptionError,
    );
    assert.throws(
      () => decryptTotpSecret(encrypted, resolver(otherKey)),
      TotpSecretEncryptionError,
    );
    for (const malformed of [
      "",
      "not-an-envelope",
      encrypted.replace("v1", "v2"),
      encrypted.replace("key-2026", "../key"),
    ]) {
      assert.throws(() => decryptTotpSecret(malformed, resolver(key)));
    }
  });

  it("fails closed when encryption configuration is missing", () => {
    const originalKey = process.env["TOTP_ENCRYPTION_KEY"];
    const originalKeyId = process.env["TOTP_ENCRYPTION_KEY_ID"];
    delete process.env["TOTP_ENCRYPTION_KEY"];
    delete process.env["TOTP_ENCRYPTION_KEY_ID"];
    try {
      assert.throws(() => encryptTotpSecret("secret"), ConfigurationError);
    } finally {
      if (originalKey === undefined) delete process.env["TOTP_ENCRYPTION_KEY"];
      else process.env["TOTP_ENCRYPTION_KEY"] = originalKey;
      if (originalKeyId === undefined) delete process.env["TOTP_ENCRYPTION_KEY_ID"];
      else process.env["TOTP_ENCRYPTION_KEY_ID"] = originalKeyId;
    }
  });
});

describe("MFA digests", () => {
  it("stores SHA-256 digests instead of challenge and recovery tokens", () => {
    const now = new Date("2026-09-25T12:00:00.000Z");
    const challenge = generateLoginChallenge(now);
    const recoveryCode = "ABCD-EFGH-IJKL";

    assert.match(challenge.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(challenge.digest, digestMfaValue(challenge.token));
    assert.notEqual(challenge.digest, challenge.token);
    assert.equal(challenge.expiresAt.getTime(), now.getTime() + MFA_LOGIN_CHALLENGE_TTL_MS);
    assert.notEqual(digestRecoveryCode(recoveryCode), recoveryCode);
    assert.match(digestRecoveryCode(recoveryCode), /^[a-f0-9]{64}$/);
    assert.throws(() => digestRecoveryCode("short"), TypeError);
  });
});
