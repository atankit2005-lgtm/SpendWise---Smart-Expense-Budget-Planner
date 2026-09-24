/**
 * Stage 8.2 settings persistence tests: the FinanceSnapshot must carry the
 * user's persisted preferences, `persistPreferencesPatch` must write through
 * the existing user_settings repository with the correct column mapping, and
 * a failed write must neither publish nor pretend to succeed.
 *
 * Same pattern as persistence.realtime.test.ts: database/session dependencies
 * are replaced with in-test fakes via `node:test` module mocks; the realtime
 * registry and the real `./errors` module stay intact so NotFoundError
 * identity checks behave exactly as in production.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { randomUUID } from "node:crypto";

import { defaultUserPreferences } from "@/types";
import { NotFoundError } from "./errors";
import type { RealtimeEvent } from "./realtime/events";
import { subscribe } from "./realtime/registry";

// ---------------------------------------------------------------------------
// Mock control state
// ---------------------------------------------------------------------------

interface SettingsRow {
  userId: string;
  theme: string;
  compactDensity: boolean;
  animations: boolean;
  budgetAlerts: boolean;
  weeklyDigest: boolean;
  anomalyAlerts: boolean;
  shareAnonymised: boolean;
  hideAmounts: boolean;
  twoFactorEnabled: boolean;
}

function settingsRow(userId: string, overrides: Partial<Omit<SettingsRow, "userId">> = {}): SettingsRow {
  return {
    userId,
    theme: "dark",
    compactDensity: false,
    animations: true,
    budgetAlerts: true,
    weeklyDigest: false,
    anomalyAlerts: true,
    shareAnonymised: false,
    hideAmounts: false,
    twoFactorEnabled: false,
    ...overrides,
  };
}

const control = {
  sessionUserId: "",
  /** Simulated user_settings table, keyed by userId. */
  table: new Map<string, SettingsRow>(),
  /** Operation names that should simulate a PostgreSQL failure. */
  failing: new Set<string>(),
  /** Capture for the last upsertSettings call. */
  lastUpsertUserId: "",
  lastUpsertPatch: null as Record<string, unknown> | null,
  getSettingsCalls: [] as string[],
};

function guard(name: string): void {
  if (control.failing.has(name)) {
    throw new Error(`Simulated PostgreSQL failure in ${name}`);
  }
}

const now = new Date("2026-09-24T10:00:00.000Z");

