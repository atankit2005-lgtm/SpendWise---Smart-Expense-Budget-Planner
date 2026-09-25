import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/auth-layout";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — SpendWise" },
      { name: "description", content: "Choose a new password for your SpendWise account." },
      { property: "og:title", content: "Set a new password — SpendWise" },
      { property: "og:description", content: "Choose a new password for your SpendWise account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Password reset is not available yet"
      subtitle="SpendWise does not currently support password reset links."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Sign in and use the Security section to change your password.
        </p>
      </div>
    </AuthLayout>
  );
}
