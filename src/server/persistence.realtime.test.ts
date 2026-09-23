/**
 * Stage 6.2 wiring tests: successful persistence mutations must publish
 * user-scoped, payload-free realtime events — and failed mutations must not.
 *
 * The database/session dependencies of `persistence.ts` are replaced with
 * in-test fakes via `node:test` module mocks, while the realtime registry,
 * publishing seam, and SSE encoder are the real modules. That keeps these
 * tests focused on the publish-after-commit contract rather than on SQL.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { randomUUID } from "node:crypto";

import type { RealtimeEvent } from "./realtime/events";
import { subscribe } from "./realtime/registry";
import { encodeSseEvent } from "./realtime/sse";

// ---------------------------------------------------------------------------
// Mock control state
// ---------------------------------------------------------------------------

const control = {
  sessionUserId: "",
  /** Repository/db operation names that should simulate a PostgreSQL failure. */
  failing: new Set<string>(),
  /** What delete-style repositories report (false = record not found). */
  deleted: true,
};

function guard(name: string): void {
  if (control.failing.has(name)) {
    throw new Error(`Simulated PostgreSQL failure in ${name}`);
  }
}

const now = new Date("2026-09-24T10:00:00.000Z");

function txRecord(userId: string) {
  return {
    id: "txn-1",
    userId,
    categoryId: "cat-1",
    amount: "1250.50",
    type: "expense",
    description: "Dinner at Toit Brewpub",
    paymentMethod: "credit_card",
    occurredOn: "2026-09-10",
    notes: "weekend with friends",
    createdAt: now,
    updatedAt: now,
  };
}

function budgetRecord(userId: string) {
  return {
    id: "bud-1",
    userId,
    categoryId: "cat-1",
    limitAmount: "8000.00",
    period: "monthly",
    startDate: "2026-09-01",
    createdAt: now,
    updatedAt: now,
  };
}

function goalRecord(userId: string) {
  return {
    id: "goal-1",
    userId,
    name: "Emergency fund",
    targetAmount: "100000.00",
    currentAmount: "42000.00",
    targetDate: "2026-12-31",
    status: "active",
    note: null,
    createdAt: now,
    updatedAt: now,
  };
}

function notificationRecord(userId: string, readAt: Date | null) {
  return {
    id: "notif-1",
    userId,
    type: "insight",
    title: "Budget warning",
    message: "You are close to your Food & Dining limit.",
    readAt,
    createdAt: now,
  };
}

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

