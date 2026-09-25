import type { Category } from "@/types";

/** Resolve a persisted (or demo) category id against the live category list. */
export function resolveCategoryName(categories: Category[], id: string): string {
  return categories.find((category) => category.id === id)?.name ?? "Uncategorised";
}

export function resolveCategoryColor(categories: Category[], id: string): string {
  return categories.find((category) => category.id === id)?.color ?? "var(--chart-2)";
}
