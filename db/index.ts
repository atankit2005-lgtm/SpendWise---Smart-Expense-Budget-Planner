import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

export type SpendWiseDatabase = PostgresJsDatabase<typeof schema>;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

let client: ReturnType<typeof postgres> | undefined;
let dbInstance: SpendWiseDatabase | undefined;

export function getDb(): SpendWiseDatabase {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the database layer.");
  }

  if (!dbInstance) {
    client = postgres(connectionString, { max: 10 });
    dbInstance = drizzle(client, { schema });
  }

  return dbInstance;
}

export const db = new Proxy({} as SpendWiseDatabase, {
  get(_target, property) {
    const target = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = target[property];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  },
});

export default db;
