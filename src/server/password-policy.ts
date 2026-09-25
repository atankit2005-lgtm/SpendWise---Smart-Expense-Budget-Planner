import { ValidationError } from "./errors";

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters.");
  }
}
