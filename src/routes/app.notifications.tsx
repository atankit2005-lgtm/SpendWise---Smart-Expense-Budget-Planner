import { createFileRoute } from "@tanstack/react-router";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Panel } from "@/components/app/ui-bits";
import { EmptyState } from "@/components/common/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFinance } from "@/store/finance";
import type { NotificationType } from "@/types";

export const Route = createFileRoute("/app/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — SpendWise" },
      { name: "description", content: "Budget warnings, unusual transactions, goal progress and insight alerts." },
      { property: "og:title", content: "Notifications — SpendWise" },
      { property: "og:description", content: "Stay on top of budget and spending alerts in SpendWise." },
    ],
  }),
  component: NotificationsPage,
});

const filters: { id: "all" | "unread" | NotificationType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "budget_warning", label: "Budget warnings" },
  { id: "budget_exceeded", label: "Exceeded" },
  { id: "unusual_transaction", label: "Unusual" },
  { id: "goal_progress", label: "Goals" },
  { id: "insight", label: "Insights" },
];

function NotificationsPage() {
  const { notifications, toggleNotificationRead, markAllRead, deleteNotification, unreadCount } = useFinance();
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");

  const list = notifications.filter((n) =>
    filter === "all" ? true : filter === "unread" ? !n.read : n.type === filter,
  );

  return (
    <AppShell
      title="Notifications"
      description={`${unreadCount} unread`}
      actions={
        <Button size="sm" variant="outline" onClick={() => { markAllRead(); toast.success("All notifications marked as read"); }}>
          <CheckCheck className="size-4" aria-hidden /> Mark all as read
        </Button>
      }
    >
      <Panel>
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter notifications">
          {filters.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {list.length === 0 ? (
          <EmptyState title="No notifications" description="You're all caught up. New alerts will appear here." />
        ) : (
          <ul className="space-y-3">
            {list.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "flex gap-4 rounded-lg border p-4",
                  n.read ? "border-border bg-card" : "border-primary/30 bg-primary/[0.06]",
                )}
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Bell className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {!n.read ? (
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        New
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => toggleNotificationRead(n.id)}>
                    {n.read ? "Mark unread" : "Mark read"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete notification: ${n.title}`}
                    onClick={() => deleteNotification(n.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AppShell>
  );
}
