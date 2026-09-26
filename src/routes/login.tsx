import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginFn, verifyTotpLoginFn } from "@/functions/auth";

/** Canonical recovery-code shape issued at MFA enrollment (case-insensitive here). */
const RECOVERY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/i;

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — SpendWise" },
      { name: "description", content: "Log in to your SpendWise account to manage spending, budgets and goals." },
      { property: "og:title", content: "Log in — SpendWise" },
      { property: "og:description", content: "Access your SpendWise personal finance dashboard." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "", totpCode: "" });
  type Errors = Partial<Record<"email" | "password" | "totpCode", string>>;
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<{ token: string; expiresAt: string } | null>(null);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) next.email = "Enter a valid email address.";
    if (values.password.length < 8) next.password = "Password must be at least 8 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const result = await loginFn({ data: { email: values.email, password: values.password } });
      setLoading(false);

      if (result.requiresMfa) {
        setRequiresMfa(true);
        setMfaChallenge(result.mfaChallenge!);
        toast.info("Two-factor authentication required");
      } else {
        toast.success("Welcome back to SpendWise");
        navigate({ to: "/app" });
      }
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "Could not log in.");
    }
  }

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const code = values.totpCode.trim();
    if (!/^\d{6}$/.test(code) && !RECOVERY_CODE_PATTERN.test(code))
      next.totpCode = "Enter your 6-digit code or a recovery code.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      await verifyTotpLoginFn({ data: { challengeToken: mfaChallenge!.token, code } });
      setLoading(false);
      toast.success("Welcome back to SpendWise");
      navigate({ to: "/app" });
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "Could not verify code.");
    }
  }

  function handleBackToPassword() {
    setRequiresMfa(false);
    setMfaChallenge(null);
    setValues((v) => ({ ...v, totpCode: "" }));
    setErrors({});
  }

  return (
    <AuthLayout
      title={requiresMfa ? "Verify your identity" : "Log in to SpendWise"}
      subtitle={requiresMfa ? "Enter the code from your authenticator app or use a recovery code." : "Pick up where you left off with your money."}
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create account
          </Link>
        </>
      }
    >
      {requiresMfa ? (
        <form className="space-y-4" onSubmit={submitTotp} noValidate>
          <div className="space-y-2">
            <Label htmlFor="totpCode">Authentication code</Label>
            <Input
              id="totpCode"
              type="text"
              maxLength={19}
              autoComplete="one-time-code"
              placeholder="123456 or XXXX-XXXX-XXXX-XXXX"
              value={values.totpCode}
              aria-invalid={!!errors.totpCode}
              onChange={(e) => setValues((v) => ({ ...v, totpCode: e.target.value }))}
            />
            {errors.totpCode ? <p className="text-xs text-destructive">{errors.totpCode}</p> : null}
            <p className="text-xs text-muted-foreground">
              Lost your device? Use one of the recovery codes you saved during setup.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleBackToPassword} disabled={loading}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </Button>
          </div>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={submitPassword} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={values.email}
              aria-invalid={!!errors.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            />
            {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={values.password}
              aria-invalid={!!errors.password}
              onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
            />
            {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Log In"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
