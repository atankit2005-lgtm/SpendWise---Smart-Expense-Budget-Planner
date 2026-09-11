import { createFileRoute } from "@tanstack/react-router";
import { Flag, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { MetricCard, ProgressBar } from "@/components/app/ui-bits";
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
import { Textarea } from "@/components/ui/textarea";
import { formatINR, formatMonthYear } from "@/lib/format";
import { useFinance } from "@/store/finance";
import type { Goal, GoalStatus } from "@/types";

export const Route = createFileRoute("/app/goals")({
  head: () => ({
    meta: [
      { title: "Goals — SpendWise" },
      { name: "description", content: "Track savings goals with visual progress, target amounts and target dates." },
      { property: "og:title", content: "Goals — SpendWise" },
      { property: "og:description", content: "Track savings goals and progress in SpendWise." },
    ],
  }),
  component: GoalsPage,
});

type Form = { name: string; targetAmount: string; currentAmount: string; targetDate: string; status: GoalStatus; note: string };
const emptyForm: Form = {
  name: "",
  targetAmount: "",
  currentAmount: "0",
  targetDate: "2027-03-31",
  status: "active",
  note: "",
};

function GoalsPage() {
  const { goals, addGoal, updateGoal, deleteGoal } = useFinance();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<"name" | "targetAmount" | "currentAmount" | "targetDate", string>>>({});
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
  const completed = goals.filter((g) => g.status === "completed").length;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setOpen(true);
  }

  function openEdit(g: Goal) {
    setEditing(g);
    setForm({
      name: g.name,
      targetAmount: String(g.targetAmount),
      currentAmount: String(g.currentAmount),
      targetDate: g.targetDate,
      status: g.status,
      note: g.note ?? "",
    });
    setErrors({});
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const target = Number(form.targetAmount);
    const current = Number(form.currentAmount);
    if (form.name.trim().length < 3) next.name = "Give the goal a clear name.";
    if (!form.targetAmount || Number.isNaN(target) || target <= 0) next.targetAmount = "Enter a target above zero.";
    if (Number.isNaN(current) || current < 0) next.currentAmount = "Saved amount must be zero or more.";
    if (!form.targetDate) next.targetDate = "Choose a target date.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      name: form.name.trim(),
      targetAmount: target,
      currentAmount: current,
      targetDate: form.targetDate,
      status: form.status,
      note: form.note.trim() || undefined,
    };
    if (editing) {
      updateGoal(editing.id, payload);
      toast.success("Goal updated");
    } else {
      addGoal(payload);
      toast.success("Goal created");
    }
    setOpen(false);
  }

  return (
    <AppShell
      title="Goals"
      description="Savings targets and progress"
      actions={
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden /> Create
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Total Target" value={formatINR(totalTarget)} hint="across all goals" />
          <MetricCard label="Total Saved" value={formatINR(totalSaved)} hint="funded so far" accent />
          <MetricCard label="Completed" value={`${completed} of ${goals.length}`} hint="goals reached" />
        </div>

        {goals.length === 0 ? (
          <EmptyState
            title="No goals yet"
            description="Set a savings goal and watch progress build over time."
            action={<Button onClick={openCreate}>Create goal</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
              return (
                <article key={g.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <Flag className="size-4" aria-hidden />
                      </span>
                      <h2 className="text-sm font-semibold">{g.name}</h2>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {g.status}
                    </Badge>
                  </div>
                  <p className="mt-4 text-2xl font-semibold tracking-tight">{formatINR(g.currentAmount)}</p>
                  <p className="text-xs text-muted-foreground">of {formatINR(g.targetAmount)} target</p>
                  <div className="mt-4 flex items-center gap-3">
                    <ProgressBar value={pct} />
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Target date · {formatMonthYear(g.targetDate)}</p>
                  {g.note ? <p className="mt-2 text-xs text-muted-foreground">{g.note}</p> : null}
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(g)}>
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(g)}>
                      <Trash2 className="size-3.5 text-destructive" aria-hidden /> Delete
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit goal" : "Create goal"}</DialogTitle>
            <DialogDescription>Define what you're saving for and by when.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="gname">Goal name</Label>
              <Input
                id="gname"
                value={form.name}
                aria-invalid={!!errors.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="target">Target amount (₹)</Label>
                <Input
                  id="target"
                  inputMode="numeric"
                  value={form.targetAmount}
                  aria-invalid={!!errors.targetAmount}
                  onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))}
                />
                {errors.targetAmount ? <p className="text-xs text-destructive">{errors.targetAmount}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="saved">Saved so far (₹)</Label>
                <Input
                  id="saved"
                  inputMode="numeric"
                  value={form.currentAmount}
                  aria-invalid={!!errors.currentAmount}
                  onChange={(e) => setForm((f) => ({ ...f, currentAmount: e.target.value }))}
                />
                {errors.currentAmount ? <p className="text-xs text-destructive">{errors.currentAmount}</p> : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tdate">Target date</Label>
                <Input
                  id="tdate"
                  type="date"
                  value={form.targetDate}
                  aria-invalid={!!errors.targetDate}
                  onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                />
                {errors.targetDate ? <p className="text-xs text-destructive">{errors.targetDate}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as GoalStatus }))}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gnote">Note (optional)</Label>
              <Textarea
                id="gnote"
                rows={3}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editing ? "Save changes" : "Create goal"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete goal?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `"${deleteTarget.name}" and its progress will be removed.` : ""}
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
                  deleteGoal(deleteTarget.id);
                  toast.success("Goal deleted");
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
