# SpendWise Stage 1 Build

Build the complete SpendWise personal finance platform (Stage 1 Build) according to the attached spec PDF (SpendWise Stage 1 Build.pdf).

Key Requirements:
1. Brand & Design:
- Name: SpendWise, AI-powered personal finance platform
- Aesthetic: Dark-first, cinematic premium fintech presentation (near-black, charcoal surfaces, clean subtle borders, refined accent color, Inter typography, Indian Rupee ₹ currency)
- Coherent mock financial data (Balance: ₹42,850, Income: ₹28,500, Expenses: ₹18,420, Savings: ₹10,080)

2. Public Pages:
- Landing page (Hero with dashboard preview, Track/Understand/Predict/Improve sections, Smart Tracking, Intelligent Analytics, Smart Budgets, Financial Goals, SpendWise Intelligence, CTA, Footer)
- Auth demo pages (/login, /signup, /forgot-password, /reset-password) with form validation and a prominent "Continue with Demo" button to jump straight into /app

3. Application Shell & Pages (/app):
- Consistent layout: left sidebar (desktop), mobile navigation, top header with user profile & notifications
- Dashboard / Overview (/app): balance/income/expense/savings metric cards with MoM % changes, Spending Trend chart, Income vs Expenses chart, Category breakdown, budget progress list, recent transactions, SpendWise Intelligence demo cards
- Transactions (/app/transactions): interactive table with search, category/type filters, date sorting, pagination, and working modals for Add, Edit, and Delete Transaction with mock state persistence
- Budgets (/app/budgets): summary cards, progress bars, create/edit/delete budget modals
- Goals (/app/goals): savings goals with visual progress, target dates, and create/edit/delete modals
- Analytics (/app/analytics): interactive time ranges (7 Days, 30 Days, 3 Months, 6 Months, 1 Year) dynamically switching chart datasets, category breakdown, monthly trends
- AI Insights (/app/ai-insights): spending forecast chart, anomaly detection card, personalized insights, budget forecast
- Notifications (/app/notifications): filterable alerts, read/unread toggles, "Mark all as read"
- Profile (/app/profile): user details, edit profile modal/form
- Settings (/app/settings): tabs for Account, Appearance, Notifications, Privacy, Security

4. Centralized Mock Data & Types:
- Well-structured TypeScript interfaces and data models (User, Transaction, Category, Budget, Goal, Notification, AIInsight, AnalyticsData)
- Interactive mock store/state so CRUD actions (adding, editing, deleting transactions, budgets, goals) visibly update across the app
- Empty, loading, and error states for data views
- Include a FUTURE_DATABASE_MODEL.md documenting the database entities, fields, relationships, and indexes for Stage 2 backend migration.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://insights-money-pilot.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9dd62b1a-217c-40fd-90df-3cfd46aa15bc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
