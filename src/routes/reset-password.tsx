import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completePasswordResetFn } from "@/functions/auth";
import {
  getResetTokenFromSearch,
  validateResetPasswordFields,
} from "@/lib/password-reset-form";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: getResetTokenFromSearch(search),
  }),
  head: () => ({
    meta: [
      { title: "Set a new password — SpendWise" },
      { name: "description", content: "Set a new password for your SpendWise account." },
      { property: "og:title", content: "Set a new password — SpendWise" },
      { property: "og:description", content: "Choose a new password for your SpendWise account." },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !token) return;

    const nextErrors = validateResetPasswordFields(password, confirmation);
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      await completePasswordResetFn({ data: { token, newPassword: password } });
      setSuccess(true);
      void navigate({
        search: (previous) => ({ ...previous, token: undefined }),
        replace: true,
      });
    } catch {
      setSubmitError(
        "This reset link is invalid or expired. Request a new password reset link and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={success ? "Password reset complete" : "Set a new password"}
      subtitle={
        success
          ? "Your password has been reset. Please log in again with your new password."
          : "Choose a new password for your SpendWise account."
      }
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      {success ? (
        <div role="status" className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            You are not signed in. Log in with your new password to continue.
          </p>
        </div>
      ) : !token ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <p role="alert" className="text-sm text-destructive">
            This reset link is invalid or expired. Request a new password reset link.
          </p>
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Request a new link
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              aria-invalid={!!errors.password}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrors({});
              }}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={confirmation}
              aria-invalid={!!errors.confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setErrors({});
              }}
            />
            {errors.confirmation ? (
              <p className="text-xs text-destructive">{errors.confirmation}</p>
            ) : null}
          </div>
          {submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Resetting password…" : "Reset password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
