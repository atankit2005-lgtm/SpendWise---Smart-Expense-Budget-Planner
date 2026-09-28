/**
 * Extension 2.5 — real-PostgreSQL deactivation concurrency verification.
 *
 * Unit coverage in totp-enrollment.test.ts uses in-memory fakes, which cannot
 * demonstrate genuine row-lock atomicity. This file runs the disable flow
 * against a real PostgreSQL instance with truly concurrent requests (separate
 * pooled connections) to prove:
 *
 *   (M) two simultaneous disables using the same single-use recovery code
 *       cannot both succeed — the user-row lock serializes them and the
 *       loser fails closed after the configuration is gone.
 *   (N) two simultaneous disables using the same TOTP step cannot both
 *       succeed — the replay watermark and configuration delete hold.
 *   (O) an in-flight MFA login challenge fails closed once MFA has been
 *       disabled (verifyTotpLogin never authenticates against a removed
 *       configuration).
 *
 * Requires DATABASE_URL to point at a disposable PostgreSQL database with
 * this project's migrations applied (`npm run db:migrate`). Skips cleanly
 * (does not fail `npm test`) when DATABASE_URL is unset — same contract as
 * totp-login.postgres.test.ts.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, beforeEach, describe, it, mock } from "node:test";

const hasDatabase = Boolean(process.env["DATABASE_URL"]?.trim());
process.env["TOTP_ENCRYPTION_KEY"] ??= Buffer.alloc(32, 0x77).toString("base64");

let currentUserId = "";
let clearCookieCalls = 0;

mock.module("./session", {
  namedExports: {
    createSession: async () => ({ id: "test-session" }),
    setSessionCookie: () => {},
    clearSessionCookie: () => {
      clearCookieCalls += 1;
    },
  },
});

mock.module("./authentication", {
  namedExports: {
    reauthenticateCurrentUser: async (password: unknown) => {
      if (password !== "test-password") throw new Error("Current password is incorrect.");
      return { userId: currentUserId, email: "disable-test@example.com" };
    },
    requireSessionUserId: async () => currentUserId,
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

describe(
  "Extension 2.5 — real PostgreSQL disable concurrency",
  { skip: !hasDatabase },
  async () => {
    if (!hasDatabase) return;

    const { eq } = await import("drizzle-orm");
    const { createUser } = await import("./repositories/users");
    const { activateTotpMfa } = await import("./repositories/totp-mfa-configurations");
    const { replaceTotpMfaRecoveryCodeDigests } =
      await import("./repositories/totp-mfa-recovery-codes");
    const { totpMfaConfigurations, totpMfaRecoveryCodes } = await import("../../db/schema");
    const { digestRecoveryCode } = await import("./mfa-digests");
    const { encryptTotpSecret } = await import("./totp-crypto");
    const { createTotp, generateTotpSecret } = await import("./totp");
    const { createMfaLoginChallenge, verifyTotpLogin } = await import("./totp-login");
    const { disableTotpMfa } = await import("./totp-enrollment");
    const { resetRateLimitState } = await import("./rate-limit");
    const { default: db } = await import("./db");

    after(async () => {
      await closeTestDb?.();
    });

    beforeEach(() => {
      resetRateLimitState();
      clearCookieCalls = 0;
    });

    // Recovery-code digests are globally unique, so every seed must use a
    // fresh code — rows from earlier test runs (this file and
    // totp-login.postgres.test.ts) persist in the disposable database.
    function uniqueRecoveryCode(): string {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const chars = Array.from(randomBytes(16), (byte) => alphabet[byte % 32]!).join("");
      return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
    }

    async function seedMfaUser(email: string): Promise<{
      userId: string;
      secret: string;
      recoveryCode: string;
      now: Date;
    }> {
      const user = await createUser({ email, name: "Disable Test User" }, db);
      currentUserId = user.id;
      const secret = generateTotpSecret();
      const encrypted = encryptTotpSecret(secret);
      const now = new Date();
      const recoveryCode = uniqueRecoveryCode();
      await activateTotpMfa(
        user.id,
        {
          secret: encrypted,
          acceptedStep: Math.floor(now.getTime() / 30_000) - 1,
          activatedAt: now,
        },
        db,
      );
      await replaceTotpMfaRecoveryCodeDigests(user.id, [digestRecoveryCode(recoveryCode)], db, now);
      return { userId: user.id, secret, recoveryCode, now };
    }

    async function assertFullyDeactivated(userId: string): Promise<void> {
      const configs = await db
        .select()
        .from(totpMfaConfigurations)
        .where(eq(totpMfaConfigurations.userId, userId));
      const codes = await db
        .select()
        .from(totpMfaRecoveryCodes)
        .where(eq(totpMfaRecoveryCodes.userId, userId));
      assert.equal(configs.length, 0, "configuration row must be deleted");
      assert.equal(codes.length, 0, "all recovery-code digests must be deleted");
    }

    it("(M) concurrent disables with the same recovery code deactivate exactly once", async () => {
      const { userId, recoveryCode, now } = await seedMfaUser(
        `disable-m-${Date.now()}@example.com`,
      );

      const results = await Promise.allSettled([
        disableTotpMfa({ currentPassword: "test-password", code: recoveryCode }, now),
        disableTotpMfa({ currentPassword: "test-password", code: recoveryCode }, now),
      ]);

      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
        "exactly one concurrent disable may succeed",
      );
      await assertFullyDeactivated(userId);
      assert.equal(clearCookieCalls, 1, "the winning disable clears the session cookie once");
    });

    it("(N) concurrent disables with the same TOTP step deactivate exactly once", async () => {
      const { userId, secret, now } = await seedMfaUser(`disable-n-${Date.now()}@example.com`);
      const code = createTotp(secret, "SpendWise", "account").generate({
        timestamp: now.getTime(),
      });

      const results = await Promise.allSettled([
        disableTotpMfa({ currentPassword: "test-password", code }, now),
        disableTotpMfa({ currentPassword: "test-password", code }, now),
      ]);

      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
        "exactly one concurrent disable may succeed",
      );
      await assertFullyDeactivated(userId);
    });

    it("(O) an in-flight login challenge fails closed after MFA is disabled", async () => {
      const { userId, secret, recoveryCode, now } = await seedMfaUser(
        `disable-o-${Date.now()}@example.com`,
      );
      const challenge = await createMfaLoginChallenge(userId, now);

      await disableTotpMfa({ currentPassword: "test-password", code: recoveryCode }, now);
      await assertFullyDeactivated(userId);

      const code = createTotp(secret, "SpendWise", "account").generate({
        timestamp: now.getTime(),
      });
      await assert.rejects(
        verifyTotpLogin({ challengeToken: challenge.token, code }, now),
        /MFA is not configured/,
      );
    });
  },
);
