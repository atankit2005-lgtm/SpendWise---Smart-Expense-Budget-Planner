import { and, eq, isNull, or } from "drizzle-orm";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { categories } from "../../../db/schema";
import { resolveUserId } from "../auth";
import { DuplicateResourceError, NotFoundError } from "../errors";
import db from "../db";

export type CategoryRecord = InferSelectModel<typeof categories>;
export type CategoryInsert = InferInsertModel<typeof categories>;

export async function listCategoriesForUser(userId: string): Promise<CategoryRecord[]> {
  const currentUserId = resolveUserId(userId);

  return db
    .select()
    .from(categories)
    .where(or(eq(categories.userId, currentUserId), isNull(categories.userId)));
}

export async function getCategoryForUser(userId: string, categoryId: string): Promise<CategoryRecord> {
  const currentUserId = resolveUserId(userId);

  const rows = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        or(eq(categories.userId, currentUserId), isNull(categories.userId)),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new NotFoundError("Category not found.");
  }

  return rows[0];
}

export async function createCategory(input: {
  userId: string;
  name: string;
  type: "income" | "expense";
  color?: string | null;
  icon?: string | null;
}): Promise<CategoryRecord> {
  const currentUserId = resolveUserId(input.userId);
  const name = input.name.trim();

  if (!name) {
    throw new Error("Category name is required.");
  }

  const existing = await db
    .select()
    .from(categories)
    .where(and(eq(categories.userId, currentUserId), eq(categories.name, name), eq(categories.type, input.type)))
    .limit(1);

  if (existing[0]) {
    throw new DuplicateResourceError("A category with that name and type already exists.");
  }

  const [created] = await db
    .insert(categories)
    .values({
      userId: currentUserId,
      name,
      type: input.type,
      color: input.color ?? null,
      icon: input.icon ?? null,
    })
    .returning();

  if (!created) {
    throw new Error("Category could not be created.");
  }

  return created;
}

export async function updateCategory(userId: string, categoryId: string, patch: Partial<Omit<CategoryInsert, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<CategoryRecord> {
  const currentUserId = resolveUserId(userId);

  const existing = await getCategoryForUser(currentUserId, categoryId);

  const updates: Partial<CategoryRecord> = {};

  if (patch.name !== undefined) {
    updates.name = patch.name.trim();
  }

  if (patch.type !== undefined) {
    updates.type = patch.type;
  }

  if (patch.color !== undefined) {
    updates.color = patch.color ?? null;
  }

  if (patch.icon !== undefined) {
    updates.icon = patch.icon ?? null;
  }

  if (updates.name !== undefined && !updates.name.trim()) {
    throw new Error("Category name is required.");
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  const [updated] = await db
    .update(categories)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(eq(categories.id, categoryId), eq(categories.userId, currentUserId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Category not found.");
  }

  return updated;
}

export async function deleteCategory(userId: string, categoryId: string): Promise<boolean> {
  const currentUserId = resolveUserId(userId);

  const result = await db
    .delete(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, currentUserId)))
    .returning({ id: categories.id });

  return result.length > 0;
}
