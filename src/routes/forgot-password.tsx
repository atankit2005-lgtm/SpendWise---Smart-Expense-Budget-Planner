import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/auth-layout";

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
  return (
    <AuthLayout
      title="Password recovery is not available yet"
      subtitle="SpendWise does not currently support password reset links."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          You can change your password from the Security section after signing in.
        </p>
      </div>
    </AuthLayout>
  );
}
