import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { requireDatabaseUrl } from "../src/server/env";

// Applies already-reviewed migrations from db/migrations. Never generates
// migrations and never seeds — generation is a development-only workflow.
const client = postgres(requireDatabaseUrl(), { max: 1 });
const db = drizzle(client);

async function main() {
  await migrate(db, { migrationsFolder: "./db/migrations" });
  process.exit(0);
}

main().catch((error) => {
  console.error("Database migration failed", error);
  process.exit(1);
});
