import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
import {
  computeBalanceDelta,
  computeSavings,
  sumExpensesForRange,
  sumIncomeForRange,
} from "@/lib/financial-engine";
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

const STORAGE_KEY = "spendwise-mock-state";

interface PersistedState {
  user: User;
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  notifications: AppNotification[];
}

function loadInitialState(): PersistedState {
  if (typeof window === "undefined") {
    return {
      user: currentUser,
      transactions: seedTransactions,
      budgets: seedBudgets,
      goals: seedGoals,
      notifications: seedNotifications,
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      throw new Error("No saved SpendWise state");
    }

    const parsed = JSON.parse(raw);

    return {
      user: parsed.user ?? currentUser,

      transactions: Array.isArray(parsed.transactions)
        ? parsed.transactions
        : seedTransactions,

      budgets: Array.isArray(parsed.budgets)
        ? parsed.budgets
        : seedBudgets,

      goals: Array.isArray(parsed.goals)
        ? parsed.goals
        : seedGoals,

      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications
        : seedNotifications,
    };
  } catch {
    return {
      user: currentUser,
      transactions: seedTransactions,
      budgets: seedBudgets,
      goals: seedGoals,
      notifications: seedNotifications,
    };
  }
}

function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Gracefully ignore localStorage errors.
  }
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const initialState = loadInitialState();

  const [user, setUser] = useState<User>(initialState.user);

  const [transactions, setTransactions] = useState<Transaction[]>(
    initialState.transactions,
  );

  const [budgets, setBudgets] = useState<Budget[]>(
    initialState.budgets,
  );

  const [goals, setGoals] = useState<Goal[]>(
    initialState.goals,
  );

  const [notifications, setNotifications] = useState<AppNotification[]>(
    initialState.notifications,
  );

  /* ---------------- USER ---------------- */

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => ({
      ...prev,
      ...patch,
    }));
  }, []);

  /* ---------------- TRANSACTIONS ---------------- */

  const addTransaction = useCallback(
    (input: Omit<Transaction, "id" | "createdAt">) => {
      const created: Transaction = {
        ...input,
        id: uid("txn"),
        createdAt: new Date().toISOString(),
      };

      setTransactions((prev) => [created, ...prev]);

      // If this is an expense, increase the corresponding budget's spent amount.
      if (created.type === "expense") {
        setBudgets((prev) =>
          prev.map((budget) =>
            budget.categoryId === created.categoryId
              ? {
                  ...budget,
                  spent: budget.spent + created.amount,
                }
              : budget,
          ),
        );
      }
    },
    [],
  );

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      setTransactions((prev) => {
        const existing = prev.find((transaction) => transaction.id === id);

        if (!existing) {
          return prev;
        }

        const updated: Transaction = {
          ...existing,
          ...patch,
        };

        /*
         * Keep budget spending synchronized with the transaction change.
         *
         * We first remove the old expense amount from its old category,
         * then add the new expense amount to its new category.
         */
        setBudgets((currentBudgets) => {
          let nextBudgets = currentBudgets;

          // Remove the old transaction's budget impact.
          if (existing.type === "expense") {
            nextBudgets = nextBudgets.map((budget) =>
              budget.categoryId === existing.categoryId
                ? {
                    ...budget,
                    spent: Math.max(
                      0,
                      budget.spent - existing.amount,
                    ),
                  }
                : budget,
            );
          }

          // Apply the updated transaction's budget impact.
          if (updated.type === "expense") {
            nextBudgets = nextBudgets.map((budget) =>
              budget.categoryId === updated.categoryId
                ? {
                    ...budget,
                    spent: budget.spent + updated.amount,
                  }
                : budget,
            );
          }

          return nextBudgets;
        });

        return prev.map((transaction) =>
          transaction.id === id ? updated : transaction,
        );
      });
    },
    [],
  );

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => {
      const transactionToDelete = prev.find(
        (transaction) => transaction.id === id,
      );

      if (!transactionToDelete) {
        return prev;
      }

      // Remove the deleted expense from its budget.
      if (transactionToDelete.type === "expense") {
        setBudgets((currentBudgets) =>
          currentBudgets.map((budget) =>
            budget.categoryId === transactionToDelete.categoryId
              ? {
                  ...budget,
                  spent: Math.max(
                    0,
                    budget.spent - transactionToDelete.amount,
                  ),
                }
              : budget,
          ),
        );
      }

      return prev.filter((transaction) => transaction.id !== id);
    });
  }, []);

  /* ---------------- BUDGETS ---------------- */

  const addBudget = useCallback(
    (input: Omit<Budget, "id" | "createdAt">) => {
      const created: Budget = {
        ...input,
        id: uid("bdg"),
        createdAt: new Date().toISOString(),
      };

      setBudgets((prev) => [created, ...prev]);
    },
    [],
  );

  const updateBudget = useCallback(
    (id: string, patch: Partial<Budget>) => {
      setBudgets((prev) =>
        prev.map((budget) =>
          budget.id === id
            ? {
                ...budget,
                ...patch,
              }
            : budget,
        ),
      );
    },
    [],
  );

  const deleteBudget = useCallback((id: string) => {
    setBudgets((prev) =>
      prev.filter((budget) => budget.id !== id),
    );
  }, []);

  /* ---------------- GOALS ---------------- */

  const addGoal = useCallback(
    (input: Omit<Goal, "id" | "createdAt">) => {
      const created: Goal = {
        ...input,
        id: uid("goal"),
        createdAt: new Date().toISOString(),
      };

      setGoals((prev) => [created, ...prev]);
    },
    [],
  );

  const updateGoal = useCallback(
    (id: string, patch: Partial<Goal>) => {
      setGoals((prev) =>
        prev.map((goal) =>
          goal.id === id
            ? {
                ...goal,
                ...patch,
              }
            : goal,
        ),
      );
    },
    [],
  );

  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) =>
      prev.filter((goal) => goal.id !== id),
    );
  }, []);

  /* ---------------- NOTIFICATIONS ---------------- */

  const toggleNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id
          ? {
              ...notification,
              read: !notification.read,
            }
          : notification,
      ),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notification) => ({
        ...notification,
        read: true,
      })),
    );
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id),
    );
  }, []);

  /* ---------------- LOCAL STORAGE ---------------- */

  useEffect(() => {
    saveState({
      user,
      transactions,
      budgets,
      goals,
      notifications,
    });
  }, [
    user,
    transactions,
    budgets,
    goals,
    notifications,
  ]);

  /* ---------------- DERIVED FINANCE DATA ---------------- */

  const value = useMemo<FinanceContextValue>(() => {
    const formatDateValue = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const currentMonthEnd = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() + 1,
      0,
    );

    const monthStart = formatDateValue(currentMonthStart);
    const monthEnd = formatDateValue(currentMonthEnd);

    const calculatedIncome = sumIncomeForRange(
      transactions,
      monthStart,
      monthEnd,
    );
    const calculatedExpenses = sumExpensesForRange(
      transactions,
      monthStart,
      monthEnd,
    );
    const calculatedSavings = computeSavings(
      calculatedIncome,
      calculatedExpenses,
    );

    const calculatedBalance =
      accountSummary.balance +
      computeBalanceDelta(calculatedIncome, calculatedExpenses) -
      computeBalanceDelta(
        accountSummary.income,
        accountSummary.expenses,
      );

    const summary = {
      ...accountSummary,
      income: calculatedIncome,
      expenses: calculatedExpenses,
      savings: calculatedSavings,
      balance: calculatedBalance,
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

      unreadCount: notifications.filter(
        (notification) => !notification.read,
      ).length,

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

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);

  if (!ctx) {
    throw new Error(
      "useFinance must be used inside FinanceProvider",
    );
  }

  return ctx;
}