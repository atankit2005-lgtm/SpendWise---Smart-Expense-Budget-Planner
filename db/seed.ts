import { randomUUID } from "node:crypto";

import {
  budgets as seedBudgets,
  categories as seedCategories,
  currentUser,
  goals as seedGoals,
  notifications as seedNotifications,
  transactions as seedTransactions,
} from "../src/data/mock";
import { toDbPaymentMethod } from "../src/server/mappers";
import { getDb, isDatabaseConfigured } from "./index";
import { budgets, categories, goals, notifications, transactions, userSettings, users } from "./schema";

const DEMO_USER_ID = process.env.DEMO_USER_ID?.trim() || "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0001";

const CATEGORY_IDS: Record<string, string> = {
  cat_food: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0101",
  cat_shopping: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0102",
  cat_transport: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0103",
  cat_bills: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0104",
  cat_entertainment: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0105",
  cat_health: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0106",
  cat_rent: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0107",
  cat_salary: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0108",
  cat_freelance: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0109",
  cat_investments: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0110",
};

async function main() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing[0]) {
    console.log("SpendWise database already has users; skipping seed.");
    process.exit(0);
  }

  await db.insert(users).values({
    id: DEMO_USER_ID,
    email: currentUser.email,
    name: currentUser.name,
    phone: currentUser.phone,
    location: currentUser.location,
    occupation: currentUser.occupation,
    currency: currentUser.currency,
  });

  await db.insert(userSettings).values({
    userId: DEMO_USER_ID,
  });

  await db.insert(categories).values(
    seedCategories.map((category) => ({
      id: CATEGORY_IDS[category.id] ?? randomUUID(),
      userId: DEMO_USER_ID,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
    })),
  );

  await db.insert(transactions).values(
    seedTransactions.map((transaction) => ({
      id: randomUUID(),
      userId: DEMO_USER_ID,
      categoryId: CATEGORY_IDS[transaction.categoryId] ?? transaction.categoryId,
      amount: transaction.amount.toFixed(2),
      type: transaction.type,
      description: transaction.description,
      paymentMethod: toDbPaymentMethod(transaction.paymentMethod),
      occurredOn: transaction.date,
      notes: transaction.notes ?? null,
      createdAt: new Date(transaction.createdAt),
    })),
  );

  await db.insert(budgets).values(
    seedBudgets.map((budget) => ({
      id: randomUUID(),
      userId: DEMO_USER_ID,
      categoryId: CATEGORY_IDS[budget.categoryId] ?? budget.categoryId,
      limitAmount: budget.limit.toFixed(2),
      period: budget.period,
      startDate: budget.startDate,
    })),
  );

  await db.insert(goals).values(
    seedGoals.map((goal) => ({
      id: randomUUID(),
      userId: DEMO_USER_ID,
      name: goal.name,
      targetAmount: goal.targetAmount.toFixed(2),
      currentAmount: goal.currentAmount.toFixed(2),
      targetDate: goal.targetDate,
      status: goal.status,
      note: goal.note ?? null,
    })),
  );

  await db.insert(notifications).values(
    seedNotifications.map((notification) => ({
      id: randomUUID(),
      userId: DEMO_USER_ID,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      readAt: notification.read ? new Date(notification.createdAt) : null,
      createdAt: new Date(notification.createdAt),
    })),
  );

  console.log(`Seeded demo user ${DEMO_USER_ID} (${currentUser.email}).`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Database seed failed", error);
  process.exit(1);
});
