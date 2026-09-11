# SpendWise — Future Database Model (Stage 2)

Stage 1 is a frontend-only build backed by typed mock data (`src/types`, `src/data/mock.ts`,
`src/store/finance.tsx`). This document describes the relational model the interface is designed
to map onto when a real backend is introduced.

## Entities

### users
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| email | citext UNIQUE NOT NULL | login identity |
| name | text NOT NULL | |
| phone | text | |
| location | text | |
| occupation | text | |
| currency | char(3) NOT NULL DEFAULT 'INR' | |
| avatar_url | text | |
| created_at / updated_at | timestamptz | |

### categories
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid FK → users(id) ON DELETE CASCADE, NULL for system defaults | |
| name | text NOT NULL | |
| type | enum('income','expense') NOT NULL | |
| color | text | |
| icon | text | |
UNIQUE (user_id, name, type)

### transactions
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid FK → users(id) ON DELETE CASCADE | |
| category_id | uuid FK → categories(id) ON DELETE RESTRICT | |
| amount | numeric(12,2) NOT NULL CHECK (amount > 0) | |
| type | enum('income','expense') NOT NULL | |
| description | text NOT NULL | |
| payment_method | enum('upi','credit_card','debit_card','cash','net_banking') | |
| occurred_on | date NOT NULL | |
| notes | text | |
| created_at / updated_at | timestamptz | |

### budgets
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid FK → users(id) ON DELETE CASCADE | |
| category_id | uuid FK → categories(id) ON DELETE CASCADE | |
| limit_amount | numeric(12,2) NOT NULL CHECK (limit_amount > 0) | |
| period | enum('weekly','monthly','yearly') NOT NULL | |
| start_date | date NOT NULL | |
| created_at / updated_at | timestamptz | |
UNIQUE (user_id, category_id, period, start_date). `spent` is derived from transactions, not stored.

### goals
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid FK → users(id) ON DELETE CASCADE | |
| name | text NOT NULL | |
| target_amount | numeric(12,2) NOT NULL | |
| current_amount | numeric(12,2) NOT NULL DEFAULT 0 | |
| target_date | date NOT NULL | |
| status | enum('active','paused','completed') NOT NULL DEFAULT 'active' | |
| note | text | |
| created_at / updated_at | timestamptz | |

### goal_contributions (optional, Stage 2+)
id uuid PK · goal_id FK → goals · amount numeric(12,2) · contributed_on date · source_transaction_id FK → transactions NULL

### notifications
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid FK → users(id) ON DELETE CASCADE | |
| type | enum('budget_warning','budget_exceeded','unusual_transaction','goal_progress','insight') | |
| title | text NOT NULL | |
| message | text NOT NULL | |
| read_at | timestamptz NULL | null means unread |
| related_entity_type / related_entity_id | text / uuid | polymorphic pointer |
| created_at | timestamptz | |

### ai_insights
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid FK → users(id) ON DELETE CASCADE | |
| title | text NOT NULL | |
| description | text NOT NULL | |
| severity | enum('info','positive','warning','critical') | |
| metric | text | display value such as "+24%" |
| confidence | numeric(3,2) CHECK (confidence BETWEEN 0 AND 1) | |
| model_version | text | |
| generated_at | timestamptz | |

### analytics_snapshots (materialised for fast dashboards)
id uuid PK · user_id FK → users · range enum('7d','30d','3m','6m','1y') · period_start date ·
period_end date · total_income numeric · total_expense numeric · series jsonb · breakdown jsonb ·
computed_at timestamptz. UNIQUE (user_id, range, period_end).

### user_settings
user_id PK/FK → users · theme text · compact_density bool · animations bool · budget_alerts bool ·
weekly_digest bool · anomaly_alerts bool · share_anonymised bool · hide_amounts bool ·
two_factor_enabled bool

## Relationships

- users 1—N transactions, budgets, goals, notifications, ai_insights, categories (custom)
- categories 1—N transactions, 1—N budgets
- goals 1—N goal_contributions
- users 1—1 user_settings

## Indexes

- transactions (user_id, occurred_on DESC) — transaction list and pagination
- transactions (user_id, category_id, occurred_on) — category breakdowns and budget spend rollups
- transactions (user_id, type, occurred_on) — income vs expense aggregation
- budgets (user_id, period, start_date)
- goals (user_id, status, target_date)
- notifications (user_id, read_at, created_at DESC)
- ai_insights (user_id, generated_at DESC)
- analytics_snapshots (user_id, range, period_end DESC)

## Derived values

- Budget `spent` = SUM(transactions.amount) where type = 'expense' and category/period match.
- Dashboard balance / income / expenses / savings = aggregates over the current month.
- Analytics series and category breakdowns are computed per range and cached in analytics_snapshots.

## Stage 2 notes

- Every table is scoped by `user_id`; row-level security should filter on the authenticated user.
- Money is stored as `numeric(12,2)` in the smallest reportable unit for INR (no floats).
- The frontend TypeScript interfaces in `src/types/index.ts` map 1:1 onto these tables
  (camelCase in the client, snake_case in the database).
