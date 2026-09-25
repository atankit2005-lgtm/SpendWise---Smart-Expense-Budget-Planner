import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Panel } from "@/components/app/ui-bits";
import { EmptyState } from "@/components/common/state-views";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { resolveCategoryName } from "@/lib/category-labels";
import { formatDate, formatINR } from "@/lib/format";
import { useFinance } from "@/store/finance";
import type { PaymentMethod, Transaction, TransactionType } from "@/types";

export const Route = createFileRoute("/app/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — SpendWise" },
      { name: "description", content: "Search, filter, add, edit and delete your income and expense records." },
      { property: "og:title", content: "Transactions — SpendWise" },
      { property: "og:description", content: "Manage every income and expense record in SpendWise." },
    ],
  }),
  component: TransactionsPage,
});

const methods: PaymentMethod[] = ["UPI", "Credit Card", "Debit Card", "Cash", "Net Banking"];
const PAGE_SIZE = 8;

type FormState = {
  amount: string;
  type: TransactionType;
  categoryId: string;
  description: string;
  paymentMethod: PaymentMethod;
  date: string;
  notes: string;
};

const emptyForm: FormState = {
  amount: "",
  type: "expense",
  categoryId: "",
  description: "",
  paymentMethod: "UPI",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
};

function TransactionsPage() {
  const { transactions, categories, addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<"amount" | "description" | "date", string>>>({});
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    const list = transactions.filter((t) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        t.description.toLowerCase().includes(q) ||
        (categories.find((c) => c.id === t.categoryId)?.name ?? "").toLowerCase().includes(q) ||
        t.paymentMethod.toLowerCase().includes(q);
      const matchesCategory = category === "all" || t.categoryId === category;
      const matchesType = type === "all" || t.type === type;
      return matchesQuery && matchesCategory && matchesType;
    });
    return list.sort((a, b) => (sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [transactions, query, category, type, sortDesc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function openAdd() {
    setEditing(null);
    setForm({
      ...emptyForm,
      categoryId: categories.find((c) => c.type === "expense")?.id ?? "",
    });
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(t: Transaction) {
    setEditing(t);
    setForm({
      amount: String(t.amount),
      type: t.type,
      categoryId: t.categoryId,
      description: t.description,
      paymentMethod: t.paymentMethod,
      date: t.date,
      notes: t.notes ?? "",
    });
    setErrors({});
    setFormOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<"amount" | "description" | "date", string>> = {};
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) next.amount = "Enter an amount greater than zero.";
    if (form.description.trim().length < 3) next.description = "Add a short description.";
    if (!form.date) next.date = "Pick a date.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      amount,
      type: form.type,
      categoryId: form.categoryId,
      description: form.description.trim(),
      paymentMethod: form.paymentMethod,
      date: form.date,
      notes: form.notes.trim() || undefined,
    };

    if (editing) {
      updateTransaction(editing.id, payload);
      toast.success("Transaction updated");
    } else {
      addTransaction(payload);
      toast.success("Transaction added");
    }
    setFormOpen(false);
  }

  const typeCategories = categories.filter((c) => c.type === form.type);

  return (
    <AppShell
      title="Transactions"
      description={`${filtered.length} record${filtered.length === 1 ? "" : "s"}`}
      actions={
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      }
    >
      <Panel>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder="Search description, category or method"
              value={query}
              aria-label="Search transactions"
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No transactions found"
            description="Try clearing filters, or record a new transaction to get started."
            action={<Button onClick={openAdd}>Add transaction</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => setSortDesc((s) => !s)}
                      >
                        Date <ArrowUpDown className="size-3" aria-hidden />
                      </button>
                    </th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">Description</th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">Category</th>
                    <th scope="col" className="hidden py-2.5 pr-4 font-medium md:table-cell">Method</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-medium">Amount</th>
                    <th scope="col" className="py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((t) => (
                    <tr key={t.id} className="hover:bg-elevated/40">
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatDate(t.date)}</td>
                      <td className="py-3 pr-4 font-medium">{t.description}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{resolveCategoryName(categories, t.categoryId)}</td>
                      <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{t.paymentMethod}</td>
                      <td className={`whitespace-nowrap py-3 pr-4 text-right font-semibold ${t.type === "income" ? "text-primary" : ""}`}>
                        {t.type === "income" ? "+" : "−"}
                        {formatINR(t.amount)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label={`Edit ${t.description}`} onClick={() => openEdit(t)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${t.description}`}
                            onClick={() => setDeleteTarget(t)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Page {current} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={current === pageCount} onClick={() => setPage(current + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the details of this record." : "Record a new income or expense."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  inputMode="decimal"
                  value={form.amount}
                  aria-invalid={!!errors.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
                {errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      type: v as TransactionType,
                      categoryId: categories.find((c) => c.type === v)?.id ?? "",
                    }))
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="method">Payment method</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v as PaymentMethod }))}
                >
                  <SelectTrigger id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                aria-invalid={!!errors.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              {errors.description ? <p className="text-xs text-destructive">{errors.description}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                aria-invalid={!!errors.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
              {errors.date ? <p className="text-xs text-destructive">{errors.date}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editing ? "Save changes" : "Add transaction"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete transaction?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `"${deleteTarget.description}" (${formatINR(deleteTarget.amount)}) will be removed. This cannot be undone.`
                : ""}
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
                  deleteTransaction(deleteTarget.id);
                  toast.success("Transaction deleted");
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
