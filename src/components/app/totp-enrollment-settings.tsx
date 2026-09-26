import { useEffect, useState } from "react";

import {
  beginTotpMfaEnrollmentFn,
  confirmTotpMfaEnrollmentFn,
  getTotpMfaStatusFn,
} from "@/functions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EnrollmentDetails {
  secret: string;
  provisioningUri: string;
  expiresAt: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function TotpEnrollmentSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<EnrollmentDetails | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let current = true;
    void getTotpMfaStatusFn()
      .then((status) => {
        if (current) setEnabled(status.enabled);
      })
      .catch((caught: unknown) => {
        if (current) setError(errorMessage(caught, "Could not load authenticator status."));
      });
    return () => {
      current = false;
    };
  }, []);

  async function startEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setRecoveryCodes(null);
    try {
      const result = await beginTotpMfaEnrollmentFn({ data: { currentPassword } });
      setEnrollment(result);
      setCode("");
      setCurrentPassword("");
    } catch (caught) {
      setError(errorMessage(caught, "Could not start authenticator setup."));
      setEnrollment(null);
    } finally {
      setLoading(false);
    }
  }

  async function confirmEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await confirmTotpMfaEnrollmentFn({ data: { code } });
      setEnrollment(null);
      setCode("");
      setRecoveryCodes(result.recoveryCodes);
      setEnabled(true);
    } catch (caught) {
      const message = errorMessage(caught, "Could not verify the authenticator code.");
      setError(message);
      if (/setup is missing or expired/i.test(message)) setEnrollment(null);
    } finally {
      setLoading(false);
    }
  }

  if (enabled === null) {
    return (
      <div className="border-b border-border py-4">
        <p className="text-sm font-medium">Two-factor authentication</p>
        <p className="text-xs text-muted-foreground">{error || "Checking authenticator status…"}</p>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="border-b border-border py-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium">Two-factor authentication</p>
            <p className="text-xs text-muted-foreground">
              Authenticator enrollment is confirmed and existing sessions were revoked. Sign-in
              verification is not yet enforced in this release, so this does not add an MFA login
              challenge.
            </p>
          </div>
          <span className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary">
            Enabled
          </span>
        </div>
        {recoveryCodes ? (
          <section aria-labelledby="recovery-codes-title" className="mt-4 space-y-3">
            <div>
              <h3 id="recovery-codes-title" className="text-sm font-medium">
                Save your recovery codes
              </h3>
              <p className="text-xs text-muted-foreground">
                These are shown only once. Store them somewhere safe; they cannot be retrieved
                later.
              </p>
            </div>
            <ul className="grid gap-2 rounded-md border border-border p-3 font-mono text-sm sm:grid-cols-2">
              {recoveryCodes.map((recoveryCode) => (
                <li key={recoveryCode}>{recoveryCode}</li>
              ))}
            </ul>
            <Button type="button" size="sm" onClick={() => setRecoveryCodes(null)}>
              I’ve saved these codes
            </Button>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-4 border-b border-border py-4" aria-labelledby="totp-title">
      <div>
        <h2 id="totp-title" className="text-sm font-medium">
          Two-factor authentication
        </h2>
        <p className="text-xs text-muted-foreground">
          Add an authenticator app. You’ll need your current password and access to the app to
          complete setup.
        </p>
      </div>

      {!enrollment ? (
        <form className="space-y-3" onSubmit={startEnrollment}>
          <div className="space-y-2">
            <Label htmlFor="totp-current-password">Current password</Label>
            <Input
              id="totp-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Starting setup…" : "Enable two-factor authentication"}
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Configure your authenticator</h3>
            <p className="text-xs text-muted-foreground">
              Enter this key manually in your authenticator app. Setup expires{" "}
              {new Date(enrollment.expiresAt).toLocaleTimeString()}.
            </p>
            <Label htmlFor="totp-secret">Setup key</Label>
            <Input id="totp-secret" readOnly value={enrollment.secret} />
            <Label htmlFor="totp-uri">Authenticator provisioning URI</Label>
            <Textarea
              id="totp-uri"
              readOnly
              value={enrollment.provisioningUri}
              className="min-h-20 break-all font-mono text-xs"
            />
          </div>

          <form className="space-y-3" onSubmit={confirmEnrollment}>
            <div className="space-y-2">
              <Label htmlFor="totp-verification-code">Six-digit authenticator code</Label>
              <Input
                id="totp-verification-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="sm" disabled={loading || code.length !== 6}>
              {loading ? "Verifying…" : "Verify and finish setup"}
            </Button>
          </form>

          <form className="space-y-2 border-t border-border pt-3" onSubmit={startEnrollment}>
            <Label htmlFor="totp-restart-password">Restart setup with a new key</Label>
            <Input
              id="totp-restart-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
            <Button type="submit" variant="outline" size="sm" disabled={loading}>
              Generate a new setup key
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
