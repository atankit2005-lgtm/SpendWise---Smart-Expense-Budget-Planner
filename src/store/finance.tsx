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
const STORAGE_VERSION = 2;

interface PersistedState {
  version?: number;
  user: User;
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  notifications: AppNotification[];
}

function getCurrentMonthRange(reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function deriveBudgetSpentMap(transactions: Transaction[]) {
  const map = new Map<string, number>();

  transactions.forEach((transaction) => {
    if (transaction.type !== "expense") {
      return;
    }

    const current = map.get(transaction.categoryId) ?? 0;
    map.set(transaction.categoryId, current + transaction.amount);
  });

  return map;
}

function normalizeBudgetValues(budgets: Budget[], transactions: Transaction[]) {
  const spentByCategory = deriveBudgetSpentMap(transactions);

  return budgets.map((budget) => ({
    ...budget,
    spent: spentByCategory.get(budget.categoryId) ?? 0,
  }));
}

function normalizePersistedState(parsed: unknown): PersistedState {
  const state = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<PersistedState>;

  const user = state.user ?? currentUser;
  const transactions = Array.isArray(state.transactions) ? state.transactions : seedTransactions;
  const budgets = normalizeBudgetValues(
    Array.isArray(state.budgets) ? state.budgets : seedBudgets,
    transactions,
  );
  const goals = Array.isArray(state.goals) ? state.goals : seedGoals;
  const notifications = Array.isArray(state.notifications) ? state.notifications : seedNotifications;

  return {
    version: STORAGE_VERSION,
    user,
    transactions,
    budgets,
    goals,
    notifications,
  };
}

function loadInitialState(): PersistedState {
  if (typeof window === "undefined") {
    return normalizePersistedState({
      version: STORAGE_VERSION,
      user: currentUser,
      transactions: seedTransactions,
      budgets: seedBudgets,
      goals: seedGoals,
      notifications: seedNotifications,
    });
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      throw new Error("No saved SpendWise state");
    }

    const parsed = JSON.parse(raw);
    return normalizePersistedState(parsed);
  } catch {
    return normalizePersistedState({
      version: STORAGE_VERSION,
      user: currentUser,
      transactions: seedTransactions,
      budgets: seedBudgets,
      goals: seedGoals,
      notifications: seedNotifications,
    });
  }
}

function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;

  try {
    const nextState: PersistedState = {
      ...state,
      version: STORAGE_VERSION,
      budgets: normalizeBudgetValues(state.budgets, state.transactions),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
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

        return prev.map((transaction) =>
          transaction.id === id ? updated : transaction,
        );
      });
    },
    [],
  );

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) =>
      prev.filter((transaction) => transaction.id !== id),
    );
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

  const derivedBudgets = useMemo(
    () => normalizeBudgetValues(budgets, transactions),
    [budgets, transactions],
  );

  useEffect(() => {
    saveState({
      version: STORAGE_VERSION,
      user,
      transactions,
      budgets: derivedBudgets,
      goals,
      notifications,
    });
  }, [
    user,
    transactions,
    derivedBudgets,
    goals,
    notifications,
  ]);

  /* ---------------- DERIVED FINANCE DATA ---------------- */

  const value = useMemo<FinanceContextValue>(() => {
    const { start, end } = getCurrentMonthRange();

    const expenses = transactions
      .filter((transaction) => {
        const dateValue = new Date(`${transaction.date}T00:00:00`);
        return transaction.type === "expense" && dateValue >= start && dateValue <= end;
      })
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const income = transactions
      .filter((transaction) => {
        const dateValue = new Date(`${transaction.date}T00:00:00`);
        return transaction.type === "income" && dateValue >= start && dateValue <= end;
      })
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const calculatedIncome = income || accountSummary.income;
    const calculatedExpenses = expenses || accountSummary.expenses;
    const calculatedSavings = Math.max(0, calculatedIncome - calculatedExpenses);
    const calculatedBalance =
      accountSummary.balance +
      (calculatedIncome - accountSummary.income) -
      (calculatedExpenses - accountSummary.expenses);

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

      budgets: derivedBudgets,
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

    derivedBudgets,
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