import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Sparkles, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/app/app-shell";
import { ChartFrame, MetricCard, Panel, ProgressBar, budgetTone } from "@/components/app/ui-bits";
import { EmptyState } from "@/components/common/state-views";
import { Badge } from "@/components/ui/badge";
import { categoryName, spendingForecast } from "@/data/mock";
import { formatINR } from "@/lib/format";
import { useFinance } from "@/store/finance";

export const Route = createFileRoute("/app/ai-insights")({
  head: () => ({
    meta: [
      { title: "AI Insights — SpendWise" },
      { name: "description", content: "Spending forecasts, anomaly detection and personalised financial insights." },
      { property: "og:title", content: "AI Insights — SpendWise" },
      { property: "og:description", content: "Forecasts, anomalies and personalised insights from SpendWise Intelligence." },
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

function InsightsPage() {
  const { insights, budgets } = useFinance();

  return (
    <AppShell title="AI Insights" description="SpendWise Intelligence · demo predictions">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Expected spending next month" value={formatINR(21400)} change={16.2} accent hint="vs this month" />
          <MetricCard label="Forecast confidence" value="87%" hint="model certainty" />
          <MetricCard label="Anomalies flagged" value="1" hint="last 30 days" />
        </div>

        <Panel title="Spending forecast" description="Actuals and projected spending">
          <ChartFrame height={300}>
            <LineChart data={spendingForecast} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatINR(v)} />
              <Line type="monotone" dataKey="actual" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="forecast" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
            </LineChart>
          </ChartFrame>
          <p className="mt-3 text-xs text-muted-foreground">
            Solid line shows recorded spending; dashed line is the projected trend for the next three months.
          </p>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Anomaly detection" description="Transactions outside your normal pattern" className="lg:col-span-1">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" aria-hidden />
                <p className="text-sm font-semibold">Unusual transaction detected</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                ₹2,899 on running shoes is 3.1× your typical shopping transaction of ₹930.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">Detected 10 Sep 2026 · confidence 92%</p>
            </div>
            <div className="mt-4 rounded-lg border border-border bg-elevated/50 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" aria-hidden />
                <p className="text-sm font-semibold">Pattern learned</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your weekend spending is consistently 42% higher than weekdays.
              </p>
            </div>
          </Panel>

          <Panel title="Personalised insights" description="Ranked by impact" className="lg:col-span-2">
            {insights.length === 0 ? (
              <EmptyState title="No insights yet" description="Add more transactions and SpendWise will surface patterns." />
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
                        {i.metric ? <span className="text-sm font-semibold">{i.metric}</span> : null}
                        <Badge variant="outline" className={severityStyles[i.severity]}>
                          {i.severity}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{i.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Confidence {Math.round(i.confidence * 100)}%</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Budget forecast" description="Projected end-of-month position per budget">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {budgets.map((b) => {
              const projected = Math.round(b.spent * 1.42);
              const pct = Math.round((projected / b.limit) * 100);
              return (
                <li key={b.id} className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">{categoryName(b.categoryId)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Projected {formatINR(projected)} of {formatINR(b.limit)}
                  </p>
                  <ProgressBar className="mt-3" value={pct} tone={budgetTone(pct)} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {pct >= 100 ? "Likely to exceed the limit" : `Tracking at ${pct}% of limit`}
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
