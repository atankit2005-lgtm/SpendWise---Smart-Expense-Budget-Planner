/**
 * Environment configuration layer.
 *
 * Rules:
 * - Never throw at import time: dev/test processes must be able to load
 *   server modules without a database configured.
 * - Never include a DATABASE_URL value (or any other secret) in an error
 *   message — connection strings embed credentials.
 * - Production must fail loudly and early when required configuration is
 *   missing; there is no silent fallback to development defaults.
 */

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/** Trimmed DATABASE_URL, or undefined when absent. Never throws. */
export function getDatabaseUrl(): string | undefined {
  const url = process.env["DATABASE_URL"]?.trim();
  return url ? url : undefined;
}

/**
 * DATABASE_URL, validated. Throws a ConfigurationError with an actionable
 * (secret-free) message when it is missing or is not a PostgreSQL URL.
 */
export function requireDatabaseUrl(): string {
  const url = getDatabaseUrl();

  if (!url) {
    throw new ConfigurationError(
      isProduction()
        ? "DATABASE_URL is not set. Refusing to serve database-backed requests in production without an explicitly configured PostgreSQL connection. Set DATABASE_URL in the deployment environment."
        : "DATABASE_URL is not set. Copy .env.example to .env and point DATABASE_URL at a local PostgreSQL instance.",
    );
  }

  if (!/^postgres(?:ql)?:\/\//i.test(url)) {
    throw new ConfigurationError(
      "DATABASE_URL is set but is not a PostgreSQL connection string (expected a postgres:// or postgresql:// URL). The current value has not been logged.",
    );
  }

  return url;
}
