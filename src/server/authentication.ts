import { categories, userSettings } from "../../db/schema";
import { categories as defaultCategories } from "@/data/mock";
import db, { isDatabaseConfigured } from "./db";
import { DuplicateResourceError, UnauthorizedError, ValidationError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroyCurrentSession, getSessionUserId } from "./session";
import { createUser, getUserByEmail, getUserById, type UserRecord } from "./repositories/users";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateCredentials(email: string, password: string): void {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError("Enter a valid email address.");
  if (password.length < 8) throw new ValidationError("Password must be at least 8 characters.");
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<UserRecord> {
  if (!isDatabaseConfigured()) throw new Error("Database persistence is not configured.");
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (name.length < 2) throw new ValidationError("Enter your full name.");
  validateCredentials(email, input.password);
  if (await getUserByEmail(email)) throw new DuplicateResourceError("An account with that email already exists.");

  const user = await createUser({ name, email, passwordHash: await hashPassword(input.password) });
  await db.insert(userSettings).values({ userId: user.id });
  await db.insert(categories).values(
    defaultCategories.map((category) => ({
      userId: user.id,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
    })),
  );
  await createSession(user.id);
  return user;
}

export async function logIn(input: { email: string; password: string }): Promise<UserRecord> {
  if (!isDatabaseConfigured()) throw new Error("Database persistence is not configured.");
  const email = normalizeEmail(input.email);
  validateCredentials(email, input.password);
  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password.");
  }
  await createSession(user.id);
  return user;
}

export async function logOut(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await destroyCurrentSession();
}

export async function getCurrentSessionUser(): Promise<UserRecord | null> {
  if (!isDatabaseConfigured()) return null;
  const userId = await getSessionUserId();
  return userId ? getUserById(userId) : null;
}

export async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new UnauthorizedError("You must be signed in to access SpendWise.");
  return userId;
}
