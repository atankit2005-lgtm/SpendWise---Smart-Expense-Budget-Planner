# Database & deployment notes

SpendWise persists everything in PostgreSQL via Drizzle ORM. The schema in
`db/schema.ts` and the committed migrations in `db/migrations/` are the source
of truth.

## Requirements

- **PostgreSQL 13+** (migrations default UUIDs with `gen_random_uuid()`).
- **`citext` extension** — migrations run `CREATE EXTENSION IF NOT EXISTS citext`
  (used for case-insensitive unique user emails). The hosted provider must
  permit this extension (Neon, Supabase, AWS RDS/Neon-style managed PostgreSQL
  all do; some managed hosts require enabling it in a dashboard first).
- **`DATABASE_URL`** — required for the application runtime and every `db:*`
  script. It is validated centrally in `src/server/env.ts`: it must be a
  `postgres://` or `postgresql://` URL, and in production a missing value
  throws instead of falling back to any development default. If the hosted
  provider requires TLS, include `?sslmode=require` in the URL. Never commit
  `.env`; `.env.example` shows the expected shape. The `db:*` scripts load a
  local `.env` automatically when one exists (in production, `DATABASE_URL`
  comes from the deployment environment instead).

## Migrations

- Migrations are **committed to Git** and generated only in development:
  `npm run db:generate` (after a `db/schema.ts` change), then review the SQL.
- `npm run db:migrate` **applies already-reviewed migrations only** — it never
  generates migrations and never seeds data. Applied migrations are tracked in
  the database by the Drizzle migrator, so re-running is a safe no-op.
- Production deployment order:
  1. set `DATABASE_URL` to the hosted PostgreSQL instance,
  2. run the migration command (`npm run db:migrate`),
  3. start the application.
- Migrations must be applied **before** production traffic. `/api/ready` is a
  connectivity check only — it deliberately does not verify or repair
  migration state; that is a deployment responsibility.
- Never alter the production schema manually; every schema change goes through
  a migration.

## Seeding

- `npm run db:seed` inserts development sample data and **refuses to run when
  `NODE_ENV=production`**. Production must never be seeded.
