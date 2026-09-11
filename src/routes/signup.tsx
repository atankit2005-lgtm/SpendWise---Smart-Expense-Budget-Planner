import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — SpendWise" },
      { name: "description", content: "Create a SpendWise account and start tracking income, expenses and goals." },
      { property: "og:title", content: "Create your account — SpendWise" },
      { property: "og:description", content: "Start tracking income, expenses, budgets and goals with SpendWise." },
    ],
  }),
  component: SignupPage,
});

type Field = "name" | "email" | "password" | "confirm";

function SignupPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (values.name.trim().length < 2) next.name = "Enter your full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) next.email = "Enter a valid email address.";
    if (values.password.length < 8) next.password = "Use at least 8 characters.";
    if (values.confirm !== values.password) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Account created — welcome to SpendWise");
      navigate({ to: "/app" });
    }, 700);
  }

  const field = (id: Field, label: string, type: string, placeholder: string, autoComplete: string) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={values[id]}
        aria-invalid={!!errors[id]}
        onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
      />
      {errors[id] ? <p className="text-xs text-destructive">{errors[id]}</p> : null}
    </div>
  );

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up SpendWise in under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        {field("name", "Name", "text", "Ankit Kumar", "name")}
        {field("email", "Email", "email", "you@example.com", "email")}
        {field("password", "Password", "password", "At least 8 characters", "new-password")}
        {field("confirm", "Confirm password", "password", "Re-enter password", "new-password")}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create Account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
