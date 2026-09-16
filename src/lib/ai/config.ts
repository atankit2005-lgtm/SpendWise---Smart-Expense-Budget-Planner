/**
 * Centralized configuration for SpendWise Intelligence (Stage 4).
 *
 * Every threshold used by the deterministic intelligence layer lives here so
 * behaviour can be tuned in one place instead of scattering magic numbers
 * across modules.
 */
export const AI_CONFIG = {
  categorization: {
    /** Minimum confidence for a rule/history based suggestion to be surfaced. */
    minConfidence: 0.5,
    /** Confidence assigned to a direct merchant/keyword rule match. */
    keywordConfidence: 0.82,
    /** Base confidence for a single historical description match. */
    historyBaseConfidence: 0.55,
    /** Confidence added per additional corroborating historical match. */
    historyConfidencePerMatch: 0.1,
    /** Confidence is capped below 1 to signal this is a suggestion, not certainty. */
    historyConfidenceCap: 0.96,
  },

  patterns: {
    /** Minimum monthly buckets required before a trend can be evaluated. */
    minMonthsForTrend: 3,
    /** Month-over-month growth (as a fraction) considered a rising trend. */
    trendIncreaseThreshold: 0.12,
    /** A transaction at or below this amount counts as a "small" purchase. */
    smallPurchaseAmount: 300,
    /** Minimum small purchases in the lookback window to flag a pattern. */
    smallPurchaseMinCount: 4,
    /** Lookback window (days) used for the frequent small purchase scan. */
    smallPurchaseLookbackDays: 30,
    /** Category spend increase (fraction) vs. the prior period to flag a spike. */
    categorySpikeThreshold: 0.3,
    /** Minimum absolute amount before a category spike is worth surfacing. */
    categorySpikeMinAmount: 500,
    /** Minimum occurrences of a recurring description before it counts as recurring. */
    recurringMinOccurrences: 2,
    /** Relative amount tolerance when matching recurring expense instances. */
    recurringAmountTolerance: 0.15,
    /** Minimum weekend + weekday transactions required to compare behaviour. */
    weekendWeekdayMinSamples: 6,
    /** Relative difference between weekend/weekday averages to flag a pattern. */
    weekendWeekdayDifferenceThreshold: 0.2,
  },

  anomalies: {
    /** Minimum prior expenses in a category before it has a reliable baseline. */
    minSamplesForBaseline: 3,
    /** Standard deviations above the mean considered anomalously large. */
    stdDevMultiplier: 2,
    /** A transaction must also be at least this multiple of the mean to flag. */
    minRatioOfMean: 2,
    /** Months of history compared against the current month for category totals. */
    categoryLookbackMonths: 3,
    /** Increase (fraction) over the trailing average considered an overspend anomaly. */
    categoryOverspendThreshold: 0.5,
    /** Minimum absolute amount before a category overspend is worth surfacing. */
    categoryOverspendMinAmount: 500,
  },

  budgetRisk: {
    /** Projected utilization (%) at or above which a budget is "medium" risk. */
    mediumThreshold: 80,
    /** Projected utilization (%) at or above which a budget is "high" risk. */
    highThreshold: 100,
    /** Minimum elapsed-period fraction used before projecting forward, to avoid
     *  wild extrapolation on day one of a budget period. */
    minElapsedFraction: 0.1,
  },

  healthScore: {
    weights: {
      savingsRate: 30,
      budgetAdherence: 25,
      spendingVolatility: 15,
      expenseIncomeBalance: 15,
      goalProgress: 15,
    },
    /** Savings rate (fraction of income) that earns a full savings-rate score. */
    targetSavingsRate: 0.3,
    /** Expense/income ratio at or below which the balance score is perfect. */
    healthyExpenseRatio: 0.7,
    /** Expense/income ratio at or above which the balance score bottoms out. */
    unhealthyExpenseRatio: 1.1,
    /** Coefficient of variation at/above which volatility score bottoms out. */
    maxVolatilityCoefficient: 0.6,
    /** Neutral score used when there isn't enough history/data for a factor. */
    neutralScore: 65,
    grades: {
      excellent: 85,
      good: 70,
      fair: 50,
      poor: 30,
    },
  },

  forecast: {
    /** Number of completed months averaged to build the moving-average forecast. */
    lookbackMonths: 3,
  },
} as const;

export type AIConfig = typeof AI_CONFIG;
