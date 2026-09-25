import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/app/app-shell";

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
        </div>
        <p className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden />
          Secure account access for your personal finances.
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

          {footer ? <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
