import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouterState } from "@tanstack/react-router";
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
  computeBudgetSpendingMap,
  computeFinanceSummary,
  type FinanceSummary,
} from "@/lib/financial-engine";
import { toast } from "sonner";
import type {
  AIInsight,
  AppNotification,
  Budget,
  Category,
  Goal,
  Transaction,
  User,
  UserPreferences,
} from "@/types";
import type { FinanceSnapshot } from "@/server/mappers";
import { createRealtimeSync } from "@/lib/realtime/client";
import { onSessionEnded } from "@/lib/realtime/session-signal";
import { snapshotToState } from "./snapshot-state";
import {
  buildDerivedNotificationCandidates,
  combineNotifications,
  mergeDerivedNotifications,
} from "./derived-notifications";
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
  persistPreferencesFn,
  persistToggleNotificationFn,
  persistUpdateBudgetFn,
  persistUpdateGoalFn,
  persistUpdateTransactionFn,
  persistUserFn,
} from "@/functions/finance";
import {
  emptyFinanceState,
  financeStatusForSnapshotFailure,
  shouldLoadFinanceSnapshot,
  type FinanceLoadStatus,
} from "./finance-load";
import { createFinanceSnapshotRequestGuard } from "./finance-request-guard";
import { applyPersistedUpdate } from "./settings-persistence";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function isPersistedUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export interface FinanceContextValue {
  user: User;
  updateUser: (patch: Partial<User>) => Promise<void>;

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
  summary: FinanceSummary;
  categories: Category[];

  /** Persisted per-user preferences (user_settings). Loaded via the snapshot. */
  preferences: UserPreferences;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;

  /** SpendWise Intelligence (Stage 4) — deterministic, derived from the data above. */
  patterns: SpendingPattern[];
  anomalies: AnomalyResult[];
  budgetRisks: BudgetRiskResult[];
  healthScore: HealthScoreResult;
  forecast: ForecastResult;
  recommendations: Recommendation[];

  /** Snapshot load: ready = DB state; error = failed authenticated load (not mock data). */
  financeStatus: FinanceLoadStatus;
  retryFinanceLoad: () => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

function normalizeBudget(raw: Budget): Budget {
  return {
    ...raw,
    spent: 0,
  };
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const inApp = useRouterState({ select: (s) => s.location.pathname.startsWith("/app") });
  const initialState = emptyFinanceState();

  const [user, setUser] = useState<User>(initialState.user);

  const [transactions, setTransactions] = useState<Transaction[]>(initialState.transactions);

  const [budgets, setBudgets] = useState<Budget[]>(initialState.budgets.map(normalizeBudget));

  const [goals, setGoals] = useState<Goal[]>(initialState.goals);

  const [notifications, setNotifications] = useState<AppNotification[]>(initialState.notifications);
  const [categoryList, setCategoryList] = useState<Category[]>(initialState.categories);
  const [preferences, setPreferences] = useState<UserPreferences>(initialState.preferences);
  const [financeStatus, setFinanceStatus] = useState<FinanceLoadStatus>("loading");
  const [loadGeneration, setLoadGeneration] = useState(0);
  const snapshotRequestGuard = useRef(createFinanceSnapshotRequestGuard());
  // Derived AI notifications live in their own lane so the snapshot refetch
  // (which replaces persisted state wholesale) cannot wipe them, reset their
  // read flags, or resurrect dismissed ones. See derived-notifications.ts.
  const [derivedNotifications, setDerivedNotifications] = useState<AppNotification[]>([]);
  const [dismissedDerivedIds, setDismissedDerivedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Set only after the authenticated snapshot load succeeds, so it doubles as
  // "there is a valid session" — the gate for the realtime SSE connection.
  // Logged-out visitors (public pages) never load a snapshot and never
  // connect. A successful load with a different user id replaces it, which
  // re-runs the realtime effect: old connection closed, new one opened.
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);
  // All mutations in protected screens target the server. This constant keeps
  // the existing optimistic UI behavior while removing the local fallback.
  const persistenceMode = "database" as const;

  const applySnapshot = useCallback((snapshot: FinanceSnapshot) => {
    const state = snapshotToState(snapshot);
    setUser(state.user);
    setCategoryList(state.categories);
    setTransactions(state.transactions);
    setBudgets(state.budgets);
    setGoals(state.goals);
    setNotifications(state.notifications);
    setPreferences(state.preferences);
    setAuthedUserId(state.user.id);
    setFinanceStatus("ready");
  }, []);

  const applyEmptyFinanceState = useCallback(() => {
    const empty = emptyFinanceState();
    setUser(empty.user);
    setCategoryList(empty.categories);
    setTransactions(empty.transactions);
    setBudgets(empty.budgets);
    setGoals(empty.goals);
    setNotifications(empty.notifications);
    setPreferences(empty.preferences);
    setDerivedNotifications([]);
    setDismissedDerivedIds(new Set());
    setAuthedUserId(null);
  }, []);

  const retryFinanceLoad = useCallback(() => {
    setFinanceStatus("loading");
    setLoadGeneration((generation) => generation + 1);
  }, []);

  useEffect(() => {
    if (!shouldLoadFinanceSnapshot(inApp)) return;

    let cancelled = false;
    const requestGeneration = snapshotRequestGuard.current.begin();
    setFinanceStatus("loading");

    void getFinanceSnapshotFn()
      .then((result) => {
        if (cancelled || !snapshotRequestGuard.current.isCurrent(requestGeneration)) return;
        applySnapshot(result.snapshot);
      })
      .catch((error) => {
        if (cancelled || !snapshotRequestGuard.current.isCurrent(requestGeneration)) return;
        console.error("SpendWise could not load authenticated data.", error);
        applyEmptyFinanceState();
        setFinanceStatus(financeStatusForSnapshotFailure(error));
      });

    return () => {
      cancelled = true;
      snapshotRequestGuard.current.invalidate();
    };
  }, [applySnapshot, applyEmptyFinanceState, inApp, loadGeneration]);

  // Stage 6.3: realtime invalidation. Each supported SSE event means "the
  // authoritative persisted state changed somewhere" — possibly in another
  // tab or session — so the response is always the same: refetch the snapshot
  // through the existing server function and replace base state wholesale.
  // This path only ever reads; it never calls a persistence mutation, so it
  // cannot feed back into the server-side publisher and create a loop.
  useEffect(() => {
    if (!authedUserId) return;

    const sync = createRealtimeSync({
      onInvalidation: async () => {
        const requestGeneration = snapshotRequestGuard.current.begin();
        try {
          const result = await getFinanceSnapshotFn();
          if (!snapshotRequestGuard.current.isCurrent(requestGeneration)) return;
          applySnapshot(result.snapshot);
        } catch (error) {
          if (!snapshotRequestGuard.current.isCurrent(requestGeneration)) return;
          console.error("SpendWise could not refresh authenticated data.", error);
          applyEmptyFinanceState();
          setFinanceStatus(financeStatusForSnapshotFailure(error));
        }
      },
    });

    return () => {
      sync.close();
      snapshotRequestGuard.current.invalidate();
    };
  }, [authedUserId, applyEmptyFinanceState, applySnapshot]);

  // Stage 6.4: logout is a client-side navigation and this root-level
  // provider stays mounted across it, so the session-ended signal is what
  // drops the authenticated state here. That closes the SSE connection and
  // cancels any pending reconnect timer via the realtime effect's cleanup.
  useEffect(
    () =>
      onSessionEnded(() => {
        snapshotRequestGuard.current.invalidate();
        applyEmptyFinanceState();
        setFinanceStatus("guest");
      }),
    [applyEmptyFinanceState],
  );

  /* ---------------- USER ---------------- */

  const updateUser = useCallback(async (patch: Partial<User>) => {
    const previous = user;
    if (persistenceMode !== "database") {
      setUser({ ...previous, ...patch });
      return;
    }

    await applyPersistedUpdate(
      previous,
      { ...previous, ...patch },
      () => persistUserFn({ data: patch }),
      setUser,
    );
  }, [persistenceMode, user]);

  /* ---------------- PREFERENCES ---------------- */

  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const previous = preferences;
    if (persistenceMode !== "database") {
      setPreferences({ ...previous, ...patch });
      return;
    }

    await applyPersistedUpdate(
      previous,
      { ...previous, ...patch },
      () => persistPreferencesFn({ data: patch }),
      setPreferences,
    );
  }, [persistenceMode, preferences]);

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
    if (!isPersistedUuid(id)) {
      setDerivedNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, read: !notification.read } : notification,
        ),
      );
      return;
    }

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
    if (persistenceMode === "database") {
      const current = notifications.find((notification) => notification.id === id);
      void persistToggleNotificationFn({
        data: { id, currentlyRead: current?.read ?? false },
      }).catch(() => {
        toast.error("Could not update notification in the database.");
      });
    }
  }, [notifications, persistenceMode]);

  const markAllRead = useCallback(() => {
    setDerivedNotifications((prev) =>
      prev.map((notification) => ({
        ...notification,
        read: true,
      })),
    );
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
    if (!isPersistedUuid(id)) {
      // Dismissals are remembered by id, so a later recompute/refetch of the
      // same underlying condition never resurrects a deleted derived alert.
      setDerivedNotifications((prev) => prev.filter((notification) => notification.id !== id));
      setDismissedDerivedIds((prev) => new Set(prev).add(id));
      return;
    }

    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    if (persistenceMode === "database") {
      void persistDeleteNotificationFn({ data: { id } }).catch(() => {
        toast.error("Could not delete notification in the database.");
      });
    }
  }, [persistenceMode]);

  /* ---------------- DERIVED FINANCE DATA ---------------- */

  const derivedBudgets = useMemo(() => {
    const spendByBudgetId = computeBudgetSpendingMap(budgets, transactions);
    return budgets.map((budget) => ({
      ...budget,
      spent: spendByBudgetId[budget.id] ?? 0,
    }));
  }, [budgets, transactions]);

  // Headline figures derived entirely from the authenticated user's real
  // transactions — no mock anchor. balance = lifetime income - expenses;
  // income/expenses/savings cover the current calendar month. See
  // computeFinanceSummary for the exact domain semantics.
  const summary = useMemo(() => computeFinanceSummary(transactions), [transactions]);

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
  // the merge is skipped whenever there's nothing new to add, and dismissed
  // ids never come back. Derived notifications live outside the persisted
  // lane, so a snapshot refetch cannot wipe them or reset their read state.
  useEffect(() => {
    const candidates = buildDerivedNotificationCandidates(
      {
        budgetRisks: intelligence.budgetRisks,
        anomalies: intelligence.anomalies,
        categories: categoryList,
      },
      new Date().toISOString(),
    );

    if (candidates.length === 0) return;

    setDerivedNotifications((prev) => mergeDerivedNotifications(prev, candidates, dismissedDerivedIds));
  }, [intelligence, categoryList, dismissedDerivedIds]);

  // Display list = derived AI alerts (own lane, survives refetch) followed by
  // the persisted notifications exactly as the snapshot delivered them.
  const allNotifications = useMemo(
    () => combineNotifications(derivedNotifications, notifications),
    [derivedNotifications, notifications],
  );

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

      notifications: allNotifications,
      toggleNotificationRead,
      markAllRead,
      deleteNotification,

      unreadCount: allNotifications.filter((notification) => !notification.read).length,

      insights: intelligence.insights,
      summary,
      categories: categoryList,

      preferences,
      updatePreferences,

      patterns: intelligence.patterns,
      anomalies: intelligence.anomalies,
      budgetRisks: intelligence.budgetRisks,
      healthScore: intelligence.healthScore,
      forecast: intelligence.forecast,
      recommendations: intelligence.recommendations,
      financeStatus,
      retryFinanceLoad,
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

    allNotifications,
    toggleNotificationRead,
    markAllRead,
    deleteNotification,

    intelligence,
    summary,
    categoryList,
    preferences,
    updatePreferences,
    financeStatus,
    retryFinanceLoad,
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
