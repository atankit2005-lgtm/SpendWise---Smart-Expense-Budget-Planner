import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/app/app-shell";
import { ChartFrame, MetricCard, Panel, ProgressBar } from "@/components/app/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryColor, categoryName, timeRangeLabels } from "@/data/mock";
import { computeAnalyticsSeries } from "@/lib/financial-engine";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFinance } from "@/store/finance";
import type { TimeRange } from "@/types";

export const Route = createFileRoute("/app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — SpendWise" },
      {
        name: "description",
        content:
          "Explore spending trends across 7 days to 1 year with category and monthly breakdowns.",
      },
      { property: "og:title", content: "Analytics — SpendWise" },
      {
        property: "og:description",
        content: "Explore spending trends and category breakdowns in SpendWise.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

const ranges: TimeRange[] = ["7d", "30d", "3m", "6m", "1y"];

function AnalyticsPage() {
  const { transactions, patterns, anomalies, forecast } = useFinance();
  const [range, setRange] = useState<TimeRange>("6m");
  const series = useMemo(() => computeAnalyticsSeries(transactions, range), [transactions, range]);

  const trendPatterns = useMemo(
    () => patterns.filter((p) => p.type === "increasing_trend" || p.type === "category_spike"),
    [patterns],
  );

  const totals = useMemo(() => {
    const spent = series.reduce((s, p) => s + p.spending, 0);
    const income = series.reduce((s, p) => s + p.income, 0);
    return { spent, income, avg: Math.round(spent / series.length), saved: income - spent };
  }, [series]);

  const breakdown = useMemo(() => {
    const map = transactions
      .filter((t) => t.type === "expense")
      .reduce<Record<string, number>>((acc, t) => {
        acc[t.categoryId] = (acc[t.categoryId] ?? 0) + t.amount;
        return acc;
      }, {});
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(map)
      .map(([id, amount]) => ({
        id,
        name: categoryName(id),
        amount,
        color: categoryColor(id),
        percentage: Math.round((amount / total) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  return (
    <AppShell title="Analytics" description={`Viewing ${timeRangeLabels[range]}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Time range">
          {ranges.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === range ? "default" : "outline"}
              aria-pressed={r === range}
              onClick={() => setRange(r)}
              className={cn(r !== range && "text-muted-foreground")}
            >
              {timeRangeLabels[r]}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Spent"
            value={formatINR(totals.spent)}
            hint={timeRangeLabels[range]}
          />
          <MetricCard
            label="Total Income"
            value={formatINR(totals.income)}
            hint={timeRangeLabels[range]}
          />
          <MetricCard
            label="Net Saved"
            value={formatINR(totals.saved)}
            hint="income minus spending"
            accent
          />
          <MetricCard
            label="Average per period"
            value={formatINR(totals.avg)}
            hint="spending average"
          />
        </div>

        <Panel title="Spending over time" description={timeRangeLabels[range]}>
          <ChartFrame height={300}>
            <AreaChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="anFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={12}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatINR(v)} />
              <Area
                type="monotone"
                dataKey="spending"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#anFill)"
              />
            </AreaChart>
          </ChartFrame>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Income vs Expenses" description={timeRangeLabels[range]}>
            <ChartFrame height={260}>
              <BarChart data={series} margin={{ left: -18, right: 8, top: 8 }} barGap={4}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={12}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                  formatter={(v: number) => formatINR(v)}
                />
                <Bar dataKey="income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spending" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartFrame>
          </Panel>

          <Panel title="Monthly trend" description="Net position over the selected range">
            <ChartFrame height={260}>
              <LineChart
                data={series.map((p) => ({ ...p, net: p.income - p.spending }))}
                margin={{ left: -18, right: 8, top: 8 }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={12}
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
                  dataKey="net"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartFrame>
          </Panel>
        </div>

        <Panel title="Category breakdown" description="Share of total spending">
          <div className="grid gap-6 lg:grid-cols-2">
            <ul className="space-y-4">
              {breakdown.map((c) => (
                <li key={c.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatINR(c.amount)} · {c.percentage}%
                    </span>
                  </div>
                  <ProgressBar className="mt-2" value={c.percentage} />
                </li>
              ))}
            </ul>
            <ChartFrame height={260}>
              <BarChart data={breakdown} layout="vertical" margin={{ left: 40, right: 16 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                  formatter={(v: number) => formatINR(v)}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {breakdown.map((c) => (
                    <Cell key={c.id} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          </div>
        </Panel>

        <Panel
          title="SpendWise Intelligence"
          description="Trend interpretation, anomalies and a forecast indicator, derived from your actual transactions"
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Trend interpretation
              </h3>
              {trendPatterns.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  No notable spending trends detected yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {trendPatterns.slice(0, 3).map((p) => (
                    <li key={p.id} className="rounded-lg border border-border bg-elevated/40 p-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="size-3.5 text-[var(--warning)]" aria-hidden />
                        <p className="text-xs font-semibold">{p.title}</p>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {p.explanation}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Anomalies
              </h3>
              {anomalies.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Nothing outside your normal pattern right now.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {anomalies.slice(0, 3).map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                    >
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        <p className="text-xs font-semibold">{a.title}</p>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {a.explanation}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Forecast indicator
              </h3>
              {forecast.monthsUsed === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Not enough completed months yet for a forecast.
                </p>
              ) : (
                <div className="mt-3 rounded-lg border border-border bg-elevated/40 p-3">
                  <div className="flex items-center gap-2">
                    {forecast.projectedSavings >= 0 ? (
                      <TrendingUp className="size-3.5 text-primary" aria-hidden />
                    ) : (
                      <TrendingDown className="size-3.5 text-destructive" aria-hidden />
                    )}
                    <p className="text-xs font-semibold">Next period estimate</p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Projected expenses {formatINR(forecast.projectedExpenses)}, income{" "}
                    {formatINR(forecast.projectedIncome)} — estimated{" "}
                    {forecast.projectedSavings >= 0 ? "savings" : "shortfall"} of{" "}
                    {formatINR(Math.abs(forecast.projectedSavings))}.
                  </p>
                  <Badge variant="outline" className="mt-2 border-border text-muted-foreground">
                    based on {forecast.monthsUsed} month{forecast.monthsUsed === 1 ? "" : "s"}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
