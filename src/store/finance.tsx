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
import { toast } from "sonner";
import type { AIInsight, AppNotification, Budget, Category, Goal, Transaction, User } from "@/types";
import {
  getFinanceSnapshotFn,
  persistCreateBudgetFn,
  persistCreateGoalFn,
  persistCreateTransactionFn,
  persistDeleteBudgetFn,
  persistDeleteGoalFn,
  persistDeleteNotificationFn,
  persistDeleteTransactionFn,
  persistMarkAllNotificationsReadFn,
  persistToggleNotificationFn,
  persistUpdateBudgetFn,
  persistUpdateGoalFn,
  persistUpdateTransactionFn,
  persistUserFn,
} from "@/functions/finance";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function isPersistedUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
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
  categories: Category[];

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
  const [categoryList, setCategoryList] = useState<Category[]>(categories);
  const [persistenceMode, setPersistenceMode] = useState<"local" | "database">("local");

  useEffect(() => {
    let cancelled = false;

    void getFinanceSnapshotFn()
      .then((result) => {
        if (cancelled || result.mode !== "database" || !result.snapshot) return;
        setPersistenceMode("database");
        setUser(result.snapshot.user);
        setCategoryList(result.snapshot.categories);
        setTransactions(result.snapshot.transactions);
        setBudgets(result.snapshot.budgets.map(normalizeBudget));
        setGoals(result.snapshot.goals);
        setNotifications(result.snapshot.notifications);
      })
      .catch((error) => {
        console.error("SpendWise could not load database persistence; staying on local state.", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- USER ---------------- */

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => ({
      ...prev,
      ...patch,
    }));
    if (persistenceMode === "database") {
      void persistUserFn({ data: patch }).catch(() => {
        toast.error("Could not save profile to the database.");
      });
    }
  }, [persistenceMode]);

  /* ---------------- TRANSACTIONS ---------------- */

  const addTransaction = useCallback((input: Omit<Transaction, "id" | "createdAt">) => {
    setTransactions((prev) => {
      const suggestion = categorizeTransaction(
        { description: input.description, type: input.type, categoryId: input.categoryId },
        prev,
        categoryList,
      );

      const created: Transaction = {
        ...input,
        categoryId: suggestion ? suggestion.categoryId : input.categoryId,
        id: uid("txn"),
        createdAt: new Date().toISOString(),
      };

      if (persistenceMode === "database") {
        void persistCreateTransactionFn({
          data: {
            amount: created.amount,
            type: created.type,
            categoryId: created.categoryId,
            description: created.description,
            paymentMethod: created.paymentMethod,
            date: created.date,
            notes: created.notes,
          },
        })
          .then((saved) => {
            setTransactions((current) => [saved, ...current.filter((transaction) => transaction.id !== created.id)]);
          })
          .catch(() => {
            toast.error("Could not save transaction to the database.");
          });
      }

      return [created, ...prev];
    });
  }, [categoryList, persistenceMode]);

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
        categoryList,
      );

      const updated: Transaction = suggestion
        ? { ...merged, categoryId: suggestion.categoryId }
        : merged;

      if (persistenceMode === "database" && isPersistedUuid(id)) {
        void persistUpdateTransactionFn({ data: { id, patch: updated } }).catch(() => {
          toast.error("Could not update transaction in the database.");
        });
      }

      return prev.map((transaction) => (transaction.id === id ? updated : transaction));
    });
  }, [categoryList, persistenceMode]);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
    if (persistenceMode === "database" && isPersistedUuid(id)) {
      void persistDeleteTransactionFn({ data: { id } }).catch(() => {
        toast.error("Could not delete transaction in the database.");
      });
    }
  }, [persistenceMode]);

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
    if (persistenceMode === "database") {
      void persistCreateBudgetFn({
        data: {
          categoryId: created.categoryId,
          limit: created.limit,
          period: created.period,
          startDate: created.startDate,
        },
      })
        .then((saved) => {
          setBudgets((current) => [saved, ...current.filter((budget) => budget.id !== created.id)]);
        })
        .catch(() => {
          toast.error("Could not save budget to the database.");
        });
    }
  }, [persistenceMode]);

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
    if (persistenceMode === "database" && isPersistedUuid(id)) {
      void persistUpdateBudgetFn({ data: { id, patch } }).catch(() => {
        toast.error("Could not update budget in the database.");
      });
    }
  }, [persistenceMode]);

  const deleteBudget = useCallback((id: string) => {
    setBudgets((prev) => prev.filter((budget) => budget.id !== id));
    if (persistenceMode === "database" && isPersistedUuid(id)) {
      void persistDeleteBudgetFn({ data: { id } }).catch(() => {
        toast.error("Could not delete budget in the database.");
      });
    }
  }, [persistenceMode]);

  /* ---------------- GOALS ---------------- */

  const addGoal = useCallback((input: Omit<Goal, "id" | "createdAt">) => {
    const created: Goal = {
      ...input,
      id: uid("goal"),
      createdAt: new Date().toISOString(),
    };

    setGoals((prev) => [created, ...prev]);
    if (persistenceMode === "database") {
      const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...goalInput } = created;
      void persistCreateGoalFn({ data: goalInput })
        .then((saved) => {
          setGoals((current) => [saved, ...current.filter((goal) => goal.id !== created.id)]);
        })
        .catch(() => {
          toast.error("Could not save goal to the database.");
        });
    }
  }, [persistenceMode]);

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
    if (persistenceMode === "database" && isPersistedUuid(id)) {
      void persistUpdateGoalFn({ data: { id, patch } }).catch(() => {
        toast.error("Could not update goal in the database.");
      });
    }
  }, [persistenceMode]);

  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) => prev.filter((goal) => goal.id !== id));
    if (persistenceMode === "database" && isPersistedUuid(id)) {
      void persistDeleteGoalFn({ data: { id } }).catch(() => {
        toast.error("Could not delete goal in the database.");
      });
    }
  }, [persistenceMode]);

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
    if (persistenceMode === "database" && isPersistedUuid(id)) {
      const current = notifications.find((notification) => notification.id === id);
      void persistToggleNotificationFn({
        data: { id, currentlyRead: current?.read ?? false },
      }).catch(() => {
        toast.error("Could not update notification in the database.");
      });
    }
  }, [notifications, persistenceMode]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notification) => ({
        ...notification,
        read: true,
      })),
    );
    if (persistenceMode === "database") {
      void persistMarkAllNotificationsReadFn().catch(() => {
        toast.error("Could not mark notifications as read in the database.");
      });
    }
  }, [persistenceMode]);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    if (persistenceMode === "database" && isPersistedUuid(id)) {
      void persistDeleteNotificationFn({ data: { id } }).catch(() => {
        toast.error("Could not delete notification in the database.");
      });
    }
  }, [persistenceMode]);

  /* ---------------- LOCAL STORAGE ---------------- */

  useEffect(() => {
    if (persistenceMode === "database") return;
    saveState({
      user,
      transactions,
      budgets,
      goals,
      notifications,
    });
  }, [user, transactions, budgets, goals, notifications, persistenceMode]);

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
        categories: categoryList,
        currentBalance: summary.balance,
      }),
    [transactions, derivedBudgets, goals, summary.balance, categoryList],
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
          title: `${categoryList.find((category) => category.id === risk.categoryId)?.name ?? categoryName(risk.categoryId)} budget exceeded`,
          message: risk.explanation,
          read: false,
          createdAt,
        });
      } else if (risk.level === "high") {
        candidates.push({
          id: `ai_budget_${risk.budgetId}_high`,
          type: "budget_warning",
          title: `${categoryList.find((category) => category.id === risk.categoryId)?.name ?? categoryName(risk.categoryId)} budget at risk`,
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
  }, [intelligence, categoryList]);

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
      categories: categoryList,

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
    categoryList,
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
