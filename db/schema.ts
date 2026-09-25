import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  customType,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string; driverData: string }>({
  dataType() {
  return "citext";
},
});

export const transactionTypeEnum = pgEnum("transaction_type", ["income", "expense"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "upi",
  "credit_card",
  "debit_card",
  "cash",
  "net_banking",
]);
export const budgetPeriodEnum = pgEnum("budget_period", ["weekly", "monthly", "yearly"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "paused", "completed"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "budget_warning",
  "budget_exceeded",
  "unusual_transaction",
  "goal_progress",
  "insight",
]);
export const insightSeverityEnum = pgEnum("insight_severity", [
  "info",
  "positive",
  "warning",
  "critical",
]);
export const analyticsRangeEnum = pgEnum("analytics_range", ["7d", "30d", "3m", "6m", "1y"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    phone: text("phone"),
    location: text("location"),
    occupation: text("occupation"),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/** Opaque, revocable login sessions. Only a SHA-256 digest of the browser token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userExpiresIdx: index("sessions_user_expires_at_idx").on(table.userId, table.expiresAt),
  }),
);

/** One outstanding password-reset token digest per user; raw tokens are never persisted. */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userUniqueIdx: uniqueIndex("password_reset_tokens_user_id_unique_idx").on(table.userId),
    userExpiresIdx: index("password_reset_tokens_user_expires_at_idx").on(
      table.userId,
      table.expiresAt,
    ),
  }),
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: transactionTypeEnum("type").notNull(),
    color: text("color"),
    icon: text("icon"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userNameTypeUniqueIdx: uniqueIndex("categories_user_name_type_unique_idx").on(
      table.userId,
      table.name,
      table.type,
    ),
  }),
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    description: text("description").notNull(),
    paymentMethod: paymentMethodEnum("payment_method"),
    occurredOn: date("occurred_on").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    amountCheck: check("transactions_amount_positive_check", sql`${table.amount} > 0`),
    userOccuredIdx: index("transactions_user_occurred_on_idx").on(
      table.userId,
      table.occurredOn,
    ),
    userCategoryOccuredIdx: index("transactions_user_category_occurred_idx").on(
      table.userId,
      table.categoryId,
      table.occurredOn,
    ),
    userTypeOccuredIdx: index("transactions_user_type_occurred_idx").on(
      table.userId,
      table.type,
      table.occurredOn,
    ),
  }),
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    limitAmount: numeric("limit_amount", { precision: 12, scale: 2 }).notNull(),
    period: budgetPeriodEnum("period").notNull(),
    startDate: date("start_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    limitAmountCheck: check("budgets_limit_amount_positive_check", sql`${table.limitAmount} > 0`),
    userCategoryPeriodStartIdx: uniqueIndex("budgets_user_category_period_start_unique_idx").on(
      table.userId,
      table.categoryId,
      table.period,
      table.startDate,
    ),
  }),
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetAmount: numeric("target_amount", { precision: 12, scale: 2 }).notNull(),
    currentAmount: numeric("current_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    targetDate: date("target_date").notNull(),
    status: goalStatusEnum("status").notNull().default("active"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusDateIdx: index("goals_user_status_target_date_idx").on(
      table.userId,
      table.status,
      table.targetDate,
    ),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userReadCreatedIdx: index("notifications_user_read_created_idx").on(
      table.userId,
      table.readAt,
      table.createdAt,
    ),
  }),
);

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: insightSeverityEnum("severity").notNull(),
    metric: text("metric"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    modelVersion: text("model_version"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    confidenceCheck: check("ai_insights_confidence_range_check", sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
    userGeneratedIdx: index("ai_insights_user_generated_at_idx").on(
      table.userId,
      table.generatedAt,
    ),
  }),
);

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    range: analyticsRangeEnum("range").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    totalIncome: numeric("total_income", { precision: 12, scale: 2 }).notNull(),
    totalExpense: numeric("total_expense", { precision: 12, scale: 2 }).notNull(),
    series: jsonb("series").notNull(),
    breakdown: jsonb("breakdown").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userRangePeriodUniqueIdx: uniqueIndex("analytics_user_range_period_unique_idx").on(
      table.userId,
      table.range,
      table.periodEnd,
    ),
  }),
);

export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    theme: text("theme").notNull().default("dark"),
    compactDensity: boolean("compact_density").notNull().default(false),
    animations: boolean("animations").notNull().default(true),
    budgetAlerts: boolean("budget_alerts").notNull().default(true),
    weeklyDigest: boolean("weekly_digest").notNull().default(false),
    anomalyAlerts: boolean("anomaly_alerts").notNull().default(true),
    shareAnonymised: boolean("share_anonymised").notNull().default(false),
    hideAmounts: boolean("hide_amounts").notNull().default(false),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  },
);
