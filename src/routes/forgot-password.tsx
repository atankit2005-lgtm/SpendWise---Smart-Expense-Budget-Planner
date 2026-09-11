import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — SpendWise" },
      { name: "description", content: "Request a password reset link for your SpendWise account." },
      { property: "og:title", content: "Reset your password — SpendWise" },
      { property: "og:description", content: "Request a password reset link for your SpendWise account." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setSent(true);
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="We'll send a reset link to your email address."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-5">
          <MailCheck className="size-5 text-primary" aria-hidden />
          <p className="mt-3 text-sm font-medium">Reset link sent</p>
          <p className="mt-1 text-sm text-muted-foreground">
            If an account exists for {email}, a reset link is on its way.
          </p>
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link to="/reset-password">Open reset page</Link>
          </Button>
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
              aria-invalid={!!error}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
