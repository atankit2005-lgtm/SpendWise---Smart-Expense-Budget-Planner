import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  PiggyBank,
  Sparkles,
  Target,
  TrendingDown,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/app/app-shell";
import { ChartFrame, MetricCard, Panel, ProgressBar, budgetTone } from "@/components/app/ui-bits";
import { EmptyState } from "@/components/common/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyticsSeries, categoryColor, categoryName } from "@/data/mock";
import { formatDate, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFinance } from "@/store/finance";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Overview — SpendWise" },
      {
        name: "description",
        content: "Your balance, income, expenses, budgets and recent activity at a glance.",
      },
      { property: "og:title", content: "Overview — SpendWise" },
      { property: "og:description", content: "Your financial overview inside SpendWise." },
    ],
  }),
  component: DashboardPage,
});

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

function healthBadgeTone(grade: string) {
  if (grade === "excellent" || grade === "good") return "border-primary/40 text-primary";
  if (grade === "fair") return "border-border text-muted-foreground";
  return "border-destructive/40 text-destructive";
}

function DashboardPage() {
  const { summary, transactions, budgets, insights, healthScore, recommendations } = useFinance();
  const series = analyticsSeries["6m"];
  const topRecommendation = recommendations[0];

  const expenseByCategory = transactions
    .filter((t) => t.type === "expense")
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.categoryId] = (acc[t.categoryId] ?? 0) + t.amount;
      return acc;
    }, {});
  const pieData = Object.entries(expenseByCategory)
    .map(([id, amount]) => ({ name: categoryName(id), value: amount, color: categoryColor(id) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  return (
    <AppShell
      title="Overview"
      description="September 2026 · all accounts"
      actions={
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link to="/app/transactions">Add transaction</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Balance"
            value={formatINR(summary.balance)}
            change={summary.balanceChange}
            accent
            icon={<Wallet className="size-4" />}
          />
          <MetricCard
            label="Income"
            value={formatINR(summary.income)}
            change={summary.incomeChange}
            icon={<Banknote className="size-4" />}
          />
          <MetricCard
            label="Expenses"
            value={formatINR(summary.expenses)}
            change={summary.expenseChange}
            icon={<TrendingDown className="size-4" />}
          />
          <MetricCard
            label="Savings"
            value={formatINR(summary.savings)}
            change={summary.savingsChange}
            icon={<PiggyBank className="size-4" />}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Spending Trend" description="Last six months" className="lg:col-span-2">
            <ChartFrame height={280}>
              <AreaChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${v / 1000}k`}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatINR(v)} />
                <Area
                  type="monotone"
                  dataKey="spending"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#spendFill)"
                />
              </AreaChart>
            </ChartFrame>
          </Panel>

          <Panel title="Category Breakdown" description="Where money goes">
            <ChartFrame height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="none"
                >
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatINR(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ChartFrame>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            title="Income vs Expenses"
            description="Monthly comparison"
            className="lg:col-span-2"
          >
            <ChartFrame height={260}>
              <BarChart data={series} margin={{ left: -18, right: 8, top: 8 }} barGap={6}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${v / 1000}k`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  formatter={(v: number) => formatINR(v)}
                />
                <Bar dataKey="income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spending" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartFrame>
          </Panel>

          <Panel
            title="Budget Progress"
            description="This month"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/budgets">View all</Link>
              </Button>
            }
          >
            {budgets.length === 0 ? (
              <EmptyState
                title="No budgets yet"
                description="Create a budget to keep category spending in check."
              />
            ) : (
              <ul className="space-y-4">
                {budgets.slice(0, 5).map((b) => {
                  const pct = Math.round((b.spent / b.limit) * 100);
                  return (
                    <li key={b.id}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{categoryName(b.categoryId)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatINR(b.spent)} / {formatINR(b.limit)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressBar value={pct} tone={budgetTone(pct)} />
                        <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            title="Recent Transactions"
            description="Latest activity"
            className="lg:col-span-2"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/transactions">
                  All transactions <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            }
          >
            {recent.length === 0 ? (
              <EmptyState
                title="No transactions"
                description="Add your first transaction to see it here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {categoryName(t.categoryId)} · {formatDate(t.date)} · {t.paymentMethod}
                      </p>
                    </div>
                    <span
                      className={
                        t.type === "income"
                          ? "shrink-0 text-sm font-semibold text-primary"
                          : "shrink-0 text-sm font-semibold"
                      }
                    >
                      {t.type === "income" ? "+" : "−"}
                      {formatINR(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="SpendWise Intelligence"
            description="Generated insights"
            actions={
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("capitalize", healthBadgeTone(healthScore.grade))}
                >
                  Health {healthScore.score}/100
                </Badge>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/app/ai-insights">Open</Link>
                </Button>
              </div>
            }
          >
            <ul className="space-y-3">
              {insights.slice(0, 2).map((i) => (
                <li key={i.id} className="rounded-lg border border-border bg-elevated/50 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary" aria-hidden />
                    <p className="text-sm font-medium">{i.title}</p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {i.description}
                  </p>
                </li>
              ))}
              {insights.length === 0 ? (
                <EmptyState
                  title="No insights yet"
                  description="Add more transactions to see live intelligence here."
                />
              ) : null}
              {topRecommendation ? (
                <li className="rounded-lg border border-primary/30 bg-primary/[0.05] p-4">
                  <div className="flex items-center gap-2">
                    {topRecommendation.priority === "high" ? (
                      <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
                    ) : (
                      <Target className="size-3.5 text-primary" aria-hidden />
                    )}
                    <p className="text-sm font-medium">{topRecommendation.title}</p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {topRecommendation.detail}
                  </p>
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
