/**
 * Extension 2.6 — real-PostgreSQL recovery-code regeneration verification.
 *
 * These tests use a dedicated real PostgreSQL connection so row locks,
 * transactions, and the recovery-code replacement are exercised by the
 * database rather than an in-memory fake. They skip cleanly when DATABASE_URL
 * is unavailable.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, beforeEach, describe, it, mock } from "node:test";

const hasDatabase = Boolean(process.env["DATABASE_URL"]?.trim());
process.env["TOTP_ENCRYPTION_KEY"] ??= Buffer.alloc(32, 0x77).toString("base64");

let currentUserId = "";
let clearCookieCalls = 0;
const createdSessions: string[] = [];

mock.module("./session", {
  namedExports: {
    createSession: async (userId: string) => {
      createdSessions.push(userId);
    },
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
      return { userId: currentUserId, email: "recovery-test@example.com" };
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
  "Extension 2.6 — real PostgreSQL recovery-code regeneration",
  { skip: !hasDatabase },
  async () => {
    if (!hasDatabase) return;

    const { eq, sql } = await import("drizzle-orm");
    const { createUser } = await import("./repositories/users");
    const { activateTotpMfa, getTotpMfaConfiguration } = await import(
      "./repositories/totp-mfa-configurations"
    );
    const {
      getRemainingTotpMfaRecoveryCodeCount,
      replaceTotpMfaRecoveryCodeDigests,
    } = await import("./repositories/totp-mfa-recovery-codes");
    const { sessions, totpMfaRecoveryCodes } = await import("../../db/schema");
    const { digestRecoveryCode } = await import("./mfa-digests");
    const { encryptTotpSecret } = await import("./totp-crypto");
    const { createTotp, generateTotpSecret } = await import("./totp");
    const { createMfaLoginChallenge, verifyTotpLogin } = await import("./totp-login");
    const { regenerateTotpMfaRecoveryCodes } = await import("./totp-enrollment");
    const { resetRateLimitState } = await import("./rate-limit");
    const { default: db } = await import("./db");

    after(async () => {
      await closeTestDb?.();
    });

    beforeEach(() => {
      resetRateLimitState();
      clearCookieCalls = 0;
      createdSessions.length = 0;
    });

    function uniqueEmail(prefix: string): string {
      return `${prefix}-${randomBytes(8).toString("hex")}@example.com`;
    }

    function uniqueRecoveryCode(): string {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const chars = Array.from(randomBytes(16), (byte) => alphabet[byte % 32]!).join("");
      return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
    }

    async function seedMfaUser(
      prefix: string,
      now = new Date(),
    ): Promise<{ userId: string; secret: string; originalRecoveryCode: string; now: Date }> {
      const user = await createUser({ email: uniqueEmail(prefix), name: "Recovery Test User" }, db);
      currentUserId = user.id;
      const secret = generateTotpSecret();
      const encrypted = encryptTotpSecret(secret);
      const currentStep = Math.floor(now.getTime() / 30_000);
      const originalRecoveryCode = uniqueRecoveryCode();

      await activateTotpMfa(
        user.id,
        {
          secret: encrypted,
          acceptedStep: currentStep - 1,
          activatedAt: now,
        },
        db,
      );
      await replaceTotpMfaRecoveryCodeDigests(
        user.id,
        [digestRecoveryCode(originalRecoveryCode)],
        db,
        now,
      );

      return { userId: user.id, secret, originalRecoveryCode, now };
    }

    async function getRecoveryRows(userId: string) {
      return db
        .select()
        .from(totpMfaRecoveryCodes)
        .where(eq(totpMfaRecoveryCodes.userId, userId));
    }

    function currentTotp(secret: string, now: Date): string {
      return createTotp(secret, "SpendWise", "account").generate({ timestamp: now.getTime() });
    }

    it("allows only one concurrent regeneration for the same TOTP step", async () => {
      const { userId, secret, now } = await seedMfaUser("recovery-concurrent");
      const code = currentTotp(secret, now);

      const results = await Promise.allSettled([
        regenerateTotpMfaRecoveryCodes({ currentPassword: "test-password", code }, now),
        regenerateTotpMfaRecoveryCodes({ currentPassword: "test-password", code }, now),
      ]);

      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
        "exactly one regeneration may accept the same TOTP step",
      );
      assert.equal(
        results.filter((result) => result.status === "rejected").length,
        1,
        "the losing regeneration must fail",
      );
      assert.equal((await getRecoveryRows(userId)).length, 10);

      const configuration = await getTotpMfaConfiguration(userId, db);
      assert.ok(configuration, "the MFA configuration remains active");
      assert.equal(configuration.lastAcceptedStep, Math.floor(now.getTime() / 30_000));
      assert.equal(clearCookieCalls, 1, "only the successful transaction clears the cookie");
    });

    it("replaces old recovery digests with ten unique hashes and returns plaintext once", async () => {
      const { userId, secret, originalRecoveryCode, now } = await seedMfaUser("recovery-success");
      const previousDigest = digestRecoveryCode(originalRecoveryCode);

      const { recoveryCodes } = await regenerateTotpMfaRecoveryCodes(
        { currentPassword: "test-password", code: currentTotp(secret, now) },
        now,
      );

      assert.equal(recoveryCodes.length, 10);
      assert.equal(new Set(recoveryCodes).size, 10, "returned recovery codes are unique");
      const rows = await getRecoveryRows(userId);
      assert.equal(rows.length, 10);
      const storedDigests = rows.map((row) => row.digest);
      assert.ok(!storedDigests.includes(previousDigest), "the old digest is removed");
      assert.ok(
        storedDigests.every((digest) => /^[a-f0-9]{64}$/.test(digest)),
        "every stored value is a lowercase SHA-256 digest",
      );
      assert.ok(
        rows.every((row) => !recoveryCodes.includes(row.digest)),
        "plaintext recovery codes are not stored",
      );
      assert.deepEqual(
        new Set(storedDigests),
        new Set(recoveryCodes.map((code) => digestRecoveryCode(code))),
        "the database stores exactly the returned codes' digests",
      );
    });

    it("accepts a newly generated recovery code for login exactly once", async () => {
      const { userId, secret, now } = await seedMfaUser("recovery-login");
      const { recoveryCodes } = await regenerateTotpMfaRecoveryCodes(
        { currentPassword: "test-password", code: currentTotp(secret, now) },
        now,
      );

      const challenge = await createMfaLoginChallenge(userId, now);
      const user = await verifyTotpLogin(
        { challengeToken: challenge.token, code: recoveryCodes[0]! },
        now,
      );

      assert.equal(user.id, userId);
      assert.deepEqual(createdSessions, [userId], "successful recovery login creates one session");
      const consumed = await getRecoveryRows(userId);
      assert.equal(consumed.length, 10);
      assert.equal(consumed.filter((row) => row.consumedAt !== null).length, 1);
      assert.equal(await getRemainingTotpMfaRecoveryCodeCount(userId, db), 9);
    });

    it("does not change another user's MFA configuration or recovery-code set", async () => {
      const now = new Date();
      const userA = await seedMfaUser("recovery-isolation-a", now);
      const userB = await seedMfaUser("recovery-isolation-b", now);
      const configurationBefore = await getTotpMfaConfiguration(userB.userId, db);
      const recoveryRowsBefore = await getRecoveryRows(userB.userId);

      currentUserId = userA.userId;
      await regenerateTotpMfaRecoveryCodes(
        { currentPassword: "test-password", code: currentTotp(userA.secret, now) },
        now,
      );

      const configurationAfter = await getTotpMfaConfiguration(userB.userId, db);
      const recoveryRowsAfter = await getRecoveryRows(userB.userId);
      assert.deepEqual(configurationAfter, configurationBefore);
      assert.deepEqual(recoveryRowsAfter, recoveryRowsBefore);
      assert.equal((await getRecoveryRows(userA.userId)).length, 10);
      assert.equal(clearCookieCalls, 1);
    });

    it("rolls back recovery replacement and replay state when session revocation fails", async () => {
      const { userId, secret, originalRecoveryCode, now } = await seedMfaUser(
        "recovery-rollback",
      );
      const stepBefore = Math.floor(now.getTime() / 30_000) - 1;
      const suffix = randomBytes(8).toString("hex");
      const functionName = `totp_recovery_fail_${suffix}`;
      const triggerName = `totp_recovery_fail_${suffix}`;
      const functionSql = `
        CREATE FUNCTION "${functionName}"() RETURNS trigger
        LANGUAGE plpgsql
        AS $body$
        BEGIN
          RAISE EXCEPTION 'forced regeneration rollback';
        END
        $body$
      `;
      const triggerSql = `
        CREATE TRIGGER "${triggerName}"
        BEFORE DELETE ON sessions
        FOR EACH ROW
        WHEN (OLD.user_id = '${userId}'::uuid)
        EXECUTE FUNCTION "${functionName}"()
      `;

      await db.insert(sessions).values({
        userId,
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
      });

      try {
        await db.execute(sql.raw(functionSql));
        await db.execute(sql.raw(triggerSql));

        await assert.rejects(
          regenerateTotpMfaRecoveryCodes(
            { currentPassword: "test-password", code: currentTotp(secret, now) },
            now,
          ),
          /forced regeneration rollback/,
        );
      } finally {
        await db.execute(sql.raw(`DROP TRIGGER IF EXISTS "${triggerName}" ON sessions`));
        await db.execute(sql.raw(`DROP FUNCTION IF EXISTS "${functionName}"()`));
      }

      const recoveryRows = await getRecoveryRows(userId);
      assert.deepEqual(recoveryRows.map((row) => row.digest), [
        digestRecoveryCode(originalRecoveryCode),
      ]);
      const configuration = await getTotpMfaConfiguration(userId, db);
      assert.ok(configuration, "the MFA configuration remains active");
      assert.equal(configuration.lastAcceptedStep, stepBefore);
      const preservedSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));
      assert.equal(
        preservedSessions.length,
        1,
        "the failed transaction also preserves the existing session",
      );
      assert.equal(clearCookieCalls, 0, "a failed transaction does not clear the cookie");
    });
  },
);
