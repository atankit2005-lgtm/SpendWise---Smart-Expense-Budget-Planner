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
  budgets as seedBudgets,
  categories,
  categoryName,
  currentUser,
  goals as seedGoals,
  notifications as seedNotifications,
  transactions as seedTransactions,
} from "@/data/mock";
import {
  categorizeTransaction,
  computeFinancialIntelligence,
  intelligenceEvents,
  type AnomalyResult,
  type BudgetRiskResult,
  type ForecastResult,
  type HealthScoreResult,
  type Recommendation,
  type SpendingPattern,
} from "@/lib/ai";
import {
  computeBalanceDelta,
  computeBudgetSpendingMap,
  computeSavings,
  sumExpensesForRange,
  sumIncomeForRange,
} from "@/lib/financial-engine";
import type { AIInsight, AppNotification, Budget, Goal, Transaction, User } from "@/types";

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
  insights: AIInsight[];
  summary: typeof accountSummary;
  categories: typeof categories;

  /** SpendWise Intelligence (Stage 4) — deterministic, derived from the data above. */
  patterns: SpendingPattern[];
  anomalies: AnomalyResult[];
  budgetRisks: BudgetRiskResult[];
  healthScore: HealthScoreResult;
  forecast: ForecastResult;
  recommendations: Recommendation[];
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

      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : seedTransactions,

      budgets: Array.isArray(parsed.budgets)
        ? parsed.budgets.map(normalizeBudget)
        : seedBudgets.map(normalizeBudget),

      goals: Array.isArray(parsed.goals) ? parsed.goals : seedGoals,

      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : seedNotifications,
    };
  } catch {
    return {
      user: currentUser,
      transactions: seedTransactions,
      budgets: seedBudgets.map(normalizeBudget),
      goals: seedGoals,
      notifications: seedNotifications,
    };
  }
}

function normalizeBudget(raw: Budget): Budget {
  return {
    ...raw,
    spent: 0,
  };
}

function persistableBudgets(budgets: Budget[]): Budget[] {
  return budgets.map((budget) => ({
    ...budget,
    spent: 0,
  }));
}

