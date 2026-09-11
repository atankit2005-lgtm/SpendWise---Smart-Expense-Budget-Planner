export type TransactionType = "income" | "expense";

export type PaymentMethod = "UPI" | "Credit Card" | "Debit Card" | "Cash" | "Net Banking";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  currency: string;
  avatarInitials: string;
  memberSince: string;
  occupation: string;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  description: string;
  paymentMethod: PaymentMethod;
  date: string; // ISO yyyy-mm-dd
  notes?: string | undefined;
  createdAt: string;
}

export type BudgetPeriod = "monthly" | "weekly" | "yearly";

export interface Budget {
  id: string;
  categoryId: string;
  limit: number;
  spent: number;
  period: BudgetPeriod;
  startDate: string;
  createdAt: string;
}

export type GoalStatus = "active" | "completed" | "paused";

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  categoryId?: string | undefined;
  status: GoalStatus;
  note?: string | undefined;
  createdAt: string;
}

export type NotificationType =
  | "budget_warning"
  | "budget_exceeded"
  | "unusual_transaction"
  | "goal_progress"
  | "insight";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

export interface AIInsight {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  metric?: string | undefined;
  confidence: number; // 0-1
  createdAt: string;
}

export interface SeriesPoint {
  label: string;
  spending: number;
  income: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

export type TimeRange = "7d" | "30d" | "3m" | "6m" | "1y";

export interface AnalyticsData {
  range: TimeRange;
  series: SeriesPoint[];
  breakdown: CategoryBreakdownItem[];
  totalSpent: number;
  totalIncome: number;
  averageDaily: number;
  topCategory: string;
}
