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
import { changePasswordFn, signOutOtherSessionsFn } from "@/functions/auth";
import { exportPersonalDataFn } from "@/functions/finance";
import { TotpEnrollmentSettings } from "@/components/app/totp-enrollment-settings";
import { useFinance } from "@/store/finance";
import type { UserPreferences } from "@/types";

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

/** Preference keys rendered as switches — every field except the theme. */
type PreferenceToggle = {
  [K in keyof UserPreferences]-?: UserPreferences[K] extends boolean ? K : never;
}[keyof UserPreferences];

function SettingsPage() {
  const { user, updateUser, preferences, updatePreferences } = useFinance();
  const [account, setAccount] = useState({ name: user.name, email: user.email });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const toggle = (key: PreferenceToggle) => (value: boolean) => {
    void updatePreferences({ [key]: value } as Partial<UserPreferences>)
      .then(() => toast.success("Preference saved"))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not save preference.");
      });
  };

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    if (passwords.next.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setPasswordLoading(true);
    try {
      await changePasswordFn({
        data: { currentPassword: passwords.current, newPassword: passwords.next },
      });
      setPasswords({ current: "", next: "", confirm: "" });
      toast.success("Password changed");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Could not change password.");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function signOutOthers() {
    setSessionsLoading(true);
    try {
      await signOutOtherSessionsFn();
      toast.success("Other sessions signed out");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out other sessions.");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function exportData() {
    setExportLoading(true);
    try {
      const data = await exportPersonalDataFn();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `spendwise-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data export is ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export your data.");
    } finally {
      setExportLoading(false);
    }
  }

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
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await updateUser({ name: account.name, email: account.email });
                  toast.success("Account details saved");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not save account details.");
                }
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
              <Switch checked={preferences.compact} onCheckedChange={toggle("compact")} aria-label="Compact density" />
            </Row>
            <Row title="Interface animations" description="Subtle transitions and chart animations.">
              <Switch checked={preferences.animations} onCheckedChange={toggle("animations")} aria-label="Interface animations" />
            </Row>
          </Panel>
        </TabsContent>

        <TabsContent value="notifications">
          <Panel title="Notification preferences" description="Choose what SpendWise alerts you about">
            <Row title="Budget alerts" description="Warn at 80% and when a limit is exceeded.">
              <Switch checked={preferences.budgetAlerts} onCheckedChange={toggle("budgetAlerts")} aria-label="Budget alerts" />
            </Row>
            <Row title="Weekly digest" description="A summary of spending every Monday.">
              <Switch checked={preferences.weeklyDigest} onCheckedChange={toggle("weeklyDigest")} aria-label="Weekly digest" />
            </Row>
            <Row title="Anomaly alerts" description="Flag transactions outside your usual pattern.">
              <Switch checked={preferences.anomalyAlerts} onCheckedChange={toggle("anomalyAlerts")} aria-label="Anomaly alerts" />
            </Row>
          </Panel>
        </TabsContent>

        <TabsContent value="privacy">
          <Panel title="Privacy" description="Control how your data is used">
            <Row title="Share anonymised insights" description="Help improve SpendWise models with aggregated data.">
              <Switch checked={preferences.shareAnonymised} onCheckedChange={toggle("shareAnonymised")} aria-label="Share anonymised insights" />
            </Row>
            <Row title="Hide amounts by default" description="Blur balances until you reveal them.">
              <Switch checked={preferences.hideAmounts} onCheckedChange={toggle("hideAmounts")} aria-label="Hide amounts" />
            </Row>
            <Row title="Export data" description="Download a copy of your SpendWise records.">
              <Button variant="outline" size="sm" onClick={() => void exportData()} disabled={exportLoading}>
                {exportLoading ? "Exporting…" : "Export"}
              </Button>
            </Row>
          </Panel>
        </TabsContent>

        <TabsContent value="security">
          <Panel title="Security" description="Protect access to your account">
            <TotpEnrollmentSettings />
            <form className="space-y-4 border-b border-border py-4" onSubmit={changePassword}>
              <div>
                <p className="text-sm font-medium">Change password</p>
                <p className="text-xs text-muted-foreground">Use your current password to choose a new one.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input type="password" autoComplete="current-password" placeholder="Current password" value={passwords.current} onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))} />
                <Input type="password" autoComplete="new-password" placeholder="New password" value={passwords.next} onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))} />
                <Input type="password" autoComplete="new-password" placeholder="Confirm new password" value={passwords.confirm} onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))} />
              </div>
              {passwordError ? <p className="text-xs text-destructive">{passwordError}</p> : null}
              <Button type="submit" variant="outline" size="sm" disabled={passwordLoading}>
                {passwordLoading ? "Changing…" : "Change password"}
              </Button>
            </form>
            <Row title="Active sessions" description="Manage your active sessions from this account.">
              <Button variant="outline" size="sm" onClick={signOutOthers} disabled={sessionsLoading}>
                {sessionsLoading ? "Signing out…" : "Sign out others"}
              </Button>
            </Row>
          </Panel>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
