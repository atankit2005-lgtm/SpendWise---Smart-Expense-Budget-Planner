import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChartPie,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  PiggyBank,
  Settings,
  Sparkles,
  Target,
  User as UserIcon,
  Wallet,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useFinance } from "@/store/finance";
import { logoutFn } from "@/functions/auth";

const nav = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/app/transactions", label: "Transactions", icon: ListOrdered },
  { to: "/app/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/app/goals", label: "Goals", icon: Target },
  { to: "/app/analytics", label: "Analytics", icon: ChartPie },
  { to: "/app/ai-insights", label: "AI Insights", icon: Sparkles },
] as const;

const secondaryNav = [
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/settings", label: "Settings", icon: Settings },
  { to: "/app/profile", label: "Profile", icon: UserIcon },
] as const;

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wallet className="size-4" aria-hidden />
      </span>
      SpendWise
    </span>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount } = useFinance();

  const item = (
    to: string,
    label: string,
    Icon: typeof Bell,
    active: boolean,
    badge?: number,
  ) => (
    <Link
      key={to}
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/12 font-medium text-primary"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </Link>
  );

  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Application">
      <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Manage
      </p>
      {nav.map((n) =>
        item(n.to, n.label, n.icon, "exact" in n && n.exact ? pathname === n.to : pathname.startsWith(n.to)),
      )}
      <p className="px-3 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Account
      </p>
      {secondaryNav.map((n) =>
        item(
          n.to,
          n.label,
          n.icon,
          pathname.startsWith(n.to),
          n.to === "/app/notifications" ? unreadCount : undefined,
        ),
      )}
    </nav>
  );
}

function UserMenu() {
  const { user } = useFinance();
  const navigate = useNavigate();
  const logout = async () => {
    await logoutFn();
    navigate({ to: "/login" });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 text-sm transition-colors hover:bg-elevated"
          aria-label="Open account menu"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {user.avatarInitials}
          </span>
          <span className="hidden pr-1 sm:inline">{user.name.split(" ")[0]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut className="size-4" aria-hidden /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { unreadCount } = useFinance();
  const logout = async () => {
    await logoutFn();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
        <Link to="/" className="px-2 pb-6">
          <BrandMark />
        </Link>
        <NavList />
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden /> Logout
        </button>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/70"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5">
            <div className="flex items-center justify-between px-2 pb-6">
              <BrandMark />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close navigation">
                <X className="size-4" />
              </Button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
              {description ? (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <Link
                to="/app/notifications"
                className="relative flex size-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-elevated"
                aria-label={`Notifications, ${unreadCount} unread`}
              >
                <Bell className="size-4" aria-hidden />
                {unreadCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {unreadCount}
                  </span>
                ) : null}
              </Link>
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
