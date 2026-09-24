/**
 * Server-function error boundary (Stage 8.3).
 *
 * TanStack Start serializes any error thrown out of a server function with
 * seroval — which includes `name`, `message`, the `stack`, and custom
 * properties — and answers with HTTP 500 unless the response status was set
 * explicitly. Left alone, that leaks stack traces, internal messages like
 * "Database persistence is not configured." and driver errors to clients.
 *
 * `withErrorBoundary` is the single seam that fixes both:
 *   - AppError.statusCode (400/401/403/404/409/429/…) is mapped onto the HTTP
 *     response via `setResponseStatus`, which the framework's error handler
 *     picks up (`getResponse().status ?? 500`).
 *   - Everything is re-thrown as a fresh Error carrying only a safe message
 *     and a frame-free stack, so no server paths, SQL details, environment
 *     information or internal class names cross the wire.
 *   - The original error is logged server-side with full detail first.
 *
 * This is not a parallel error framework: the existing AppError hierarchy
 * stays the source of truth for intentional, user-facing failures.
 */

import { setResponseStatus } from "@tanstack/react-start/server";

import { ConfigurationError } from "./env";
import { AppError } from "./errors";

/** Client-safe message for unexpected failures. */
export const GENERIC_ERROR_MESSAGE =
  "Something went wrong while processing your request. Please try again.";

/** Client-safe message when the service is misconfigured/unavailable. */
export const SERVICE_UNAVAILABLE_MESSAGE =
  "SpendWise is temporarily unavailable. Please try again shortly.";

export interface ClientSafeError {
  statusCode: number;
  message: string;
}

/**
 * Decide what the client may see. AppError messages are written to be
 * user-facing (validation, auth, rate limits), so they pass through with
 * their intentional status. Configuration problems become a generic 503.
 * Anything else is an unexpected failure: generic 500, no details.
 */
export function mapErrorForClient(error: unknown): ClientSafeError {
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, message: error.message };
  }
  if (error instanceof ConfigurationError) {
    return { statusCode: 503, message: SERVICE_UNAVAILABLE_MESSAGE };
  }
  return { statusCode: 500, message: GENERIC_ERROR_MESSAGE };
}

export async function withErrorBoundary<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // Server logs keep the full original error (message, stack, cause).
    console.error(error);

    const { statusCode, message } = mapErrorForClient(error);
    try {
      setResponseStatus(statusCode);
    } catch {
      // No request context (e.g. unit tests calling the seam directly).
    }

    const sanitized = new Error(message);
    // seroval serializes `stack` to the client — strip all frames so no
    // server file paths leak, keeping only the safe summary line.
    sanitized.stack = `Error: ${message}`;
    throw sanitized;
  }
}
