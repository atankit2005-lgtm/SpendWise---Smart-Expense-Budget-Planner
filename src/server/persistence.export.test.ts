import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

const control = {
  sessionUserId: "",
  users: new Map<string, Record<string, unknown>>(),
  categories: [] as Array<Record<string, unknown>>,
  transactions: [] as Array<Record<string, unknown>>,
  budgets: [] as Array<Record<string, unknown>>,
  goals: [] as Array<Record<string, unknown>>,
  notifications: [] as Array<Record<string, unknown>>,
  settings: new Map<string, Record<string, unknown>>(),
};

const now = new Date("2026-09-25T10:00:00.000Z");

function user(id: string, passwordHash: string) {
  return {
    id,
    name: "Ankit Kumar",
    email: `${id}@example.com`,
    phone: null,
    location: null,
    occupation: null,
    currency: "INR",
    avatarUrl: null,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };
}

mock.module("./authentication", {
  namedExports: {
    requireSessionUserId: async () => {
      if (!control.sessionUserId) throw new Error("Authentication required");
      return control.sessionUserId;
    },
  },
});

mock.module("./db", {
  defaultExport: {},
  namedExports: { db: {}, getDb: () => ({}), isDatabaseConfigured: () => true },
});

mock.module("./repositories/users", {
  namedExports: {
    getUserById: async (userId: string) => {
      const record = control.users.get(userId);
      if (!record) throw new Error("User not found");
      return record;
    },
  },
});

mock.module("./repositories/settings", {
  namedExports: {
    getSettingsForUser: async (userId: string) => {
      const record = control.settings.get(userId);
      if (!record) throw new Error("Settings not found");
      return record;
    },
    upsertSettings: async () => ({}),
  },
});

mock.module("./repositories/categories", {
  namedExports: {
    listCategoriesForUser: async (userId: string) =>
      control.categories.filter(
        (category) => category["userId"] === userId || category["userId"] === null,
      ),
    getCategoryForUser: async () => ({}),
  },
});

mock.module("./repositories/transactions", {
  namedExports: {
    listTransactionsForUser: async (userId: string) =>
      control.transactions.filter((transaction) => transaction["userId"] === userId),
    createTransaction: async () => ({}),
    updateTransaction: async () => ({}),
    deleteTransaction: async () => true,
  },
});

mock.module("./repositories/budgets", {
  namedExports: {
    listBudgetsForUser: async (userId: string) =>
      control.budgets.filter((budget) => budget["userId"] === userId),
    createBudget: async () => ({}),
    updateBudget: async () => ({}),
    deleteBudget: async () => true,
  },
});

mock.module("./repositories/goals", {
  namedExports: {
    listGoalsForUser: async (userId: string) =>
      control.goals.filter((goal) => goal["userId"] === userId),
    createGoal: async () => ({}),
    updateGoal: async () => ({}),
    deleteGoal: async () => true,
  },
});

mock.module("./repositories/notifications", {
  namedExports: {
    listNotificationsForUser: async (userId: string) =>
      control.notifications.filter((notification) => notification["userId"] === userId),
    markNotificationRead: async () => ({}),
    markNotificationUnread: async () => ({}),
    markAllNotificationsRead: async () => 0,
    deleteNotification: async () => true,
  },
});

const persistence = await import("./persistence");

function settings(userId: string) {
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
  };
}

beforeEach(() => {
  control.sessionUserId = "user-a";
  control.users.clear();
  control.settings.clear();
  control.categories = [];
  control.transactions = [];
  control.budgets = [];
  control.goals = [];
  control.notifications = [];

  control.users.set("user-a", user("user-a", "secret-a"));
  control.users.set("user-b", user("user-b", "secret-b"));
  control.settings.set("user-a", settings("user-a"));
  control.categories = [
    { id: "category-a", userId: "user-a", name: "Food", type: "expense", color: "#fff", icon: "food" },
    { id: "category-b", userId: "user-b", name: "Travel", type: "expense", color: "#000", icon: "car" },
  ];
  control.transactions = [
    {
      id: "transaction-a",
      userId: "user-a",
      amount: "10.00",
      type: "expense",
      categoryId: "category-a",
      description: "Lunch",
      paymentMethod: "cash",
      occurredOn: "2026-09-25",
      notes: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "transaction-b",
      userId: "user-b",
      amount: "99.00",
      type: "expense",
      categoryId: "category-b",
      description: "Travel",
      paymentMethod: "cash",
      occurredOn: "2026-09-25",
      notes: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
});

describe("personal data export", () => {
  it("exports only the authenticated user's mapped data and no authentication secrets", async () => {
    const exported = await persistence.exportPersonalData();

    assert.equal(exported.profile.id, "user-a");
    assert.equal(exported.transactions.length, 1);
    assert.equal(exported.categories.length, 1);
    assert.equal("passwordHash" in exported.profile, false);
    assert.equal(JSON.stringify(exported).includes("secret-a"), false);
    assert.equal(JSON.stringify(exported).includes("tokenHash"), false);
  });

  it("rejects an unauthenticated export", async () => {
    control.sessionUserId = "";
    await assert.rejects(() => persistence.exportPersonalData(), /Authentication required/);
  });

  it("does not export another user's profile or finance records", async () => {
    const exported = await persistence.exportPersonalData();

    assert.notEqual(exported.profile.id, "user-b");
    assert.equal(exported.transactions.some((item) => item.id === "transaction-b"), false);
    assert.equal(exported.profile.email, "user-a@example.com");
  });
});
