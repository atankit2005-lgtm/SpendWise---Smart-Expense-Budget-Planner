import { AI_CONFIG } from "@/lib/ai/config";
import type { Category, Transaction } from "@/types";

export interface CategorizationSuggestion {
  categoryId: string;
  confidence: number; // 0-1
  reason: string;
  source: "history" | "keyword";
}

interface MerchantRule {
  categoryId: string;
  keywords: string[];
  label: string;
}

/**
 * Explainable merchant/description keyword rules. Deliberately simple and
 * data-free (no network calls, no ML model) so behaviour is fully
 * predictable and easy to extend.
 */
const MERCHANT_RULES: MerchantRule[] = [
  {
    categoryId: "cat_food",
    label: "food & dining",
    keywords: [
      "swiggy",
      "zomato",
      "restaurant",
      "cafe",
      "dinner",
      "lunch",
      "brunch",
      "groceries",
      "grocery",
      "food",
      "dining",
      "bakery",
      "coffee",
    ],
  },
  {
    categoryId: "cat_transport",
    label: "transport",
    keywords: [
      "uber",
      "ola",
      "auto",
      "metro",
      "cab",
      "taxi",
      "fuel",
      "petrol",
      "diesel",
      "bus fare",
      "train",
      "parking",
      "toll",
    ],
  },
  {
    categoryId: "cat_entertainment",
    label: "entertainment",
    keywords: [
      "netflix",
      "spotify",
      "prime video",
      "hotstar",
      "movie",
      "cinema",
      "concert",
      "streaming",
      "game pass",
      "playstation",
      "steam",
    ],
  },
  {
    categoryId: "cat_shopping",
    label: "shopping",
    keywords: [
      "amazon",
      "flipkart",
      "myntra",
      "ajio",
      "mall",
      "shopping",
      "store",
      "shoes",
      "jacket",
      "apparel",
      "electronics",
    ],
  },
  {
    categoryId: "cat_bills",
    label: "bills & utilities",
    keywords: [
      "electricity",
      "broadband",
      "wifi",
      "mobile bill",
      "postpaid",
      "water bill",
      "gas bill",
      "utility",
      "dth",
      "internet",
    ],
  },
  {
    categoryId: "cat_health",
    label: "health",
    keywords: [
      "pharmacy",
      "clinic",
      "hospital",
      "doctor",
      "dental",
      "medicine",
      "diagnostic",
      "lab test",
      "physio",
    ],
  },
  {
    categoryId: "cat_rent",
    label: "rent",
    keywords: ["rent", "landlord"],
  },
  {
    categoryId: "cat_salary",
    label: "salary",
    keywords: ["salary", "payroll", "stipend"],
  },
  {
    categoryId: "cat_freelance",
    label: "freelance",
    keywords: ["freelance", "retainer", "invoice", "consulting fee"],
  },
  {
    categoryId: "cat_investments",
    label: "investments",
    keywords: ["mutual fund", "dividend", "stocks", "sip", "investment payout"],
  },
];

function normalizeDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Suggest a category using explainable keyword matching against the
 * transaction description. Only matches rules for categories whose `type`
 * (income/expense) agrees with the transaction being categorized.
 */
export function suggestCategoryFromKeywords(
  description: string,
  type: Transaction["type"],
  categories: Category[],
): CategorizationSuggestion | null {
  const text = normalizeDescription(description);
  if (!text) return null;

  for (const rule of MERCHANT_RULES) {
    const matchedKeyword = rule.keywords.find((keyword) => text.includes(keyword));
    if (!matchedKeyword) continue;

    const category = categories.find((c) => c.id === rule.categoryId && c.type === type);
    if (!category) continue;

    return {
      categoryId: category.id,
      confidence: AI_CONFIG.categorization.keywordConfidence,
      reason: `Description contains "${matchedKeyword}", a common ${rule.label} term`,
      source: "keyword",
    };
  }

  return null;
}

/**
 * Suggest a category by looking at how the user has categorized similar
 * (same normalized description, same type) transactions before. This lets
 * recurring, user-specific merchants ("Ravi's Tiffin Service") get
 * categorized correctly even when they don't match a generic keyword rule.
 */
export function suggestCategoryFromHistory(
  description: string,
  type: Transaction["type"],
  transactions: Transaction[],
): CategorizationSuggestion | null {
  const text = normalizeDescription(description);
  if (!text) return null;

  const matches = transactions.filter(
    (t) => t.type === type && normalizeDescription(t.description) === text,
  );

  if (matches.length === 0) return null;

  const counts = new Map<string, number>();
  matches.forEach((m) => {
    counts.set(m.categoryId, (counts.get(m.categoryId) ?? 0) + 1);
  });

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return null;

  const [categoryId, count] = top;
  const confidence = Math.min(
    AI_CONFIG.categorization.historyConfidenceCap,
    AI_CONFIG.categorization.historyBaseConfidence +
      (count - 1) * AI_CONFIG.categorization.historyConfidencePerMatch,
  );

  return {
    categoryId,
    confidence,
    reason: `Matches ${count} earlier transaction${count === 1 ? "" : "s"} with the same description`,
    source: "history",
  };
}

/**
 * Best-effort automatic categorization for a transaction that doesn't
 * already have a useful (non-empty) category. Never overwrites a
 * user-selected category — callers are responsible for only calling this
 * when `categoryId` is missing/empty.
 *
 * History-based matches are preferred over generic keyword rules because
 * they reflect the user's own past behaviour.
 */
export function categorizeTransaction(
  input: { description: string; type: Transaction["type"]; categoryId?: string | undefined },
  transactions: Transaction[],
  categories: Category[],
): CategorizationSuggestion | null {
  const hasUserCategory = Boolean(input.categoryId && input.categoryId.trim() !== "");
  if (hasUserCategory) return null;

  const description = input.description ?? "";
  if (!description.trim()) return null;

  const historySuggestion = suggestCategoryFromHistory(description, input.type, transactions);
  if (historySuggestion && historySuggestion.confidence >= AI_CONFIG.categorization.minConfidence) {
    return historySuggestion;
  }

  const keywordSuggestion = suggestCategoryFromKeywords(description, input.type, categories);
  if (keywordSuggestion && keywordSuggestion.confidence >= AI_CONFIG.categorization.minConfidence) {
    return keywordSuggestion;
  }

  return historySuggestion ?? keywordSuggestion;
}
