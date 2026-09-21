import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession, canAccessAdmin } from "@/lib/auth-token";

/**
 * Edge middleware guarding the admin console.
 *
 * This is defence in depth, not the only gate: the admin layout and every page
 * re-check the account against the database and its role's permissions
 * (`lib/staff.ts`), and each API route does the same before reading or
 * writing. Doing it here as well means a request without a valid console
 * session is turned away before any page code or database query runs.
 *
 * `jose` verification works in the Edge runtime, which is why auth.ts uses it
 * rather than `jsonwebtoken`.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!canAccessAdmin(session)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Only the console — public pages, the chat API and static assets are untouched.
  matcher: ["/admin/:path*"],
};
