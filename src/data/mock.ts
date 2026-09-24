import type {
  AIInsight,
  AppNotification,
  Budget,
  Category,
  Goal,
  TimeRange,
  Transaction,
  User,
} from "@/types";

export const currentUser: User = {
  id: "usr_001",
  name: "Ankit Kumar",
  email: "ankit.kumar@spendwise.app",
  phone: "+91 98765 43210",
  location: "Bengaluru, India",
  currency: "INR",
  avatarInitials: "AK",
  memberSince: "2024-08-14",
  occupation: "Product Engineer",
};

export const categories: Category[] = [
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

export function categoryName(id: string) {
  return categories.find((c) => c.id === id)?.name ?? "Uncategorised";
}

export function categoryColor(id: string) {
  return categories.find((c) => c.id === id)?.color ?? "var(--chart-2)";
}

const tx = (
  id: string,
  date: string,
  amount: number,
  type: Transaction["type"],
  categoryId: string,
  description: string,
  paymentMethod: Transaction["paymentMethod"],
  notes?: string,
): Transaction => ({
  id,
  date,
  amount,
  type,
  categoryId,
  description,
  paymentMethod,
  notes,
  createdAt: `${date}T10:00:00.000Z`,
});

export const transactions: Transaction[] = [
  tx("txn_001", "2026-09-10", 1240, "expense", "cat_food", "Dinner at Toit Brewpub", "Credit Card", "Weekend with friends"),
  tx("txn_002", "2026-09-09", 2899, "expense", "cat_shopping", "Running shoes", "UPI"),
  tx("txn_003", "2026-09-09", 320, "expense", "cat_transport", "Auto to office", "UPI"),
  tx("txn_004", "2026-09-08", 640, "expense", "cat_food", "Weekly groceries top-up", "Debit Card"),
  tx("txn_005", "2026-09-07", 1499, "expense", "cat_entertainment", "Concert tickets", "Credit Card"),
  tx("txn_006", "2026-09-06", 8500, "income", "cat_freelance", "Design retainer — Northline", "Net Banking", "Invoice #221"),
  tx("txn_007", "2026-09-05", 12500, "expense", "cat_rent", "September rent", "Net Banking"),
  tx("txn_008", "2026-09-05", 1180, "expense", "cat_bills", "Electricity bill", "UPI"),
  tx("txn_009", "2026-09-04", 460, "expense", "cat_transport", "Metro recharge", "UPI"),
  tx("txn_010", "2026-09-03", 2100, "expense", "cat_health", "Dental checkup", "Debit Card"),
  tx("txn_011", "2026-09-02", 20000, "income", "cat_salary", "Monthly salary", "Net Banking"),
  tx("txn_012", "2026-09-02", 899, "expense", "cat_bills", "Broadband", "UPI"),
  tx("txn_013", "2026-09-01", 780, "expense", "cat_food", "Cafe brunch", "Credit Card"),
  tx("txn_014", "2026-08-31", 3400, "expense", "cat_shopping", "Winter jacket", "Credit Card"),
  tx("txn_015", "2026-08-30", 260, "expense", "cat_transport", "Cab ride", "UPI"),
  tx("txn_016", "2026-08-29", 1650, "expense", "cat_food", "Team lunch", "Credit Card"),
  tx("txn_017", "2026-08-28", 4500, "income", "cat_investments", "Mutual fund payout", "Net Banking"),
  tx("txn_018", "2026-08-27", 540, "expense", "cat_entertainment", "Streaming subscriptions", "Credit Card"),
  tx("txn_019", "2026-08-26", 1290, "expense", "cat_bills", "Mobile postpaid", "UPI"),
  tx("txn_020", "2026-08-25", 980, "expense", "cat_food", "Groceries", "Debit Card"),
  tx("txn_021", "2026-08-24", 2200, "expense", "cat_shopping", "Home essentials", "UPI"),
  tx("txn_022", "2026-08-23", 410, "expense", "cat_transport", "Fuel", "Cash"),
  tx("txn_023", "2026-08-22", 1750, "expense", "cat_health", "Pharmacy & supplements", "UPI"),
  tx("txn_024", "2026-08-21", 6200, "income", "cat_freelance", "Landing page project", "Net Banking"),
  tx("txn_025", "2026-08-20", 1320, "expense", "cat_entertainment", "Weekend movie & dinner", "Credit Card"),
];

export const budgets: Budget[] = [
  { id: "bdg_001", categoryId: "cat_food", limit: 5000, spent: 4100, period: "monthly", startDate: "2026-09-01", createdAt: "2026-06-01" },
  { id: "bdg_002", categoryId: "cat_shopping", limit: 4000, spent: 3200, period: "monthly", startDate: "2026-09-01", createdAt: "2026-06-01" },
  { id: "bdg_003", categoryId: "cat_transport", limit: 3000, spent: 1400, period: "monthly", startDate: "2026-09-01", createdAt: "2026-06-01" },
  { id: "bdg_004", categoryId: "cat_bills", limit: 4000, spent: 3369, period: "monthly", startDate: "2026-09-01", createdAt: "2026-06-01" },
  { id: "bdg_005", categoryId: "cat_entertainment", limit: 2500, spent: 2600, period: "monthly", startDate: "2026-09-01", createdAt: "2026-07-01" },
  { id: "bdg_006", categoryId: "cat_health", limit: 3000, spent: 1250, period: "monthly", startDate: "2026-09-01", createdAt: "2026-07-01" },
];

export const goals: Goal[] = [
  { id: "goal_001", name: "Emergency Fund", targetAmount: 200000, currentAmount: 124000, targetDate: "2027-03-31", status: "active", note: "Six months of essential expenses.", createdAt: "2025-11-02" },
  { id: "goal_002", name: "Japan Trip", targetAmount: 180000, currentAmount: 64500, targetDate: "2027-10-15", status: "active", note: "Two weeks, spring season.", createdAt: "2026-01-18" },
  { id: "goal_003", name: "New Laptop", targetAmount: 145000, currentAmount: 138000, targetDate: "2026-12-01", status: "active", note: "Upgrade for freelance work.", createdAt: "2026-03-09" },
  { id: "goal_004", name: "Home Office Setup", targetAmount: 60000, currentAmount: 60000, targetDate: "2026-08-01", status: "completed", createdAt: "2025-09-21" },
];

export const notifications: AppNotification[] = [
  { id: "ntf_001", type: "budget_warning", title: "Food budget is 82% used", message: "You've spent ₹4,100 of your ₹5,000 monthly food budget with 20 days remaining.", read: false, createdAt: "2026-09-11T09:20:00.000Z" },
  { id: "ntf_002", type: "budget_exceeded", title: "Entertainment budget exceeded", message: "Entertainment spending reached ₹2,600 against a ₹2,500 limit.", read: false, createdAt: "2026-09-11T07:05:00.000Z" },
  { id: "ntf_003", type: "unusual_transaction", title: "Unusual transaction detected", message: "₹2,899 at a sportswear store is 3.1× your typical shopping transaction.", read: false, createdAt: "2026-09-10T18:42:00.000Z" },
  { id: "ntf_004", type: "goal_progress", title: "New Laptop goal is 95% funded", message: "₹7,000 left to reach your ₹1,45,000 target.", read: true, createdAt: "2026-09-09T11:15:00.000Z" },
  { id: "ntf_005", type: "insight", title: "Savings rate improved", message: "You saved 35% of income this month, up from 31% last month.", read: true, createdAt: "2026-09-08T08:30:00.000Z" },
  { id: "ntf_006", type: "budget_warning", title: "Bills budget nearing limit", message: "Bills & utilities at ₹3,369 of ₹4,000.", read: true, createdAt: "2026-09-06T16:00:00.000Z" },
];

export const aiInsights: AIInsight[] = [
  { id: "ins_001", title: "Food spending is trending up", description: "Your food spending is 24% higher than your recent average. Dining out accounts for most of the increase.", severity: "warning", metric: "+24%", confidence: 0.91, createdAt: "2026-09-11T06:00:00.000Z" },
  { id: "ins_002", title: "Strong savings month", description: "You're on track to save ₹10,080 this month — your best result in six months.", severity: "positive", metric: "₹10,080", confidence: 0.88, createdAt: "2026-09-10T06:00:00.000Z" },
  { id: "ins_003", title: "Recurring subscriptions detected", description: "₹540 of monthly streaming charges renew on the 27th. Consolidating could save ₹2,160 a year.", severity: "info", metric: "₹540/mo", confidence: 0.76, createdAt: "2026-09-09T06:00:00.000Z" },
  { id: "ins_004", title: "Entertainment budget breached", description: "Entertainment exceeded its limit by ₹100. Consider raising the limit or trimming weekend plans.", severity: "critical", metric: "-₹100", confidence: 0.95, createdAt: "2026-09-08T06:00:00.000Z" },
  { id: "ins_005", title: "Transport is well controlled", description: "Transport is only 47% utilised with three weeks gone — you could reallocate ₹800 to savings.", severity: "positive", metric: "47%", confidence: 0.82, createdAt: "2026-09-07T06:00:00.000Z" },
];

export const spendingForecast = [
  { label: "Apr", actual: 17600, forecast: null as number | null },
  { label: "May", actual: 19250, forecast: null },
  { label: "Jun", actual: 18100, forecast: null },
  { label: "Jul", actual: 20340, forecast: null },
  { label: "Aug", actual: 19010, forecast: null },
  { label: "Sep", actual: 18420, forecast: 18420 },
  { label: "Oct", actual: null, forecast: 21400 },
  { label: "Nov", actual: null, forecast: 20250 },
  { label: "Dec", actual: null, forecast: 23100 },
];

export const timeRangeLabels: Record<TimeRange, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  "3m": "3 Months",
  "6m": "6 Months",
  "1y": "1 Year",
};
