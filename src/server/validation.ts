import { z } from "zod";
import { ValidationError } from "./errors";

const moneySchema = z.number().finite().positive();
const optionalMoneySchema = z.number().finite().nonnegative();

export function assertPositiveMoney(value: number | string, fieldName = "amount"): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  const result = moneySchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(`${fieldName} must be greater than zero.`);
  }

  return parsed;
}

export function assertNonNegativeMoney(value: number | string, fieldName = "amount"): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  const result = optionalMoneySchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(`${fieldName} must be zero or greater.`);
  }

  return parsed;
}

export function assertRequiredText(value: string | null | undefined, fieldName: string): string {
  const text = value?.trim();
  if (!text) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  return text;
}

export function isValidDateString(value: string | null | undefined): value is string {
  if (!value) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime());
}

export function assertDateString(value: string | null | undefined, fieldName: string): string {
  const text = value?.trim();
  if (!text || !isValidDateString(text)) {
    throw new ValidationError(`${fieldName} must be a valid ISO date.`);
  }
  return text;
}

export function assertConfidence(value: number | string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new ValidationError("confidence must be between 0 and 1.");
  }
  return parsed;
}
