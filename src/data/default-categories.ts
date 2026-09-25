import type { Category } from "@/types";

export const defaultCategories: Category[] = [
  { id: "cat_food", name: "Food & Dining", type: "expense", color: "var(--chart-1)", icon: "utensils" },
  { id: "cat_shopping", name: "Shopping", type: "expense", color: "var(--chart-2)", icon: "shopping-bag" },
  { id: "cat_transport", name: "Transport", type: "expense", color: "var(--chart-3)", icon: "car" },
  { id: "cat_bills", name: "Bills & Utilities", type: "expense", color: "var(--chart-4)", icon: "receipt" },
  { id: "cat_entertainment", name: "Entertainment", type: "expense", color: "var(--chart-5)", icon: "clapperboard" },
  { id: "cat_health", name: "Health", type: "expense", color: "var(--chart-2)", icon: "heart-pulse" },
  { id: "cat_rent", name: "Rent", type: "expense", color: "var(--chart-4)", icon: "home" },
  { id: "cat_salary", name: "Salary", type: "income", color: "var(--chart-1)", icon: "wallet" },
  { id: "cat_freelance", name: "Freelance", type: "income", color: "var(--chart-5)", icon: "briefcase" },
  { id: "cat_investments", name: "Investments", type: "income", color: "var(--chart-2)", icon: "trending-up" },
];
