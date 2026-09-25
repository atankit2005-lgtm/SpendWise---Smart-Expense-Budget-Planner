import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetFn } from "@/functions/auth";
import { validateForgotPasswordEmail } from "@/lib/password-reset-form";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot your password? — SpendWise" },
      { name: "description", content: "Request password reset instructions for your SpendWise account." },
      { property: "og:title", content: "Forgot your password? — SpendWise" },
      { property: "og:description", content: "Request password reset instructions for your SpendWise account." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const validationError = validateForgotPasswordEmail(email);
    setEmailError(validationError ?? "");
    setRequestError("");
    setSuccessMessage("");
    if (validationError) return;

    setLoading(true);
    try {
      const result = await requestPasswordResetFn({ data: { email: email.trim() } });
      setSuccessMessage(result.message);
    } catch {
      setRequestError("We couldn't process your request. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email address associated with your account."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      {successMessage ? (
        <div role="status" className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">{successMessage}</p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              aria-invalid={!!emailError}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError("");
              }}
            />
            {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
          </div>
          {requestError ? (
            <p role="alert" className="text-sm text-destructive">
              {requestError}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending instructions…" : "Send reset instructions"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
