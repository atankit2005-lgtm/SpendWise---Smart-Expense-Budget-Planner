# SpendWise

SpendWise is an AI-powered personal finance platform built with React, Vite, and TanStack Start/Router. It provides authenticated user accounts backed by PostgreSQL, user-scoped financial records, realtime synchronization over server-sent events (SSE), and deterministic financial intelligence derived from persisted data.

## Features

- Transactions, budgets, savings goals, analytics, notifications, and profile/settings management
- Secure password hashing, opaque session cookies, authentication hardening, and process-local rate limiting
- PostgreSQL persistence with user-scoped queries and atomic account initialization
- Realtime finance snapshot invalidation and synchronization using SSE
- Deterministic financial intelligence and AI-assisted insights based on the authenticated user's data
- Authenticated personal-data JSON export
- Health and readiness endpoints for runtime checks

Password recovery email delivery and full two-factor authentication are not currently implemented. AI insights are derived at runtime rather than persisted as analytics snapshots.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

Database setup (PostgreSQL, `DATABASE_URL`, migrations) and production migration rules: see [DATABASE.md](DATABASE.md).

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
npm run dev
```

Run the test suite and production build with:

```sh
npm test
npm run build
```
