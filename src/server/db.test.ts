import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getDb, isDatabaseConfigured } from "./db";
import { ConfigurationError } from "./env";

const ORIGINAL_DATABASE_URL = process.env["DATABASE_URL"];

function restoreDatabaseUrl(): void {
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = ORIGINAL_DATABASE_URL;
}

describe("database configuration", () => {
  afterEach(restoreDatabaseUrl);

  it("does not require DATABASE_URL at import time", () => {
    assert.equal(typeof isDatabaseConfigured(), "boolean");
  });

  it("reports unconfigured and refuses to build a client when DATABASE_URL is missing (no localhost fallback)", () => {
    delete process.env["DATABASE_URL"];
    assert.equal(isDatabaseConfigured(), false);
    assert.throws(() => getDb(), ConfigurationError);
  });

  it("rejects a non-PostgreSQL DATABASE_URL before any connection attempt", () => {
    process.env["DATABASE_URL"] = "mysql://user:pw@localhost:3306/app";
    assert.throws(() => getDb(), ConfigurationError);
  });
});
