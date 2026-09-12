import { eq } from "drizzle-orm";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { users } from "../../../db/schema";
import { resolveUserId } from "../auth";
import { DuplicateResourceError, NotFoundError } from "../errors";
import db from "../db";

export type UserRecord = InferSelectModel<typeof users>;
export type UserInsert = InferInsertModel<typeof users>;

export async function getUserById(userId: string): Promise<UserRecord> {
  const currentUserId = resolveUserId(userId);

  const row = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);

  if (!row[0]) {
    throw new NotFoundError("User not found.");
  }

  return row[0];
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = email.trim();
  if (!normalized) return null;

  const row = await db.select().from(users).where(eq(users.email, normalized as never)).limit(1);
  return row[0] ?? null;
}

export async function createUser(input: {
  email: string;
  name: string;
  phone?: string | null;
  location?: string | null;
  occupation?: string | null;
  currency?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRecord> {
  const email = input.email.trim();
  const name = input.name.trim();

  if (!email) {
    throw new Error("Email is required.");
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    throw new DuplicateResourceError("A user with that email already exists.");
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name,
      phone: input.phone ?? null,
      location: input.location ?? null,
      occupation: input.occupation ?? null,
      currency: input.currency ?? "INR",
      avatarUrl: input.avatarUrl ?? null,
    })
    .returning();

  if (!created) {
    throw new Error("User could not be created.");
  }

  return created;
}