function categoryRecord(userId: string) {
  return {
    id: "cat-1",
    userId,
    name: "Food & Dining",
    type: "expense",
    color: "var(--chart-1)",
    icon: "utensils",
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// Module mocks (registered before `./persistence` is imported)
// ---------------------------------------------------------------------------

mock.module("./authentication", {
  namedExports: {
    requireSessionUserId: async () => {
      guard("requireSessionUserId");
      if (!control.sessionUserId) throw new Error("No authenticated session in test");
      return control.sessionUserId;
    },
  },
});

const fakeDb = {
  update: () => ({
    set: () => ({
      where: () => ({
        returning: async () => {
          guard("db.update");
          return [userRecord(control.sessionUserId)];
        },
      }),
    }),
  }),
};

mock.module("./db", {
  defaultExport: fakeDb,
  namedExports: { db: fakeDb, getDb: () => fakeDb, isDatabaseConfigured: () => true },
});

mock.module("./repositories/transactions", {
  namedExports: {
    createTransaction: async (input: { userId: string }) => {
      guard("createTransaction");
      return txRecord(input.userId);
    },
    updateTransaction: async (userId: string) => {
      guard("updateTransaction");
      return txRecord(userId);
    },
    deleteTransaction: async () => {
      guard("deleteTransaction");
      return control.deleted;
    },
    listTransactionsForUser: async () => [],
  },
});

mock.module("./repositories/budgets", {
  namedExports: {
    createBudget: async (input: { userId: string }) => {
      guard("createBudget");
      return budgetRecord(input.userId);
    },
    updateBudget: async (userId: string) => {
      guard("updateBudget");
      return budgetRecord(userId);
    },
    deleteBudget: async () => {
      guard("deleteBudget");
      return control.deleted;
    },
    listBudgetsForUser: async () => [],
  },
});

mock.module("./repositories/goals", {
  namedExports: {
    createGoal: async (input: { userId: string }) => {
      guard("createGoal");
      return goalRecord(input.userId);
    },
    updateGoal: async (userId: string) => {
      guard("updateGoal");
      return goalRecord(userId);
    },
    deleteGoal: async () => {
      guard("deleteGoal");
      return control.deleted;
    },
    listGoalsForUser: async () => [],
  },
});

mock.module("./repositories/notifications", {
  namedExports: {
    markNotificationRead: async (userId: string) => {
      guard("markNotificationRead");
      return notificationRecord(userId, now);
    },
    markNotificationUnread: async (userId: string) => {
      guard("markNotificationUnread");
      return notificationRecord(userId, null);
    },
    markAllNotificationsRead: async () => {
      guard("markAllNotificationsRead");
      return 3;
    },
    deleteNotification: async () => {
      guard("deleteNotification");
      return control.deleted;
    },
    listNotificationsForUser: async () => [],
  },
});

mock.module("./repositories/categories", {
  namedExports: {
    getCategoryForUser: async (userId: string) => {
      guard("getCategoryForUser");
      return categoryRecord(userId);
    },
    listCategoriesForUser: async () => [],
  },
});

mock.module("./repositories/users", {
  namedExports: {
    getUserById: async (userId: string) => {
      guard("getUserById");
      return userRecord(userId);
    },
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

const txInput = {
  amount: 1250.5,
  type: "expense",
  categoryId: "cat-1",
  description: "Dinner at Toit Brewpub",
  paymentMethod: "Credit Card",
  date: "2026-09-10",
} as const;

const budgetInput = {
  categoryId: "cat-1",
  limit: 8000,
  period: "monthly",
  startDate: "2026-09-01",
} as const;

const goalInput = {
  name: "Emergency fund",
  targetAmount: 100000,
  currentAmount: 42000,
  targetDate: "2026-12-31",
  status: "active",
} as const;

beforeEach(() => {
  control.sessionUserId = randomUUID();
  control.failing.clear();
  control.deleted = true;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("persistence → realtime publication (Stage 6.2)", () => {
  it("publishes transaction.changed after a successful transaction create", async () => {
    const viewer = watch(control.sessionUserId);
    await persistence.persistCreateTransaction({ ...txInput });

    assert.deepEqual(eventTypes(viewer.received), ["transaction.changed"]);
    viewer.unsubscribe();
  });

  it("publishes nothing when the database operation fails", async () => {
    const viewer = watch(control.sessionUserId);
    control.failing.add("createTransaction");

    await assert.rejects(() => persistence.persistCreateTransaction({ ...txInput }));
    assert.equal(viewer.received.length, 0);
    viewer.unsubscribe();
  });

  it("scopes events to the authenticated user only (no cross-user leakage)", async () => {
    const userB = randomUUID();
    const viewerA = watch(control.sessionUserId);
    const viewerB = watch(userB);

    await persistence.persistCreateTransaction({ ...txInput });
    await persistence.persistCreateBudget({ ...budgetInput });

    assert.deepEqual(eventTypes(viewerA.received), ["transaction.changed", "budget.changed"]);
    assert.equal(viewerB.received.length, 0);
    viewerA.unsubscribe();
    viewerB.unsubscribe();
  });

  it("covers every wired mutation with exactly one event of the right type", async () => {
    const cases: Array<[string, string, () => Promise<unknown>]> = [
      ["transaction create", "transaction.changed", () => persistence.persistCreateTransaction({ ...txInput })],
      ["transaction update", "transaction.changed", () => persistence.persistUpdateTransaction("txn-1", { description: "Lunch" })],
      ["transaction delete", "transaction.changed", () => persistence.persistDeleteTransaction("txn-1")],
      ["budget create", "budget.changed", () => persistence.persistCreateBudget({ ...budgetInput })],
      ["budget update", "budget.changed", () => persistence.persistUpdateBudget("bud-1", { limit: 9000 })],
      ["budget delete", "budget.changed", () => persistence.persistDeleteBudget("bud-1")],
      ["goal create", "goal.changed", () => persistence.persistCreateGoal({ ...goalInput })],
      ["goal update", "goal.changed", () => persistence.persistUpdateGoal("goal-1", { currentAmount: 50000 })],
      ["goal delete", "goal.changed", () => persistence.persistDeleteGoal("goal-1")],
      ["notification mark read", "notification.changed", () => persistence.persistToggleNotification("notif-1", false)],
      ["notification mark unread", "notification.changed", () => persistence.persistToggleNotification("notif-1", true)],
      ["notification mark all read", "notification.changed", () => persistence.persistMarkAllNotificationsRead()],
      ["notification delete", "notification.changed", () => persistence.persistDeleteNotification("notif-1")],
      ["user patch", "finance.snapshot.invalidated", () => persistence.persistUserPatch({ name: "Ankit K." })],
    ];

    for (const [label, expectedType, run] of cases) {
      const viewer = watch(control.sessionUserId);
      await run();
      assert.deepEqual(eventTypes(viewer.received), [expectedType], `unexpected events for ${label}`);
      viewer.unsubscribe();
    }
  });

  it("does not publish when a delete finds no record (nothing actually changed)", async () => {
    const viewer = watch(control.sessionUserId);
    control.deleted = false;

    assert.equal(await persistence.persistDeleteTransaction("txn-missing"), false);
    assert.equal(await persistence.persistDeleteBudget("bud-missing"), false);
    assert.equal(await persistence.persistDeleteGoal("goal-missing"), false);
    assert.equal(await persistence.persistDeleteNotification("notif-missing"), false);
    assert.equal(viewer.received.length, 0);
    viewer.unsubscribe();
  });

  it("publishes nothing for any mutation whose database step fails", async () => {
    const failures: Array<[string, () => Promise<unknown>]> = [
      ["updateTransaction", () => persistence.persistUpdateTransaction("txn-1", { description: "x" })],
      ["deleteTransaction", () => persistence.persistDeleteTransaction("txn-1")],
      ["getCategoryForUser", () => persistence.persistCreateBudget({ ...budgetInput })],
      ["createBudget", () => persistence.persistCreateBudget({ ...budgetInput })],
      ["updateBudget", () => persistence.persistUpdateBudget("bud-1", { limit: 1 })],
      ["deleteBudget", () => persistence.persistDeleteBudget("bud-1")],
      ["createGoal", () => persistence.persistCreateGoal({ ...goalInput })],
      ["updateGoal", () => persistence.persistUpdateGoal("goal-1", { name: "x" })],
      ["deleteGoal", () => persistence.persistDeleteGoal("goal-1")],
      ["markNotificationRead", () => persistence.persistToggleNotification("notif-1", false)],
      ["markNotificationUnread", () => persistence.persistToggleNotification("notif-1", true)],
      ["markAllNotificationsRead", () => persistence.persistMarkAllNotificationsRead()],
      ["deleteNotification", () => persistence.persistDeleteNotification("notif-1")],
      ["getUserById", () => persistence.persistUserPatch({ name: "x" })],
    ];

    for (const [failName, run] of failures) {
      const viewer = watch(control.sessionUserId);
      control.failing.add(failName);
      await assert.rejects(run, `expected failure in ${failName} to reject`);
      assert.equal(viewer.received.length, 0, `${failName} failure must not publish`);
      viewer.unsubscribe();
    }
  });

  it("keeps financial details off the wire even for successful publishes", async () => {
    const viewer = watch(control.sessionUserId);
    await persistence.persistCreateTransaction({ ...txInput });

    const wire = encodeSseEvent(viewer.received[0]!);
    assert.ok(!wire.includes("Toit"), "merchant name must not appear on the wire");
    assert.ok(!wire.includes("1250.50"), "amount must not appear on the wire");
    assert.ok(!wire.includes(control.sessionUserId), "user id must not appear on the wire");

    const dataLine = wire.split("\n").find((line) => line.startsWith("data: "))!;
    const payload = JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ["publishedAt", "type"]);
    viewer.unsubscribe();
  });

  it("does not fail an already-committed mutation when a subscriber throws", async () => {
    const user = control.sessionUserId;
    const viewer = watch(user);
    const badSubscriber = subscribe(user, () => {
      throw new Error("subscriber disconnected mid-publish");
    });

    const created = await persistence.persistCreateTransaction({ ...txInput });
    assert.equal(created.id, "txn-1");
    assert.deepEqual(eventTypes(viewer.received), ["transaction.changed"]);

    badSubscriber();
    viewer.unsubscribe();
  });
});