function userRecord(userId: string) {
  return {
    id: userId,
    name: "Ankit Kumar",
    email: "ankit.kumar@spendwise.app",
    phone: "+91 98765 43210",
    location: "Bengaluru, India",
    currency: "INR",
    occupation: "Product Engineer",
    passwordHash: "not-a-real-hash",
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Module mocks (registered before `./persistence` is imported)
// ---------------------------------------------------------------------------

mock.module("./authentication", {
  namedExports: {
    requireSessionUserId: async () => {
      if (!control.sessionUserId) throw new Error("No authenticated session in test");
      return control.sessionUserId;
    },
  },
});

const fakeDb = {
  update: () => ({
    set: () => ({
      where: () => ({
        returning: async () => [userRecord(control.sessionUserId)],
      }),
    }),
  }),
};

mock.module("./db", {
  defaultExport: fakeDb,
  namedExports: { db: fakeDb, getDb: () => fakeDb, isDatabaseConfigured: () => true },
});

mock.module("./repositories/settings", {
  namedExports: {
    getSettingsForUser: async (userId: string) => {
      guard("getSettingsForUser");
      control.getSettingsCalls.push(userId);
      const row = control.table.get(userId);
      if (!row) throw new NotFoundError("User settings not found.");
      return row;
    },
    upsertSettings: async (userId: string, patch: Record<string, unknown>) => {
      guard("upsertSettings");
      control.lastUpsertUserId = userId;
      control.lastUpsertPatch = patch;
      const existing = control.table.get(userId) ?? settingsRow(userId);
      const updated: SettingsRow = { ...existing, ...(patch as Partial<SettingsRow>), userId };
      control.table.set(userId, updated);
      return updated;
    },
  },
});

mock.module("./repositories/users", {
  namedExports: {
    getUserById: async (userId: string) => userRecord(userId),
  },
});

mock.module("./repositories/categories", {
  namedExports: { getCategoryForUser: async () => ({}), listCategoriesForUser: async () => [] },
});

mock.module("./repositories/transactions", {
  namedExports: {
    createTransaction: async () => ({}),
    updateTransaction: async () => ({}),
    deleteTransaction: async () => true,
    listTransactionsForUser: async () => [],
  },
});

mock.module("./repositories/budgets", {
  namedExports: {
    createBudget: async () => ({}),
    updateBudget: async () => ({}),
    deleteBudget: async () => true,
    listBudgetsForUser: async () => [],
  },
});

mock.module("./repositories/goals", {
  namedExports: {
    createGoal: async () => ({}),
    updateGoal: async () => ({}),
    deleteGoal: async () => true,
    listGoalsForUser: async () => [],
  },
});

mock.module("./repositories/notifications", {
  namedExports: {
    markNotificationRead: async () => ({}),
    markNotificationUnread: async () => ({}),
    markAllNotificationsRead: async () => 0,
    deleteNotification: async () => true,
    listNotificationsForUser: async () => [],
  },
});

const persistence = await import("./persistence");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function watch(userId: string): { received: RealtimeEvent[]; unsubscribe: () => void } {
  const received: RealtimeEvent[] = [];
  const unsubscribe = subscribe(userId, (event) => received.push(event));
  return { received, unsubscribe };
}

function eventTypes(received: RealtimeEvent[]): string[] {
  return received.map((event) => event.type);
}

beforeEach(() => {
  control.sessionUserId = randomUUID();
  control.table.clear();
  control.failing.clear();
  control.lastUpsertUserId = "";
  control.lastUpsertPatch = null;
  control.getSettingsCalls = [];
  control.table.set(control.sessionUserId, settingsRow(control.sessionUserId));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("settings persistence through FinanceSnapshot (Stage 8.2)", () => {
  it("loads the session user's settings into snapshot.preferences with column mapping", async () => {
    control.table.set(
      control.sessionUserId,
      settingsRow(control.sessionUserId, {
        theme: "light",
        compactDensity: true,
        weeklyDigest: true,
        hideAmounts: true,
        twoFactorEnabled: true,
      }),
    );

    const snapshot = await persistence.loadFinanceSnapshot();

    assert.deepEqual(snapshot.preferences, {
      theme: "light",
      compact: true,
      animations: true,
      budgetAlerts: true,
      weeklyDigest: true,
      anomalyAlerts: true,
      shareAnonymised: false,
      hideAmounts: true,
      twoFactor: true,
    });
    assert.deepEqual(control.getSettingsCalls, [control.sessionUserId]);
  });

  it("falls back to signup defaults when the settings row is missing, without failing the snapshot", async () => {
    control.table.delete(control.sessionUserId);

    const snapshot = await persistence.loadFinanceSnapshot();

    assert.deepEqual(snapshot.preferences, defaultUserPreferences);
    assert.equal(snapshot.user.id, control.sessionUserId);
  });

  it("propagates a real database failure from the settings read", async () => {
    control.failing.add("getSettingsForUser");

    await assert.rejects(() => persistence.loadFinanceSnapshot());
  });

  it("persists a preferences patch with the correct column mapping and only the patched keys", async () => {
    const result = await persistence.persistPreferencesPatch({ compact: true, twoFactor: true });

    assert.equal(control.lastUpsertUserId, control.sessionUserId);
    assert.deepEqual(control.lastUpsertPatch, { compactDensity: true, twoFactorEnabled: true });
    assert.equal(result.compact, true);
    assert.equal(result.twoFactor, true);
    // untouched keys keep their previously persisted values
    assert.equal(result.theme, "dark");
    assert.equal(result.weeklyDigest, false);
  });

  it("reload returns the persisted setting: a patch survives the next snapshot load", async () => {
    await persistence.persistPreferencesPatch({ weeklyDigest: true, theme: "light" });

    const snapshot = await persistence.loadFinanceSnapshot();

    assert.equal(snapshot.preferences.weeklyDigest, true);
    assert.equal(snapshot.preferences.theme, "light");
  });

  it("keeps settings isolated per user", async () => {
    const userB = randomUUID();
    control.table.set(userB, settingsRow(userB, { theme: "light", weeklyDigest: true }));
    control.table.set(control.sessionUserId, settingsRow(control.sessionUserId, { theme: "dark" }));

    const snapshot = await persistence.loadFinanceSnapshot();
    assert.equal(snapshot.preferences.theme, "dark");
    assert.equal(snapshot.preferences.weeklyDigest, false);

    await persistence.persistPreferencesPatch({ animations: false });
    assert.equal(control.table.get(userB)!.animations, true, "other user's row must be untouched");
    assert.equal(control.table.get(control.sessionUserId)!.animations, false);
  });

  it("publishes exactly one user-scoped invalidation after a successful patch", async () => {
    const userB = randomUUID();
    const viewerA = watch(control.sessionUserId);
    const viewerB = watch(userB);

    await persistence.persistPreferencesPatch({ budgetAlerts: false });

    assert.deepEqual(eventTypes(viewerA.received), ["finance.snapshot.invalidated"]);
    assert.equal(viewerB.received.length, 0);
    viewerA.unsubscribe();
    viewerB.unsubscribe();
  });

  it("rejects and publishes nothing when the settings write fails", async () => {
    const viewer = watch(control.sessionUserId);
    control.failing.add("upsertSettings");

    await assert.rejects(() => persistence.persistPreferencesPatch({ theme: "light" }));
    assert.equal(viewer.received.length, 0);
    assert.equal(control.table.get(control.sessionUserId)!.theme, "dark", "no partial write");
    viewer.unsubscribe();
  });
});
