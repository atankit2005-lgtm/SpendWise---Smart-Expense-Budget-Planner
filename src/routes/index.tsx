import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Brain,
  LineChart,
  PiggyBank,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { BrandMark } from "@/components/app/app-shell";
import { ProgressBar } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SpendWise — Know where your money goes" },
      {
        name: "description",
        content:
          "Track spending, understand your habits, manage budgets and reach savings goals with SpendWise, an AI-powered personal finance platform.",
      },
      { property: "og:title", content: "SpendWise — Know where your money goes" },
      {
        property: "og:description",
        content: "Track spending, set budgets, reach goals and get intelligent financial insights.",
      },
    ],
  }),
  component: LandingPage,
});

const pillars = [
  { icon: Wallet, title: "Track", body: "Log income and expenses in seconds, with categories, payment methods and notes that stay tidy." },
  { icon: BarChart3, title: "Understand", body: "See spending analytics and behavioural patterns across categories, weeks and months." },
  { icon: LineChart, title: "Predict", body: "Intelligent forecasting projects next month's spending before it happens." },
  { icon: Target, title: "Improve", body: "Budgets, goals and actionable insights that turn intent into steady progress." },
];

const features = [
  { icon: Wallet, title: "Smart Tracking", body: "Track income and expenses effortlessly with fast entry, filters and search across every record." },
  { icon: BarChart3, title: "Intelligent Analytics", body: "Understand spending patterns and trends with interactive ranges from 7 days to a full year." },
  { icon: PiggyBank, title: "Smart Budgets", body: "Set limits and monitor your spending, with clear warnings before a category runs over." },
  { icon: Target, title: "Financial Goals", body: "Work toward meaningful savings goals with visual progress and realistic target dates." },
];

