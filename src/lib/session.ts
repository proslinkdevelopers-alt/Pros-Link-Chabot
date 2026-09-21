import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./auth";

/**
 * Reads the session cookie in App Router server components and route handlers.
 * `cookies()` is async in Next 15.
 *
 * This only proves who signed in. Use `lib/staff.ts` for access decisions — it
 * re-checks the account against the database.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
