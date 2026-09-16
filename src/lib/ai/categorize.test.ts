import assert from "node:assert/strict";
import test from "node:test";

import {
  categorizeTransaction,
  suggestCategoryFromHistory,
  suggestCategoryFromKeywords,
} from "@/lib/ai/categorize";
import type { Category, Transaction } from "@/types";

const categories: Category[] = [
  { id: "cat_food", name: "Food & Dining", type: "expense", color: "red", icon: "utensils" },
  { id: "cat_transport", name: "Transport", type: "expense", color: "blue", icon: "car" },
  { id: "cat_salary", name: "Salary", type: "income", color: "green", icon: "wallet" },
];

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? "txn_test",
    amount: overrides.amount ?? 100,
    type: overrides.type ?? "expense",
    categoryId: overrides.categoryId ?? "cat_food",
    description: overrides.description ?? "Test transaction",
    paymentMethod: overrides.paymentMethod ?? "UPI",
    date: overrides.date ?? "2026-01-01",
    notes: overrides.notes,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

test("suggestCategoryFromKeywords matches a known merchant keyword", () => {
  const suggestion = suggestCategoryFromKeywords("Swiggy order", "expense", categories);
  assert.ok(suggestion);
  assert.equal(suggestion.categoryId, "cat_food");
  assert.equal(suggestion.source, "keyword");
});

test("suggestCategoryFromKeywords is case-insensitive", () => {
  const suggestion = suggestCategoryFromKeywords("UBER ride to office", "expense", categories);
  assert.ok(suggestion);
  assert.equal(suggestion.categoryId, "cat_transport");
});

test("suggestCategoryFromKeywords returns null when nothing matches", () => {
  const suggestion = suggestCategoryFromKeywords("Mystery payment 4471", "expense", categories);
  assert.equal(suggestion, null);
});

test("suggestCategoryFromKeywords only matches categories of the same transaction type", () => {
  // "salary" keyword maps to an income category; requesting an expense match should fail.
  const suggestion = suggestCategoryFromKeywords("salary advance", "expense", categories);
  assert.equal(suggestion, null);
});

test("suggestCategoryFromHistory finds a prior matching description", () => {
  const history = [
    makeTransaction({ id: "t1", description: "Ravi's Tiffin Service", categoryId: "cat_food" }),
    makeTransaction({ id: "t2", description: "Ravi's Tiffin Service", categoryId: "cat_food" }),
  ];
  const suggestion = suggestCategoryFromHistory("ravi's tiffin service", "expense", history);
  assert.ok(suggestion);
  assert.equal(suggestion.categoryId, "cat_food");
  assert.equal(suggestion.source, "history");
});

test("suggestCategoryFromHistory confidence grows with more corroborating matches", () => {
  const oneMatch = suggestCategoryFromHistory("corner store", "expense", [
    makeTransaction({ description: "Corner Store" }),
  ]);
  const threeMatches = suggestCategoryFromHistory("corner store", "expense", [
    makeTransaction({ id: "a", description: "Corner Store" }),
    makeTransaction({ id: "b", description: "Corner Store" }),
    makeTransaction({ id: "c", description: "Corner Store" }),
  ]);
  assert.ok(oneMatch);
  assert.ok(threeMatches);
  assert.ok(threeMatches.confidence > oneMatch.confidence);
});

test("suggestCategoryFromHistory returns null with no history", () => {
  assert.equal(suggestCategoryFromHistory("anything", "expense", []), null);
});

test("categorizeTransaction never overwrites a user-selected category", () => {
  const result = categorizeTransaction(
    { description: "Swiggy order", type: "expense", categoryId: "cat_transport" },
    [],
    categories,
  );
  assert.equal(result, null);
});

test("categorizeTransaction prefers history over generic keyword rules", () => {
  const history = [
    makeTransaction({
      id: "t1",
      description: "Metro top-up",
      categoryId: "cat_food",
      type: "expense",
    }),
    makeTransaction({
      id: "t2",
      description: "Metro top-up",
      categoryId: "cat_food",
      type: "expense",
    }),
  ];
  // "metro" would normally match the transport keyword rule, but the user has
  // consistently categorized this exact description as food in the past.
  const result = categorizeTransaction(
    { description: "Metro top-up", type: "expense", categoryId: "" },
    history,
    categories,
  );
  assert.ok(result);
  assert.equal(result.categoryId, "cat_food");
  assert.equal(result.source, "history");
});

test("categorizeTransaction falls back to keyword rules with no history", () => {
  const result = categorizeTransaction(
    { description: "Uber ride", type: "expense", categoryId: undefined },
    [],
    categories,
  );
  assert.ok(result);
  assert.equal(result.categoryId, "cat_transport");
});

test("categorizeTransaction returns null for an empty description", () => {
  const result = categorizeTransaction(
    { description: "   ", type: "expense", categoryId: "" },
    [],
    categories,
  );
  assert.equal(result, null);
});

test("categorizeTransaction returns null when nothing matches", () => {
  const result = categorizeTransaction(
    { description: "Unlabeled payment", type: "expense", categoryId: "" },
    [],
    categories,
  );
  assert.equal(result, null);
});
