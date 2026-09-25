import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCategoryColor, resolveCategoryName } from "./category-labels";
import type { Category } from "@/types";

const persisted: Category[] = [
  {
    id: "e0201921-067e-488d-8d68-54d2f0003801",
    name: "Food & Dining",
    type: "expense",
    color: "var(--chart-1)",
    icon: "utensils",
  },
];

describe("persisted category labels", () => {
  it("resolves PostgreSQL category UUIDs to the user's category name and color", () => {
    const id = "e0201921-067e-488d-8d68-54d2f0003801";
    assert.equal(resolveCategoryName(persisted, id), "Food & Dining");
    assert.equal(resolveCategoryColor(persisted, id), "var(--chart-1)");
  });

  it("does not treat mock ids such as cat_food as a match for UUID categories", () => {
    assert.equal(resolveCategoryName(persisted, "cat_food"), "Uncategorised");
  });

  it("falls back when the id is unknown", () => {
    assert.equal(resolveCategoryName(persisted, "missing"), "Uncategorised");
    assert.equal(resolveCategoryColor(persisted, "missing"), "var(--chart-2)");
  });
});