function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        budgets: persistableBudgets(state.budgets),
      }),
    );
  } catch {
    // Gracefully ignore localStorage errors.
  }
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const initialState = loadInitialState();

  const [user, setUser] = useState<User>(initialState.user);

  const [transactions, setTransactions] = useState<Transaction[]>(initialState.transactions);

  const [budgets, setBudgets] = useState<Budget[]>(initialState.budgets.map(normalizeBudget));

  const [goals, setGoals] = useState<Goal[]>(initialState.goals);

  const [notifications, setNotifications] = useState<AppNotification[]>(initialState.notifications);

  /* ---------------- USER ---------------- */

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => ({
      ...prev,
      ...patch,
    }));
  }, []);

  /* ---------------- TRANSACTIONS ---------------- */

  const addTransaction = useCallback((input: Omit<Transaction, "id" | "createdAt">) => {
    setTransactions((prev) => {
      const suggestion = categorizeTransaction(
        { description: input.description, type: input.type, categoryId: input.categoryId },
        prev,
        categories,
      );

      const created: Transaction = {
        ...input,
        categoryId: suggestion ? suggestion.categoryId : input.categoryId,
        id: uid("txn"),
        createdAt: new Date().toISOString(),
      };

      return [created, ...prev];
    });
  }, []);

  const updateTransaction = useCallback((id: string, patch: Partial<Transaction>) => {
    setTransactions((prev) => {
      const existing = prev.find((transaction) => transaction.id === id);

      if (!existing) {
        return prev;
      }

      const merged: Transaction = {
        ...existing,
        ...patch,
      };

      // Only ever fills in a missing category — a category the user already
      // chose (whether before or as part of this edit) is never overwritten.
      const suggestion = categorizeTransaction(
        { description: merged.description, type: merged.type, categoryId: merged.categoryId },
        prev,
        categories,
      );

      const updated: Transaction = suggestion
        ? { ...merged, categoryId: suggestion.categoryId }
        : merged;

      return prev.map((transaction) => (transaction.id === id ? updated : transaction));
    });
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
  }, []);

  /* ---------------- BUDGETS ---------------- */

  const addBudget = useCallback((input: Omit<Budget, "id" | "createdAt">) => {
    const { spent: _ignoredSpent, ...rest } = input;

    const created: Budget = {
      ...rest,
      spent: 0,
      id: uid("bdg"),
      createdAt: new Date().toISOString(),
    };

    setBudgets((prev) => [created, ...prev]);
  }, []);

  const updateBudget = useCallback((id: string, patch: Partial<Budget>) => {
    setBudgets((prev) =>
      prev.map((budget) =>
        budget.id === id
          ? {
              ...budget,
              ...patch,
              spent: 0,
            }
          : budget,
      ),
    );
  }, []);

  const deleteBudget = useCallback((id: string) => {
    setBudgets((prev) => prev.filter((budget) => budget.id !== id));
  }, []);

  /* ---------------- GOALS ---------------- */

  const addGoal = useCallback((input: Omit<Goal, "id" | "createdAt">) => {
    const created: Goal = {
      ...input,
      id: uid("goal"),
      createdAt: new Date().toISOString(),
    };

    setGoals((prev) => [created, ...prev]);
  }, []);

  const updateGoal = useCallback((id: string, patch: Partial<Goal>) => {
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
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) => prev.filter((goal) => goal.id !== id));
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
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
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
  }, [user, transactions, budgets, goals, notifications]);

  /* ---------------- DERIVED FINANCE DATA ---------------- */

  const derivedBudgets = useMemo(() => {
    const spendByBudgetId = computeBudgetSpendingMap(budgets, transactions);
    return budgets.map((budget) => ({
      ...budget,
      spent: spendByBudgetId[budget.id] ?? 0,
    }));
  }, [budgets, transactions]);

  const summary = useMemo(() => {
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

    const calculatedIncome = sumIncomeForRange(transactions, monthStart, monthEnd);
    const calculatedExpenses = sumExpensesForRange(transactions, monthStart, monthEnd);
    const calculatedSavings = computeSavings(calculatedIncome, calculatedExpenses);

    const calculatedBalance =
      accountSummary.balance +
      computeBalanceDelta(calculatedIncome, calculatedExpenses) -
      computeBalanceDelta(accountSummary.income, accountSummary.expenses);

    return {
      ...accountSummary,
      income: calculatedIncome,
      expenses: calculatedExpenses,
      savings: calculatedSavings,
      balance: calculatedBalance,
    };
  }, [transactions]);

  /* ---------------- SPENDWISE INTELLIGENCE (STAGE 4) ---------------- */
  // Always a pure derivation of the transactions/budgets/goals above — no
  // intelligence-specific state is stored, so it can never drift out of
  // sync with the source financial data.

  const intelligence = useMemo(
    () =>
      computeFinancialIntelligence({
        transactions,
        budgets: derivedBudgets,
        goals,
        categories,
        currentBalance: summary.balance,
      }),
    [transactions, derivedBudgets, goals, summary.balance],
  );

  // Lightweight pub/sub notification so other parts of the app (or future
  // surfaces) can react to a fresh intelligence snapshot without every
  // consumer wiring into FinanceContext directly.
  useEffect(() => {
    intelligenceEvents.emit({
      type: "intelligence:updated",
      payload: {
        insightCount: intelligence.insights.length,
        anomalyCount: intelligence.anomalies.length,
        criticalBudgetRisks: intelligence.budgetRisks.filter((r) => r.level === "critical").length,
        healthScore: intelligence.healthScore.score,
      },
    });
  }, [intelligence]);

  useEffect(() => {
    intelligenceEvents.emit({ type: "transactions:changed" });
  }, [transactions]);

  useEffect(() => {
    intelligenceEvents.emit({ type: "budgets:changed" });
  }, [budgets]);

  useEffect(() => {
    intelligenceEvents.emit({ type: "goals:changed" });
  }, [goals]);

  // Surface the most important detected risks/anomalies through the existing
  // notification center. Every AI-generated notification has a stable,
  // deterministic id (derived from the underlying budget/anomaly id), so
  // re-running this effect after every recompute never creates duplicates —
  // the state update itself is skipped whenever there's nothing new to add.
  useEffect(() => {
    const candidates: AppNotification[] = [];
    const createdAt = new Date().toISOString();

    intelligence.budgetRisks.forEach((risk) => {
      if (risk.level === "critical") {
        candidates.push({
          id: `ai_budget_${risk.budgetId}_critical`,
          type: "budget_exceeded",
          title: `${categoryName(risk.categoryId)} budget exceeded`,
          message: risk.explanation,
          read: false,
          createdAt,
        });
      } else if (risk.level === "high") {
        candidates.push({
          id: `ai_budget_${risk.budgetId}_high`,
          type: "budget_warning",
          title: `${categoryName(risk.categoryId)} budget at risk`,
          message: risk.explanation,
          read: false,
          createdAt,
        });
      }
    });

    intelligence.anomalies.forEach((anomaly) => {
      if (anomaly.severity === "high") {
        candidates.push({
          id: `ai_anomaly_${anomaly.id}`,
          type: "unusual_transaction",
          title: anomaly.title,
          message: anomaly.explanation,
          read: false,
          createdAt,
        });
      }
    });

    if (candidates.length === 0) return;

    setNotifications((prev) => {
      const existingIds = new Set(prev.map((notification) => notification.id));
      const fresh = candidates.filter((candidate) => !existingIds.has(candidate.id));
      // Returning the same array reference (implicitly, by early return) when
      // there's nothing new avoids an unnecessary state update/render.
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev];
    });
  }, [intelligence]);

  const value = useMemo<FinanceContextValue>(() => {
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

      unreadCount: notifications.filter((notification) => !notification.read).length,

      insights: intelligence.insights,
      summary,
      categories,

      patterns: intelligence.patterns,
      anomalies: intelligence.anomalies,
      budgetRisks: intelligence.budgetRisks,
      healthScore: intelligence.healthScore,
      forecast: intelligence.forecast,
      recommendations: intelligence.recommendations,
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

    intelligence,
    summary,
  ]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);

  if (!ctx) {
    throw new Error("useFinance must be used inside FinanceProvider");
  }

  return ctx;
}
