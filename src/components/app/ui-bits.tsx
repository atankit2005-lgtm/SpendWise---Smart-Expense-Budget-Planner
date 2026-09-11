import { TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  change,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  change?: number;
  hint?: string;
  accent?: boolean;
  icon?: ReactNode;
}) {
  const positive = (change ?? 0) >= 0;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 transition-colors hover:border-border/80",
        accent && "border-primary/30 bg-primary/[0.06]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {typeof change === "number" ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium",
              positive ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
            )}
          >
            {positive ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
            {formatPercent(change)}
          </span>
        ) : null}
        <span className="text-muted-foreground">{hint ?? "vs previous month"}</span>
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Recharts needs the DOM; render only after hydration to avoid SSR mismatch. */
export function ChartFrame({ height = 280, children }: { height?: number; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div style={{ height }} className="w-full animate-pulse rounded-lg bg-muted/50" aria-hidden />;
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "primary",
  className,
}: {
  value: number;
  tone?: "primary" | "warning" | "danger";
  className?: string;
}) {
  const width = Math.min(100, Math.max(0, value));
  const bg =
    tone === "danger" ? "bg-destructive" : tone === "warning" ? "bg-[var(--warning)]" : "bg-primary";
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-all", bg)} style={{ width: `${width}%` }} />
    </div>
  );
}

export function budgetTone(pct: number) {
  if (pct >= 100) return "danger" as const;
  if (pct >= 80) return "warning" as const;
  return "primary" as const;
}
