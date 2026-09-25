import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, not } from "drizzle-orm";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";

import { sessions } from "../../db/schema";
import db from "./db";
import { UnauthorizedError } from "./errors";

const COOKIE_NAME = "spendwise_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function readSessionToken(cookieHeader = getRequestHeader("cookie")): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const equalsAt = part.indexOf("=");
    if (equalsAt !== -1 && part.slice(0, equalsAt) === COOKIE_NAME) return part.slice(equalsAt + 1);
  }
  return null;
}

function cookie(token: string, maxAge: number): string {
  return [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    ...(process.env["NODE_ENV"] === "production" ? ["Secure"] : []),
  ].join("; ");
}

export function setSessionCookie(token: string): void {
  setResponseHeader("Set-Cookie", cookie(token, SESSION_AGE_SECONDS));
}

export function clearSessionCookie(): void {
  setResponseHeader("Set-Cookie", cookie("", 0));
}

export async function createSession(userId: string): Promise<void> {
  const token = createSessionToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_AGE_SECONDS * 1000),
  });
  setSessionCookie(token);
}

export async function getSessionUserId(): Promise<string | null> {
  const token = readSessionToken();
  if (!token) return null;
  const rows = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.userId ?? null;
}

export async function destroyCurrentSession(): Promise<void> {
  const token = readSessionToken();
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  clearSessionCookie();
}

export async function destroyOtherSessions(userId: string): Promise<void> {
  const token = readSessionToken();
  if (!token) throw new UnauthorizedError("You must be signed in to access SpendWise.");

  await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        // Keep the browser session that authenticated this request active.
        // The token itself is never returned or persisted.
        not(eq(sessions.tokenHash, hashSessionToken(token))),
      ),
    );
}
