import type { AppNotification, Budget, Category, Goal, PaymentMethod, Transaction, User } from "@/types";
import type { BudgetRecord } from "./repositories/budgets";
import type { CategoryRecord } from "./repositories/categories";
import type { GoalRecord } from "./repositories/goals";
import type { NotificationRecord } from "./repositories/notifications";
import type { TransactionRecord } from "./repositories/transactions";
import type { UserRecord } from "./repositories/users";

const PAYMENT_METHOD_TO_DB: Record<PaymentMethod, NonNullable<TransactionRecord["paymentMethod"]>> = {
  UPI: "upi",
  "Credit Card": "credit_card",
  "Debit Card": "debit_card",
  Cash: "cash",
  "Net Banking": "net_banking",
};

const PAYMENT_METHOD_FROM_DB: Record<NonNullable<TransactionRecord["paymentMethod"]>, PaymentMethod> = {
  upi: "UPI",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  cash: "Cash",
  net_banking: "Net Banking",
};

export function toDbPaymentMethod(method: PaymentMethod): NonNullable<TransactionRecord["paymentMethod"]> {
  return PAYMENT_METHOD_TO_DB[method];
}

export function fromDbPaymentMethod(method: TransactionRecord["paymentMethod"]): PaymentMethod {
  return method ? PAYMENT_METHOD_FROM_DB[method] : "UPI";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SW";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function isoDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function toUser(row: UserRecord): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? "",
    location: row.location ?? "",
    currency: row.currency,
    avatarInitials: initialsFromName(row.name),
    memberSince: isoDate(row.createdAt),
    occupation: row.occupation ?? "",
  };
}

export function toCategory(row: CategoryRecord): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color ?? "var(--chart-2)",
    icon: row.icon ?? "circle",
  };
}

export function toTransaction(row: TransactionRecord): Transaction {
  return {
    id: row.id,
    amount: Number(row.amount),
    type: row.type,
    categoryId: row.categoryId,
    description: row.description,
    paymentMethod: fromDbPaymentMethod(row.paymentMethod),
    date: isoDate(row.occurredOn),
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toBudget(row: BudgetRecord): Budget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    limit: Number(row.limitAmount),
    spent: 0,
    period: row.period,
    startDate: isoDate(row.startDate),
    createdAt: isoDate(row.createdAt),
  };
}

export function toGoal(row: GoalRecord): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.targetAmount),
    currentAmount: Number(row.currentAmount),
    targetDate: isoDate(row.targetDate),
    status: row.status,
    note: row.note ?? undefined,
    createdAt: isoDate(row.createdAt),
  };
}

export function toNotification(row: NotificationRecord): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: Boolean(row.readAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export interface FinanceSnapshot {
  user: User;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  notifications: AppNotification[];
}
