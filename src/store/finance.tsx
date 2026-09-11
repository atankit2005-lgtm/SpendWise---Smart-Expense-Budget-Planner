import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  accountSummary,
  aiInsights as seedInsights,
  budgets as seedBudgets,
  categories,
  currentUser,
  goals as seedGoals,
  notifications as seedNotifications,
  transactions as seedTransactions,
} from "@/data/mock";
import type { AppNotification, Budget, Goal, Transaction, User } from "@/types";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface FinanceContextValue {
  user: User;
  updateUser: (patch: Partial<User>) => void;
  transactions: Transaction[];
  addTransaction: (input: Omit<Transaction, "id" | "createdAt">) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  budgets: Budget[];
  addBudget: (input: Omit<Budget, "id" | "createdAt">) => void;
  updateBudget: (id: string, patch: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  goals: Goal[];
  addGoal: (input: Omit<Goal, "id" | "createdAt">) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  notifications: AppNotification[];
  toggleNotificationRead: (id: string) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  unreadCount: number;
  insights: typeof seedInsights;
  summary: typeof accountSummary;
  categories: typeof categories;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(currentUser);
  const [transactions, setTransactions] = useState<Transaction[]>(seedTransactions);
  const [budgets, setBudgets] = useState<Budget[]>(seedBudgets);
  const [goals, setGoals] = useState<Goal[]>(seedGoals);
  const [notifications, setNotifications] = useState<AppNotification[]>(seedNotifications);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => ({ ...prev, ...patch }));
  }, []);

  const addTransaction = useCallback((input: Omit<Transaction, "id" | "createdAt">) => {
    const created: Transaction = { ...input, id: uid("txn"), createdAt: new Date().toISOString() };
    setTransactions((prev) => [created, ...prev]);
    if (created.type === "expense") {
      setBudgets((prev) =>
        prev.map((b) => (b.categoryId === created.categoryId ? { ...b, spent: b.spent + created.amount } : b)),
      );
    }
  }, []);

  const updateTransaction = useCallback((id: string, patch: Partial<Transaction>) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addBudget = useCallback((input: Omit<Budget, "id" | "createdAt">) => {
    setBudgets((prev) => [{ ...input, id: uid("bdg"), createdAt: new Date().toISOString() }, ...prev]);
  }, []);
  const updateBudget = useCallback((id: string, patch: Partial<Budget>) => {
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);
  const deleteBudget = useCallback((id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const addGoal = useCallback((input: Omit<Goal, "id" | "createdAt">) => {
    setGoals((prev) => [{ ...input, id: uid("goal"), createdAt: new Date().toISOString() }, ...prev]);
  }, []);
  const updateGoal = useCallback((id: string, patch: Partial<Goal>) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }, []);
  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const toggleNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n)));
  }, []);
  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);
  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const value = useMemo<FinanceContextValue>(() => {
    const expenses = transactions
      .filter((t) => t.type === "expense" && t.date >= "2026-09-01")
      .reduce((s, t) => s + t.amount, 0);
    const income = transactions
      .filter((t) => t.type === "income" && t.date >= "2026-09-01")
      .reduce((s, t) => s + t.amount, 0);
    const summary = {
      ...accountSummary,
      income: income || accountSummary.income,
      expenses: expenses || accountSummary.expenses,
      savings: Math.max(0, (income || accountSummary.income) - (expenses || accountSummary.expenses)),
      balance: accountSummary.balance + (income - accountSummary.income) - (expenses - accountSummary.expenses),
    };
    return {
      user,
      updateUser,
      transactions,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      budgets,
      addBudget,
      updateBudget,
      deleteBudget,
      goals,
      addGoal,
      updateGoal,
      deleteGoal,
      notifications,
      toggleNotificationRead,
      markAllRead,
      deleteNotification,
      unreadCount: notifications.filter((n) => !n.read).length,
      insights: seedInsights,
      summary,
      categories,
    };
  }, [
    user,
    updateUser,
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    budgets,
    addBudget,
    updateBudget,
    deleteBudget,
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
    notifications,
    toggleNotificationRead,
    markAllRead,
    deleteNotification,
  ]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
}
