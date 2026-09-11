import { createFileRoute } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
import { analyticsSeries, categoryColor, categoryName, timeRangeLabels } from "@/data/mock";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFinance } from "@/store/finance";
import type { TimeRange } from "@/types";

export const Route = createFileRoute("/app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — SpendWise" },
      { name: "description", content: "Explore spending trends across 7 days to 1 year with category and monthly breakdowns." },
      { property: "og:title", content: "Analytics — SpendWise" },
      { property: "og:description", content: "Explore spending trends and category breakdowns in SpendWise." },
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
  const { transactions } = useFinance();
  const [range, setRange] = useState<TimeRange>("6m");
  const series = analyticsSeries[range];

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
          <MetricCard label="Total Spent" value={formatINR(totals.spent)} hint={timeRangeLabels[range]} />
          <MetricCard label="Total Income" value={formatINR(totals.income)} hint={timeRangeLabels[range]} />
          <MetricCard label="Net Saved" value={formatINR(totals.saved)} hint="income minus spending" accent />
          <MetricCard label="Average per period" value={formatINR(totals.avg)} hint="spending average" />
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
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatINR(v)} />
              <Area type="monotone" dataKey="spending" stroke="var(--chart-1)" strokeWidth={2} fill="url(#anFill)" />
            </AreaChart>
          </ChartFrame>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Income vs Expenses" description={timeRangeLabels[range]}>
            <ChartFrame height={260}>
              <BarChart data={series} margin={{ left: -18, right: 8, top: 8 }} barGap={4}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.35 }} formatter={(v: number) => formatINR(v)} />
                <Bar dataKey="income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spending" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartFrame>
          </Panel>

          <Panel title="Monthly trend" description="Net position over the selected range">
            <ChartFrame height={260}>
              <LineChart data={series.map((p) => ({ ...p, net: p.income - p.spending }))} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatINR(v)} />
                <Line type="monotone" dataKey="net" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
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
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={110} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.35 }} formatter={(v: number) => formatINR(v)} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {breakdown.map((c) => (
                    <Cell key={c.id} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
