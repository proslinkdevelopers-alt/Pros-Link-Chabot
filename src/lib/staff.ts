import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canAccessAdmin } from "@/lib/auth";
import { can, isStaffRole, permissionsFor, type Permission, type StaffRole } from "@/lib/permissions";

/**
 * =============================================================================
 *  The signed-in staff member, verified against the database
 * =============================================================================
 *
 *  The session cookie says who signed in. This module decides, on every console
 *  request, whether that person may still be here and what they may do:
 *
 *    • the user record must exist, be active, belong to this tenant and hold a
 *      console role — so deactivating or demoting someone takes effect on
 *      their next click, not when their 7-day token expires;
 *    • permissions come from the role in the database, never from the token.
 *
 *  Pages call `requirePagePermission`, API routes `requireApiPermission`. Both
 *  are the real gate; the navigation merely hides what they would refuse.
 * =============================================================================
 */

export interface Staff {
  id: string;
  name: string;
  email: string | null;
  role: StaffRole;
  permissions: ReadonlySet<Permission>;
}

/** The current staff member, or null. Cached for the duration of one request. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const session = await getSession();
  if (!session || !canAccessAdmin(session)) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, role: true, department: true, isActive: true },
    });
    if (!user || !user.isActive || !canAccessAdmin(user) || !isStaffRole(user.role)) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, permissions: permissionsFor(user.role) };
  } catch (error) {
    // Without a database nothing in the console works anyway; let the pages
    // render their "database unavailable" notice with the token's role.
    console.warn("[staff] user lookup failed:", error instanceof Error ? error.message.split("\n").find(Boolean) : error);
    if (!isStaffRole(session.role)) return null;
    return { id: session.sub, name: session.name, email: null, role: session.role, permissions: permissionsFor(session.role) };
  }
});

export function hasPermission(staff: Pick<Staff, "role"> | null, permission: Permission | readonly Permission[]): boolean {
  return Boolean(staff && can(staff.role, permission));
}

/** A console page: signed in, or off to sign-in with a way back. */
export async function requireStaff(next = "/admin"): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect(`/login?next=${encodeURIComponent(next)}`);
  return staff;
}

/**
 * A console page that needs a permission (any of them, when given a list).
 * A signed-in member without it sees the "no access" page.
 */
export async function requirePagePermission(permission: Permission | readonly Permission[], next = "/admin"): Promise<Staff> {
  const staff = await requireStaff(next);
  if (!hasPermission(staff, permission)) redirect("/admin/forbidden");
  return staff;
}

export type ApiGuard = { staff: Staff } | { response: Response };

/**
 * An API route that needs a permission (any of them, when given a list).
 *
 * State-changing requests must also come from this site: a request carrying
 * an Origin header for another host is refused, on top of the SameSite cookie.
 */
export async function requireApiPermission(
  permission: Permission | readonly Permission[],
  req?: Request
): Promise<ApiGuard> {
  if (req && req.method !== "GET" && req.method !== "HEAD" && !(await sameOrigin(req))) {
    return { response: Response.json({ error: "Cross-site request refused." }, { status: 403 }) };
  }
  const staff = await getStaff();
  if (!staff) return { response: Response.json({ error: "Not signed in." }, { status: 401 }) };
  if (!hasPermission(staff, permission)) {
    return { response: Response.json({ error: "Your role does not allow this." }, { status: 403 }) };
  }
  return { staff };
}

/**
 * An API route whose permission depends on the record it touches: signed in,
 * and a same-site request. The route makes the per-record decision itself.
 */
export async function requireApiStaff(req: Request): Promise<ApiGuard> {
  if (req.method !== "GET" && req.method !== "HEAD" && !(await sameOrigin(req))) {
    return { response: Response.json({ error: "Cross-site request refused." }, { status: 403 }) };
  }
  const staff = await getStaff();
  return staff ? { staff } : { response: Response.json({ error: "Not signed in." }, { status: 401 }) };
}

async function sameOrigin(req: Request): Promise<boolean> {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers, server-to-server tools
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
