import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFinance } from "@/store/finance";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SpendWise" },
      { name: "description", content: "Manage account, appearance, notification, privacy and security preferences." },
      { property: "og:title", content: "Settings — SpendWise" },
      { property: "og:description", content: "Manage your SpendWise preferences." },
    ],
  }),
  component: SettingsPage,
});

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border py-4 last:border-0 last:pb-0 first:pt-0">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SettingsPage() {
  const { user, updateUser } = useFinance();
  const [account, setAccount] = useState({ name: user.name, email: user.email });
  const [prefs, setPrefs] = useState({
    compact: false,
    animations: true,
    budgetAlerts: true,
    weeklyDigest: true,
    anomalyAlerts: true,
    shareAnonymised: false,
    hideAmounts: false,
    twoFactor: false,
  });

  const toggle = (key: keyof typeof prefs) => (value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    toast.success("Preference saved");
  };

  return (
    <AppShell title="Settings" description="Preferences for your SpendWise workspace">
      <Tabs defaultValue="account" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <Panel title="Profile information" description="Shown across the app">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                updateUser({ name: account.name, email: account.email });
                toast.success("Account details saved");
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sname">Full name</Label>
                  <Input id="sname" value={account.name} onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="semail">Email</Label>
                  <Input id="semail" type="email" value={account.email} onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))} />
                </div>
              </div>
              <Button type="submit">Save changes</Button>
            </form>
          </Panel>
        </TabsContent>

        <TabsContent value="appearance">
          <Panel title="Appearance" description="SpendWise is optimised for its dark cinematic theme">
            <Row title="Theme" description="Dark theme is the SpendWise default in Stage 1.">
              <span className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary">Dark</span>
            </Row>
            <Row title="Compact density" description="Reduce padding across tables and cards.">
              <Switch checked={prefs.compact} onCheckedChange={toggle("compact")} aria-label="Compact density" />
            </Row>
            <Row title="Interface animations" description="Subtle transitions and chart animations.">
              <Switch checked={prefs.animations} onCheckedChange={toggle("animations")} aria-label="Interface animations" />
            </Row>
          </Panel>
        </TabsContent>

        <TabsContent value="notifications">
          <Panel title="Notification preferences" description="Choose what SpendWise alerts you about">
            <Row title="Budget alerts" description="Warn at 80% and when a limit is exceeded.">
              <Switch checked={prefs.budgetAlerts} onCheckedChange={toggle("budgetAlerts")} aria-label="Budget alerts" />
            </Row>
            <Row title="Weekly digest" description="A summary of spending every Monday.">
              <Switch checked={prefs.weeklyDigest} onCheckedChange={toggle("weeklyDigest")} aria-label="Weekly digest" />
            </Row>
            <Row title="Anomaly alerts" description="Flag transactions outside your usual pattern.">
              <Switch checked={prefs.anomalyAlerts} onCheckedChange={toggle("anomalyAlerts")} aria-label="Anomaly alerts" />
            </Row>
          </Panel>
        </TabsContent>

        <TabsContent value="privacy">
          <Panel title="Privacy" description="Control how your data is used">
            <Row title="Share anonymised insights" description="Help improve SpendWise models with aggregated data.">
              <Switch checked={prefs.shareAnonymised} onCheckedChange={toggle("shareAnonymised")} aria-label="Share anonymised insights" />
            </Row>
            <Row title="Hide amounts by default" description="Blur balances until you reveal them.">
              <Switch checked={prefs.hideAmounts} onCheckedChange={toggle("hideAmounts")} aria-label="Hide amounts" />
            </Row>
            <Row title="Export data" description="Download a copy of your SpendWise records.">
              <Button variant="outline" size="sm" onClick={() => toast.success("Export queued — demo only")}>
                Export
              </Button>
            </Row>
          </Panel>
        </TabsContent>

        <TabsContent value="security">
          <Panel title="Security" description="Protect access to your account">
            <Row title="Two-factor authentication" description="Require a one-time code at login.">
              <Switch checked={prefs.twoFactor} onCheckedChange={toggle("twoFactor")} aria-label="Two-factor authentication" />
            </Row>
            <Row title="Password" description="Last changed 3 months ago.">
              <Button variant="outline" size="sm" onClick={() => toast.success("Password reset link sent — demo only")}>
                Change password
              </Button>
            </Row>
            <Row title="Active sessions" description="You are signed in on 2 devices.">
              <Button variant="outline" size="sm" onClick={() => toast.success("Other sessions signed out — demo only")}>
                Sign out others
              </Button>
            </Row>
          </Panel>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
