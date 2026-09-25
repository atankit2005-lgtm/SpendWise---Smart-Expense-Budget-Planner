import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  ConfigurationError,
  getDatabaseUrl,
  isProduction,
  requireDatabaseUrl,
  requireTotpEncryptionConfiguration,
} from "./env";

const ORIGINAL_NODE_ENV = process.env["NODE_ENV"];
const ORIGINAL_DATABASE_URL = process.env["DATABASE_URL"];
const ORIGINAL_TOTP_ENCRYPTION_KEY = process.env["TOTP_ENCRYPTION_KEY"];
const ORIGINAL_TOTP_ENCRYPTION_KEY_ID = process.env["TOTP_ENCRYPTION_KEY_ID"];

function withEnv(nodeEnv: string | undefined, databaseUrl: string | undefined): void {
  if (nodeEnv === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = nodeEnv;
  if (databaseUrl === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = databaseUrl;
  if (ORIGINAL_TOTP_ENCRYPTION_KEY === undefined) delete process.env["TOTP_ENCRYPTION_KEY"];
  else process.env["TOTP_ENCRYPTION_KEY"] = ORIGINAL_TOTP_ENCRYPTION_KEY;
  if (ORIGINAL_TOTP_ENCRYPTION_KEY_ID === undefined) delete process.env["TOTP_ENCRYPTION_KEY_ID"];
  else process.env["TOTP_ENCRYPTION_KEY_ID"] = ORIGINAL_TOTP_ENCRYPTION_KEY_ID;
}

describe("environment configuration", () => {
  beforeEach(() => {
    withEnv("test", undefined);
  });

  afterEach(() => {
    withEnv(ORIGINAL_NODE_ENV, ORIGINAL_DATABASE_URL);
  });

  it("detects production from NODE_ENV", () => {
    withEnv("production", undefined);
    assert.equal(isProduction(), true);
    withEnv("development", undefined);
    assert.equal(isProduction(), false);
    withEnv(undefined, undefined);
    assert.equal(isProduction(), false);
  });

  it("returns undefined (never throws) when DATABASE_URL is absent outside production", () => {
    withEnv("development", undefined);
    assert.equal(getDatabaseUrl(), undefined);
    withEnv("test", "   ");
    assert.equal(getDatabaseUrl(), undefined);
  });

  it("trims a configured DATABASE_URL", () => {
    withEnv("development", "  postgres://user@localhost:5432/app  ");
    assert.equal(getDatabaseUrl(), "postgres://user@localhost:5432/app");
  });

  it("accepts valid postgres:// and postgresql:// URLs", () => {
    withEnv("test", "postgres://user@localhost:5432/app");
    assert.equal(requireDatabaseUrl(), "postgres://user@localhost:5432/app");
    withEnv("test", "postgresql://user@localhost:5432/app");
    assert.equal(requireDatabaseUrl(), "postgresql://user@localhost:5432/app");
  });

  it("rejects production startup configuration when DATABASE_URL is missing", () => {
    withEnv("production", undefined);
    assert.throws(
      () => requireDatabaseUrl(),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /DATABASE_URL is not set/);
        assert.match(error.message, /production/);
        return true;
      },
    );
  });

  it("rejects production when DATABASE_URL is blank", () => {
    withEnv("production", "   ");
    assert.throws(() => requireDatabaseUrl(), ConfigurationError);
  });

  it("gives developers a .env.example-based hint outside production", () => {
    withEnv("development", undefined);
    assert.throws(
      () => requireDatabaseUrl(),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /\.env\.example/);
        return true;
      },
    );
  });

  it("rejects a non-PostgreSQL DATABASE_URL scheme", () => {
    withEnv("production", "mysql://user:hunter2@db.internal:3306/app");
    assert.throws(
      () => requireDatabaseUrl(),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.ok(!error.message.includes("hunter2"), "error must not leak credentials");
        assert.ok(!error.message.includes("mysql://user"), "error must not leak the URL");
        return true;
      },
    );
  });

  it("requires a canonical base64 AES-256 key without exposing its value", () => {
    const validKey = Buffer.alloc(32, 0xa5).toString("base64");
    process.env["TOTP_ENCRYPTION_KEY"] = validKey;
    process.env["TOTP_ENCRYPTION_KEY_ID"] = "key-2026";

    const first = requireTotpEncryptionConfiguration();
    const second = requireTotpEncryptionConfiguration();
    assert.equal(first.key.byteLength, 32);
    assert.equal(first.keyId, "key-2026");
    assert.notEqual(first.key, second.key);
    assert.deepEqual(first.key, second.key);

    for (const invalidKey of [undefined, "", "not-base64", Buffer.alloc(31).toString("base64")]) {
      if (invalidKey === undefined) delete process.env["TOTP_ENCRYPTION_KEY"];
      else process.env["TOTP_ENCRYPTION_KEY"] = invalidKey;
      assert.throws(
        () => requireTotpEncryptionConfiguration(),
        (error: unknown) => {
          assert.ok(error instanceof ConfigurationError);
          assert.ok(!error.message.includes(validKey));
          return true;
        },
      );
    }
  });

  it("rejects unsafe encryption key identifiers", () => {
    process.env["TOTP_ENCRYPTION_KEY"] = Buffer.alloc(32, 1).toString("base64");
    process.env["TOTP_ENCRYPTION_KEY_ID"] = "../key";
    assert.throws(() => requireTotpEncryptionConfiguration(), ConfigurationError);
  });
});
