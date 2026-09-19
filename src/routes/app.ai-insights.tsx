import { createFileRoute } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Info,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/app/app-shell";
import { ChartFrame, MetricCard, Panel, ProgressBar, budgetTone } from "@/components/app/ui-bits";
import { EmptyState } from "@/components/common/state-views";
import { Badge } from "@/components/ui/badge";
import { categoryName } from "@/data/mock";
import { computeCashFlowSeries } from "@/lib/financial-engine";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFinance } from "@/store/finance";

export const Route = createFileRoute("/app/ai-insights")({
  head: () => ({
    meta: [
      { title: "AI Insights — SpendWise" },
      {
        name: "description",
        content: "Spending forecasts, anomaly detection and personalised financial insights.",
      },
      { property: "og:title", content: "AI Insights — SpendWise" },
      {
        property: "og:description",
        content: "Forecasts, anomalies and personalised insights from SpendWise Intelligence.",
      },
    ],
  }),
  component: InsightsPage,
});

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

const severityStyles: Record<string, string> = {
  positive: "border-primary/40 text-primary",
  warning: "border-[var(--warning)]/40 text-[var(--warning)]",
  critical: "border-destructive/40 text-destructive",
  info: "border-border text-muted-foreground",
};

const riskStyles: Record<string, { badge: string; icon: typeof ShieldAlert }> = {
  critical: { badge: "border-destructive/40 text-destructive", icon: ShieldAlert },
  high: { badge: "border-destructive/30 text-destructive", icon: AlertTriangle },
  medium: { badge: "border-[var(--warning)]/40 text-[var(--warning)]", icon: TrendingUp },
  low: { badge: "border-primary/40 text-primary", icon: ShieldCheck },
};

const priorityStyles: Record<string, string> = {
  high: "border-destructive/40 text-destructive",
  medium: "border-[var(--warning)]/40 text-[var(--warning)]",
  low: "border-border text-muted-foreground",
};

const anomalySeverityStyles: Record<string, string> = {
  high: "border-destructive/30 bg-destructive/5 text-destructive",
  medium: "border-[var(--warning)]/30 bg-[var(--warning)]/5 text-[var(--warning)]",
  low: "border-border bg-elevated/40 text-muted-foreground",
};

function monthLabel(bucketKey: string) {
  try {
    return format(parseISO(`${bucketKey}-01`), "MMM");
  } catch {
    return bucketKey;
  }
}

function nextMonthLabel(referenceKey: string) {
  const [year, month] = referenceKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1 + 1, 1));
  return date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

