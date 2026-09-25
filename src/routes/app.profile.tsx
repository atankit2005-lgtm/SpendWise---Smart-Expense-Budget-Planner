import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { MetricCard, Panel } from "@/components/app/ui-bits";
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
import { formatDate, formatINR } from "@/lib/format";
import { useFinance } from "@/store/finance";

export const Route = createFileRoute("/app/profile")({
  head: () => ({
    meta: [
      { title: "Profile — SpendWise" },
      { name: "description", content: "View and edit your SpendWise profile details." },
      { property: "og:title", content: "Profile — SpendWise" },
      { property: "og:description", content: "View and edit your SpendWise profile details." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, updateUser, transactions, goals, summary } = useFinance();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...user });
  const [errors, setErrors] = useState<Partial<Record<"name" | "email", string>>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "Enter your full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) next.email = "Enter a valid email address.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await updateUser({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone,
        location: form.location,
        occupation: form.occupation,
        avatarInitials: form.name
          .trim()
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
          .toUpperCase(),
      });
      toast.success("Profile updated");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  const rows: [string, string][] = [
    ["Full name", user.name],
    ["Email", user.email],
    ["Phone", user.phone],
    ["Location", user.location],
    ["Occupation", user.occupation],
    ["Currency", `Indian Rupee (${user.currency})`],
    ["Member since", formatDate(user.memberSince)],
  ];

  return (
    <AppShell
      title="Profile"
      description="Your account details"
      actions={
        <Button size="sm" onClick={() => { setForm({ ...user }); setErrors({}); setOpen(true); }}>
          Edit profile
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-6">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
            {user.avatarInitials}
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground">{user.location}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Transactions logged" value={String(transactions.length)} hint="all time" />
          <MetricCard label="Active goals" value={String(goals.filter((g) => g.status === "active").length)} hint="in progress" />
          <MetricCard label="Saved this month" value={formatINR(summary.savings)} hint="September 2026" accent />
        </div>

        <Panel title="Account information" description="Used across your SpendWise workspace">
          <dl className="divide-y divide-border">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update the details shown across SpendWise.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="pname">Full name</Label>
              <Input id="pname" value={form.name} aria-invalid={!!errors.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pemail">Email</Label>
              <Input id="pemail" type="email" value={form.email} aria-invalid={!!errors.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pphone">Phone</Label>
              <Input id="pphone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ploc">Location</Label>
              <Input id="ploc" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pocc">Occupation</Label>
              <Input id="pocc" value={form.occupation} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
