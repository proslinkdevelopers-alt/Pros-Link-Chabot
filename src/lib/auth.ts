/**
 * Authentication helpers — JWT (via `jose`, Edge-safe) + bcrypt password hashing.
 *
 * `jose` is used instead of `jsonwebtoken` so tokens can be verified in both
 * Node and Edge runtimes (e.g. middleware) without polyfills.
 */
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { config } from "./config";
import { DEPARTMENT } from "@/config/brand";
import type { Department, UserRole } from "@prisma/client";

const secret = new TextEncoder().encode(config.jwt.secret);

const ISSUER = "bitsol-ai-assistant";

export interface SessionPayload {
  sub: string; // user id
  role: UserRole;
  name: string;
  /** Business the account was created for; null for unscoped accounts. */
  department?: Department | null;
  [key: string]: unknown;
}

/** Roles allowed into the admin console. */
export const ADMIN_ROLES: UserRole[] = ["AGENT", "ADMIN", "SUPER_ADMIN"];

/**
 * True for an account that belonged to the retired BITSOL Institute.
 *
 * Those staff worked admissions, not sales, so they must not inherit the
 * Marketing console just because the Institute's screens are gone. Checked at
 * sign-in and on every console request, which also turns away a session that
 * was issued before the Institute was retired.
 */
export function isRetiredAccount(department: Department | null | undefined): boolean {
  return department != null && department !== DEPARTMENT;
}

/** True when the session may open the admin console at all. */
export function canAccessAdmin(session: SessionPayload | null): boolean {
  return Boolean(
    session && ADMIN_ROLES.includes(session.role) && !isRetiredAccount(session.department)
  );
}

/** Hash a plaintext password for storage. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

/** Verify a plaintext password against a stored hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
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
export const SESSION_COOKIE = "bitsol_session";
