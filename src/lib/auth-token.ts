/**
 * Session tokens — the Edge-safe half of authentication.
 *
 * Only `jose` and the tenant/role checks live here, so the middleware can
 * import it without pulling bcrypt into the Edge bundle. Password hashing and
 * everything else is in `auth.ts`, which re-exports this module.
 */
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { DEPARTMENT } from "@/config/brand";
import { isStaffRole } from "./permissions";
import type { Department, UserRole } from "@prisma/client";

const secret = new TextEncoder().encode(config.jwt.secret);

const ISSUER = "proslink-platform";

export interface SessionPayload {
  sub: string; // user id
  role: UserRole;
  name: string;
  department?: Department | null;
  [key: string]: unknown;
}

/**
 * True for an account that belongs to another tenant — including accounts with
 * no tenant at all. Only accounts created for this deployment may sign in.
 */
export function isForeignAccount(department: Department | null | undefined): boolean {
  return department !== DEPARTMENT;
}

/** True when the session may open the console at all. Permissions decide the rest. */
export function canAccessAdmin(session: Pick<SessionPayload, "role" | "department"> | null): boolean {
  return Boolean(session && isStaffRole(session.role) && !isForeignAccount(session.department));
}

/** Issue a signed JWT for an authenticated user. */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.jwt.expiresIn)
    .setIssuer(ISSUER)
    .sign(secret);
}

/** Verify a JWT and return its payload, or null if invalid/expired. */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Name of the httpOnly cookie carrying the session token. */
export const SESSION_COOKIE = "pl_session";

/** The Set-Cookie header value for a session token (or for clearing it). */
export function sessionCookie(value: string, maxAgeSeconds: number): string {
  const parts = [`${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (config.isProd) parts.push("Secure");
  return parts.join("; ");
}
