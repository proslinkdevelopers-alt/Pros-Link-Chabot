/**
 * Authentication helpers — bcrypt password hashing, plus the session-token
 * functions from `auth-token.ts` (JWT via `jose`, Edge-safe).
 *
 * The token only proves who signed in. What they may do is decided on every
 * console request from the user record in the database (`lib/staff.ts`), so a
 * deactivated or demoted account loses access immediately, not when its token
 * expires.
 */
import bcrypt from "bcryptjs";
import { config } from "./config";

export * from "./auth-token";
export { passwordProblem } from "./password";

/** Hash a plaintext password for storage. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

/** Verify a plaintext password against a stored hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