function InsightsPage() {
  const {
    insights,
    transactions,
    budgetRisks,
    anomalies,
    patterns,
    healthScore,
    forecast,
    recommendations,
  } = useFinance();

  const hasEnoughHistory = transactions.length >= 8;

  const monthlySeries = computeCashFlowSeries(transactions, undefined, undefined, "month");
  const chartData: Array<{ label: string; actual: number | null; forecast: number | null }> =
    monthlySeries.slice(-6).map((point, index, arr) => ({
      label: monthLabel(point.label),
      actual: point.expenses,
      forecast: index === arr.length - 1 && forecast.monthsUsed > 0 ? point.expenses : null,
    }));

  if (forecast.monthsUsed > 0) {
    const lastBucket = monthlySeries[monthlySeries.length - 1]?.label ?? "";
    chartData.push({
      label: nextMonthLabel(lastBucket),
      actual: null,
      forecast: forecast.projectedExpenses,
    });
  }

  return (
    <AppShell
      title="AI Insights"
      description="SpendWise Intelligence · deterministic, explainable predictions"
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Financial health score"
            value={`${healthScore.score}/100`}
            hint={healthScore.grade}
            accent
          />
          <MetricCard
            label="Expected spending next period"
            value={forecast.monthsUsed > 0 ? formatINR(forecast.projectedExpenses) : "—"}
            hint={
              forecast.monthsUsed > 0
                ? `based on ${forecast.monthsUsed} month${forecast.monthsUsed === 1 ? "" : "s"}`
                : "not enough history"
            }
          />
          <MetricCard
            label="Anomalies flagged"
            value={String(anomalies.length)}
            hint="detected outside your norm"
          />
        </div>

        <Panel title="Financial health score" description="What's driving your score">
          <div className="grid gap-6 lg:grid-cols-[auto,1fr] lg:items-start">
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-elevated/40 p-6 lg:w-48">
              <p className="text-4xl font-semibold tracking-tight">{healthScore.score}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                out of 100
              </p>
              <Badge variant="outline" className="mt-3 capitalize">
                {healthScore.grade}
              </Badge>
            </div>
            <ul className="space-y-4">
              {healthScore.factors.map((factor) => (
                <li key={factor.key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{factor.label}</span>
                    <span className="text-xs text-muted-foreground">{factor.score}/100</span>
                  </div>
                  <ProgressBar
                    className="mt-2"
                    value={factor.score}
                    tone={
                      factor.score >= 70 ? "primary" : factor.score >= 40 ? "warning" : "danger"
                    }
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">{factor.explanation}</p>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel
          title="Spending forecast"
          description="Actual monthly expenses and a moving-average projection"
        >
          {chartData.length < 2 ? (
            <EmptyState
              title="Not enough history yet"
              description="Add a few months of transactions and SpendWise will project your spending trend."
            />
          ) : (
            <>
              <ChartFrame height={300}>
                <LineChart data={chartData} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatINR(v)} />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ChartFrame>
              <p className="mt-3 text-xs text-muted-foreground">
                Solid line shows recorded monthly expenses; the dashed segment is a simple
                moving-average estimate, not a guarantee.
              </p>
            </>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Spending alerts" description="Anomalies outside your normal pattern">
            {anomalies.length === 0 ? (
              <EmptyState
                title={hasEnoughHistory ? "Nothing unusual" : "Not enough history yet"}
                description={
                  hasEnoughHistory
                    ? "No transactions or categories look out of the ordinary right now."
                    : "Add more transactions and SpendWise will start flagging anomalies."
                }
              />
            ) : (
              <ul className="space-y-3">
                {anomalies.slice(0, 5).map((anomaly) => (
                  <li
                    key={anomaly.id}
                    className={cn("rounded-lg border p-4", anomalySeverityStyles[anomaly.severity])}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4" aria-hidden />
                      <p className="text-sm font-semibold">{anomaly.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed opacity-90">{anomaly.explanation}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Detected patterns" description="Recurring behaviour SpendWise noticed">
            {patterns.length === 0 ? (
              <EmptyState
                title={hasEnoughHistory ? "No patterns yet" : "Not enough history yet"}
                description="Keep logging transactions — patterns need a bit of history to surface reliably."
              />
            ) : (
              <ul className="space-y-3">
                {patterns.slice(0, 5).map((pattern) => (
                  <li
                    key={pattern.id}
                    className="rounded-lg border border-border bg-elevated/40 p-4"
                  >
                    <div className="flex items-center gap-2">
                      {pattern.severity === "critical" || pattern.severity === "warning" ? (
                        <TrendingUp className="size-4 text-[var(--warning)]" aria-hidden />
                      ) : (
                        <Info className="size-4 text-primary" aria-hidden />
                      )}
                      <p className="text-sm font-semibold">{pattern.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {pattern.explanation}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Budget risk" description="Projected end-of-period position per budget">
          {budgetRisks.length === 0 ? (
            <EmptyState
              title="No budgets yet"
              description="Create a budget to get risk projections here."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {budgetRisks.map((risk) => {
                const style = riskStyles[risk.level] ?? riskStyles["low"]!;
                const RiskIcon = style.icon;
                return (
                  <li key={risk.budgetId} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{categoryName(risk.categoryId)}</p>
                      <Badge variant="outline" className={cn("capitalize", style.badge)}>
                        <RiskIcon className="mr-1 size-3" aria-hidden />
                        {risk.level}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Projected {risk.projectedUtilization}% of limit · {risk.utilization}% used so
                      far
                    </p>
                    <ProgressBar
                      className="mt-3"
                      value={risk.projectedUtilization}
                      tone={budgetTone(risk.projectedUtilization)}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">{risk.explanation}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            title="Personalised insights"
            description="Ranked by confidence"
            className="lg:col-span-2"
          >
            {insights.length === 0 ? (
              <EmptyState
                title="No insights yet"
                description="Add more transactions and SpendWise will surface patterns."
              />
            ) : (
              <ul className="space-y-3">
                {insights.map((i) => (
                  <li key={i.id} className="rounded-lg border border-border bg-elevated/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" aria-hidden />
                        <p className="text-sm font-semibold">{i.title}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {i.metric ? (
                          <span className="text-sm font-semibold">{i.metric}</span>
                        ) : null}
                        <Badge variant="outline" className={severityStyles[i.severity]}>
                          {i.severity}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {i.description}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Confidence {Math.round(i.confidence * 100)}%
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recommendations" description="Actionable next steps">
            {recommendations.length === 0 ? (
              <EmptyState
                title="You're on track"
                description="No pressing recommendations right now."
              />
            ) : (
              <ul className="space-y-3">
                {recommendations.slice(0, 5).map((rec) => (
                  <li key={rec.id} className="rounded-lg border border-border bg-elevated/50 p-4">
                    <div className="flex items-start gap-2">
                      <Target className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{rec.title}</p>
                          <Badge
                            variant="outline"
                            className={cn("shrink-0", priorityStyles[rec.priority])}
                          >
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          {rec.detail}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {!hasEnoughHistory ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-card/40 px-4 py-3 text-xs text-muted-foreground">
            <Lightbulb className="size-3.5 shrink-0" aria-hidden />
            SpendWise Intelligence gets sharper with more data — pattern and anomaly detection need
            a bit more transaction history to run reliably.
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
