import { UnauthorizedError } from "./errors";

export function resolveUserId(userId?: string | null): string {
  const value = userId ?? process.env["DEMO_USER_ID"] ?? null;

  if (!value || !value.trim()) {
    throw new UnauthorizedError("A current user context is required for this operation.");
  }

  return value.trim();
}
