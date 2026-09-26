/**
 * Extension 2.3 — real-PostgreSQL concurrency/replay verification.
 *
 * The unit-level coverage in totp-login.test.ts uses in-memory fakes for the
 * repository layer, which cannot demonstrate genuine row-lock atomicity —
 * only a real database enforces `SELECT ... FOR UPDATE`. This file runs the
 * same login-challenge flow against a real PostgreSQL instance and issues
 * truly concurrent requests (separate pooled connections) to prove:
 *
 *   (J) two simultaneous valid verifications against the same challenge
 *       cannot both authenticate — exactly one succeeds.
 *   (K) concurrent verification attempts cannot both accept the same TOTP
 *       step (advanceAcceptedTotpStep's replay watermark holds under load).
 *
 * Requires DATABASE_URL to point at a disposable PostgreSQL database with
 * this project's migrations applied (`npm run db:migrate`). Skips cleanly
 * (does not fail `npm test`) when DATABASE_URL is unset, since routine
 * `npm test` runs must not require a live database — see
 * authentication.security.test.ts and totp-mfa-repositories.test.ts, which
 * use fakes for exactly this reason.
 *
 * `./db` is mocked to a dedicated, explicitly-closeable connection pointed
 * at the same real DATABASE_URL (rather than the app's long-lived, never-
 * idle-timing-out singleton) purely so this short-lived test process can
 * shut its socket down and exit — every query below still round-trips
 * through the real PostgreSQL server, with real transactions and real row
 * locks.
 */

import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";

const hasDatabase = Boolean(process.env["DATABASE_URL"]?.trim());
process.env["TOTP_ENCRYPTION_KEY"] ??= Buffer.alloc(32, 0x77).toString("base64");

const sessions: string[] = [];
mock.module("./session", {
  namedExports: {
    createSession: async (userId: string) => {
      sessions.push(userId);
    },
    setSessionCookie: () => {},
  },
});

let closeTestDb: (() => Promise<void>) | undefined;

if (hasDatabase) {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const schema = await import("../../db/schema");

  const client = postgres(process.env["DATABASE_URL"]!, { max: 5 });
  const testDb = drizzle(client, { schema });
  closeTestDb = () => client.end({ timeout: 1 });

  mock.module("./db", {
    namedExports: { isDatabaseConfigured: () => true },
    defaultExport: testDb,
  });
}

describe("Extension 2.3 — real PostgreSQL concurrency", { skip: !hasDatabase }, async () => {
  if (!hasDatabase) return;

  const { createUser } = await import("./repositories/users");
  const { activateTotpMfa } = await import("./repositories/totp-mfa-configurations");
  const { encryptTotpSecret } = await import("./totp-crypto");
  const { createTotp, generateTotpSecret } = await import("./totp");
  const { createMfaLoginChallenge, verifyTotpLogin } = await import("./totp-login");
  const { default: db } = await import("./db");

  after(async () => {
    await closeTestDb?.();
  });

  const KEY = { key: Buffer.alloc(32, 0x77), keyId: "primary" };

  async function seedMfaUser(email: string): Promise<{ userId: string; code: string; now: Date }> {
    const user = await createUser({ email, name: "Concurrency Test User" }, db);
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, KEY);
    const now = new Date();
    const code = createTotp(secret, "SpendWise", "account").generate({ timestamp: now.getTime() });
    const currentStep = Math.floor(now.getTime() / 30_000);
    await activateTotpMfa(
      user.id,
      { secret: encrypted, acceptedStep: currentStep - 1, activatedAt: now },
      db,
    );
    return { userId: user.id, code, now };
  }

  it("(J) exactly one of two concurrent verifications against the same challenge succeeds", async () => {
    const { userId, code, now } = await seedMfaUser(`concurrency-j-${Date.now()}@example.com`);
    const challenge = await createMfaLoginChallenge(userId, now);

    const results = await Promise.allSettled([
      verifyTotpLogin({ challengeToken: challenge.token, code }, now),
      verifyTotpLogin({ challengeToken: challenge.token, code }, now),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent verification may succeed");
    assert.equal(rejected.length, 1, "the other must fail safely, not silently no-op");
    assert.equal(
      sessions.filter((id) => id === userId).length,
      1,
      "only one session may be created for this user from this race",
    );
  });

  it("(K) concurrent verification attempts cannot both accept the same TOTP step", async () => {
    const { userId, code, now } = await seedMfaUser(`concurrency-k-${Date.now()}@example.com`);
    const challengeOne = await createMfaLoginChallenge(userId, now);
    const challengeTwo = await createMfaLoginChallenge(userId, now);

    const results = await Promise.allSettled([
      verifyTotpLogin({ challengeToken: challengeOne.token, code }, now),
      verifyTotpLogin({ challengeToken: challengeTwo.token, code }, now),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.equal(fulfilled.length, 1, "only one of the two same-step challenges may be accepted");
    assert.equal(sessions.filter((id) => id === userId).length, 1);
  });
});
