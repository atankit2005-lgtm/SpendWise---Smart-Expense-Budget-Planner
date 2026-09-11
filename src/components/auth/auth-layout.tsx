import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between border-r border-border bg-card p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 surface-grid opacity-40" aria-hidden />
        <Link to="/" className="relative">
          <BrandMark className="text-lg" />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Every rupee accounted for. Every decision informed.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            SpendWise turns raw transactions into clear patterns, budgets that hold, and goals you
            actually reach.
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-6">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Tracked monthly</dt>
              <dd className="mt-1 text-2xl font-semibold">₹28,500</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Average saved</dt>
              <dd className="mt-1 text-2xl font-semibold text-primary">₹10,080</dd>
            </div>
          </dl>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden />
          Demo environment — no real financial data is stored.
        </p>
      </div>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-10 inline-flex lg:hidden">
            <BrandMark />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="outline"
            className="w-full border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
            onClick={() => navigate({ to: "/app" })}
          >
            Continue with Demo
            <ArrowRight className="size-4" aria-hidden />
          </Button>

          {footer ? <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
