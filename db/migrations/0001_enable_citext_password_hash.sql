CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;