function DashboardPreview() {
  const cards = [
    { label: "Balance", value: 42850, change: "+8.2%" },
    { label: "Income", value: 28500, change: "+4.6%" },
    { label: "Expenses", value: 18420, change: "−3.1%" },
    { label: "Savings", value: 10080, change: "+12.4%" },
  ];
  const bars = [42, 58, 36, 74, 52, 66, 48, 82, 60, 71, 55, 68];
  const budgets = [
    { name: "Food", spent: 4100, limit: 5000 },
    { name: "Shopping", spent: 3200, limit: 4000 },
    { name: "Transport", spent: 1400, limit: 3000 },
  ];

  return (
    <div className="glow-accent overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <BrandMark className="text-sm" />
        <span className="text-xs text-muted-foreground">September 2026</span>
      </div>
      <div className="grid gap-4 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-border bg-elevated/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-base font-semibold">{formatINR(c.value)}</p>
              <p className="text-[11px] text-primary">{c.change}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-elevated/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Spending trend</p>
            <p className="text-[11px] text-muted-foreground">Last 12 months</p>
          </div>
          <div className="mt-4 flex h-28 items-end gap-1.5">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${h}%`, opacity: 0.35 + (h / 100) * 0.65 }}
              />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-elevated/40 p-4">
          <p className="text-xs font-medium">Budgets</p>
          <ul className="mt-3 space-y-3">
            {budgets.map((b) => {
              const pct = Math.round((b.spent / b.limit) * 100);
              return (
                <li key={b.name}>
                  <div className="flex justify-between text-[11px]">
                    <span>{b.name}</span>
                    <span className="text-muted-foreground">
                      {formatINR(b.spent)} / {formatINR(b.limit)} · {pct}%
                    </span>
                  </div>
                  <ProgressBar className="mt-1.5 h-1.5" value={pct} tone={pct >= 80 ? "warning" : "primary"} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" aria-label="SpendWise home">
            <BrandMark />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#intelligence" className="hover:text-foreground">Intelligence</a>
            <a href="#analytics" className="hover:text-foreground">Analytics</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 surface-grid opacity-30" aria-hidden />
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                <Sparkles className="size-3.5" aria-hidden /> AI-powered personal finance
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Know where your money goes.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Track your spending, understand your habits, and make smarter financial decisions with
                SpendWise.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/signup">
                    Get Started <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">Log in to explore</Link>
                </Button>
              </div>
              <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-border pt-6">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Balance</dt>
                  <dd className="mt-1 text-lg font-semibold">₹42,850</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Income</dt>
                  <dd className="mt-1 text-lg font-semibold">₹28,500</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Saved</dt>
                  <dd className="mt-1 text-lg font-semibold text-primary">₹10,080</dd>
                </div>
              </dl>
            </div>
            <DashboardPreview />
          </div>
        </section>

        <section className="border-b border-border" aria-labelledby="pillars-heading">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 id="pillars-heading" className="max-w-2xl text-3xl font-semibold tracking-tight">
              A complete loop for your money.
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Four connected stages that take you from raw transactions to confident decisions.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {pillars.map((p, i) => (
                <article key={p.title} className="rounded-xl border border-border bg-card p-6">
                  <span className="text-xs font-medium text-muted-foreground">0{i + 1}</span>
                  <p.icon className="mt-4 size-5 text-primary" aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="border-b border-border" aria-labelledby="features-heading">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 id="features-heading" className="max-w-2xl text-3xl font-semibold tracking-tight">
              Built for people who want clarity, not spreadsheets.
            </h2>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {features.map((f) => (
                <article key={f.title} className="rounded-xl border border-border bg-card p-8">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="intelligence" className="border-b border-border" aria-labelledby="intel-heading">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
                <Brain className="size-4" aria-hidden /> SpendWise Intelligence
              </span>
              <h2 id="intel-heading" className="mt-4 text-3xl font-semibold tracking-tight">
                Insights that read your spending for you.
              </h2>
              <p className="mt-4 text-muted-foreground">
                SpendWise watches for budget pressure, unusual transactions and shifts in your habits, then
                explains them in plain language — with a forecast for what next month is likely to cost.
              </p>
              <Button asChild className="mt-8" variant="outline">
                <Link to="/app/ai-insights">See intelligence in the demo</Link>
              </Button>
            </div>
            <ul className="space-y-3">
              {[
                { t: "Your food spending is 24% higher than your recent average.", m: "+24%" },
                { t: "Unusual transaction detected — ₹2,899 is 3.1× your typical shopping spend.", m: "Anomaly" },
                { t: "Expected spending next month is ₹21,400 based on your trend.", m: "Forecast" },
                { t: "You saved 35% of income this month, your best result in six months.", m: "+₹10,080" },
              ].map((i) => (
                <li key={i.t} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
                  <p className="text-sm text-muted-foreground">{i.t}</p>
                  <span className="shrink-0 text-xs font-semibold text-primary">{i.m}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="analytics" className="border-b border-border" aria-labelledby="analytics-heading">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 id="analytics-heading" className="max-w-2xl text-3xl font-semibold tracking-tight">
              Analytics that answer real questions.
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Switch between 7 days, 30 days, 3 months, 6 months and a full year — every chart, breakdown and
              average updates with you.
            </p>
            <div className="mt-12">
              <DashboardPreview />
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">Take control of your money.</h2>
            <p className="mt-4 text-lg text-muted-foreground">Spend smarter. Save with purpose.</p>
            <Button asChild size="lg" className="mt-8">
              <Link to="/signup">
                Get Started <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-6 border-t border-border pt-8">
          <div>
            <BrandMark />
            <p className="mt-2 max-w-xs text-xs text-muted-foreground">
              An AI-powered personal finance platform. Stage 1 demo with mock data — no real accounts are
              connected.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#intelligence" className="hover:text-foreground">Intelligence</a>
            <a href="#analytics" className="hover:text-foreground">Analytics</a>
            <Link to="/login" className="hover:text-foreground">Log in</Link>
            <Link to="/signup" className="hover:text-foreground">Get Started</Link>
          </nav>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">© 2026 SpendWise. All rights reserved.</p>
      </footer>
    </div>
  );
}
