import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUserFn } from "@/functions/auth";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: () => <Outlet />,
});
