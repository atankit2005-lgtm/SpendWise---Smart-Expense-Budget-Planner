import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL is required for the database layer.");
}

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client);

export default db;
