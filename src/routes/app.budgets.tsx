import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { MetricCard, Panel, ProgressBar, budgetTone } from "@/components/app/ui-bits";
import { EmptyState } from "@/components/common/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resolveCategoryName } from "@/lib/category-labels";
import { formatINR } from "@/lib/format";
import { useFinance } from "@/store/finance";
import type { Budget, BudgetPeriod } from "@/types";

export const Route = createFileRoute("/app/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — SpendWise" },
      { name: "description", content: "Set category limits, monitor utilisation and stay ahead of overspending." },
      { property: "og:title", content: "Budgets — SpendWise" },
      { property: "og:description", content: "Set category limits and monitor utilisation in SpendWise." },
    ],
  }),
  component: BudgetsPage,
});

type Form = { categoryId: string; limit: string; spent: string; period: BudgetPeriod };
const emptyForm: Form = { categoryId: "", limit: "", spent: "0", period: "monthly" };

function BudgetsPage() {
  const { budgets, categories, addBudget, updateBudget, deleteBudget } = useFinance();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<"limit" | "spent" | "categoryId", string>>>({});
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const remaining = totalBudget - totalSpent;
  const utilisation = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;

  function openCreate() {
    setEditing(null);
    const firstExpense = categories.find((category) => category.type === "expense");
    setForm({ ...emptyForm, categoryId: firstExpense?.id ?? "" });
    setErrors({});
    setOpen(true);
  }

  function openEdit(b: Budget) {
    setEditing(b);
    setForm({ categoryId: b.categoryId, limit: String(b.limit), spent: String(b.spent), period: b.period });
    setErrors({});
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<"limit" | "spent" | "categoryId", string>> = {};
    const limit = Number(form.limit);
    const spent = Number(form.spent);
    if (!form.categoryId) next.categoryId = "Select a category.";
    if (!form.limit || Number.isNaN(limit) || limit <= 0) next.limit = "Enter a limit greater than zero.";
    if (Number.isNaN(spent) || spent < 0) next.spent = "Spent must be zero or more.";
    setErrors(next);
    if (Object.keys(next).length) return;

    if (editing) {
      updateBudget(editing.id, { categoryId: form.categoryId, limit, spent, period: form.period });
      toast.success("Budget updated");
    } else {
      addBudget({
        categoryId: form.categoryId,
        limit,
        spent,
        period: form.period,
        startDate: new Date().toISOString().slice(0, 10),
      });
      toast.success("Budget created");
    }
    setOpen(false);
  }

  return (
    <AppShell
      title="Budgets"
      description="September 2026"
      actions={
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden /> Create
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Budget" value={formatINR(totalBudget)} hint="across all categories" />
          <MetricCard label="Total Spent" value={formatINR(totalSpent)} hint="this period" />
          <MetricCard label="Remaining" value={formatINR(remaining)} hint="left to spend" accent />
          <MetricCard label="Overall Utilisation" value={`${utilisation}%`} hint="of total limits" />
        </div>

        {budgets.length === 0 ? (
          <EmptyState
            title="No budgets yet"
            description="Create your first budget to track spending against a limit."
            action={<Button onClick={openCreate}>Create budget</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {budgets.map((b) => {
              const pct = Math.round((b.spent / b.limit) * 100);
              const tone = budgetTone(pct);
              const left = b.limit - b.spent;
              return (
                <article key={b.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">{resolveCategoryName(categories, b.categoryId)}</h2>
                      <p className="text-xs capitalize text-muted-foreground">{b.period} budget</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        tone === "danger"
                          ? "border-destructive/40 text-destructive"
                          : tone === "warning"
                            ? "border-[var(--warning)]/40 text-[var(--warning)]"
                            : "border-primary/40 text-primary"
                      }
                    >
                      {tone === "danger" ? "Exceeded" : tone === "warning" ? "Nearing limit" : "On track"}
                    </Badge>
                  </div>
                  <p className="mt-4 text-2xl font-semibold tracking-tight">{formatINR(b.spent)}</p>
                  <p className="text-xs text-muted-foreground">of {formatINR(b.limit)} limit</p>
                  <div className="mt-4 flex items-center gap-3">
                    <ProgressBar value={pct} tone={tone} />
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {left >= 0 ? `${formatINR(left)} remaining` : `${formatINR(Math.abs(left))} over budget`}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(b)}>
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(b)}>
                      <Trash2 className="size-3.5 text-destructive" aria-hidden /> Delete
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <Panel title="How utilisation is calculated" description="Based on your recorded transactions">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Each budget compares recorded spending in its category against the limit for the period. Adding an
            expense transaction in a budgeted category increases the spent amount immediately, and status badges
            switch to <span className="text-[var(--warning)]">nearing limit</span> at 80% and{" "}
            <span className="text-destructive">exceeded</span> at 100%.
          </p>
        </Panel>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit budget" : "Create budget"}</DialogTitle>
            <DialogDescription>Set a spending limit for a category.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="bcategory">Category</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger id="bcategory">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => c.type === "expense")
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.categoryId ? <p className="text-xs text-destructive">{errors.categoryId}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="limit">Limit (₹)</Label>
                <Input
                  id="limit"
                  inputMode="numeric"
                  value={form.limit}
                  aria-invalid={!!errors.limit}
                  onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))}
                />
                {errors.limit ? <p className="text-xs text-destructive">{errors.limit}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="spent">Spent so far (₹)</Label>
                <Input
                  id="spent"
                  inputMode="numeric"
                  value={form.spent}
                  aria-invalid={!!errors.spent}
                  onChange={(e) => setForm((f) => ({ ...f, spent: e.target.value }))}
                />
                {errors.spent ? <p className="text-xs text-destructive">{errors.spent}</p> : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="period">Period</Label>
              <Select value={form.period} onValueChange={(v) => setForm((f) => ({ ...f, period: v as BudgetPeriod }))}>
                <SelectTrigger id="period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editing ? "Save changes" : "Create budget"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete budget?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `The ${resolveCategoryName(categories, deleteTarget.categoryId)} budget will be removed.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  deleteBudget(deleteTarget.id);
                  toast.success("Budget deleted");
                }
                setDeleteTarget(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
