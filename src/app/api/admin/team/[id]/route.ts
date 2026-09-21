import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { hashPassword } from "@/lib/auth";
import { passwordProblem } from "@/lib/password";
import { STAFF_ROLES, assignableRoles } from "@/lib/permissions";
import { audit } from "@/lib/notify";
import { fail, notFound, ok, readBody } from "@/lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    name: z.string().trim().min(2).max(120),
    role: z.enum(STAFF_ROLES as unknown as [string, ...string[]]),
    isActive: z.boolean(),
    password: z.string().max(200),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");

/**
 * Change a staff account: name, role, active, or a new password. Nobody can
 * lock themselves out, and the last active Super Admin cannot be removed.
 * Deactivation takes effect on the person's next request, because every
 * request re-reads the account.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiPermission("team.manage", req);
  if ("response" in guard) return guard.response;
  const { staff } = guard;
  const { id } = await params;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;
  const input = body.data;

  const user = await prisma.user.findFirst({ where: { id, department: DEPARTMENT }, select: { name: true, email: true, role: true, isActive: true } });
  if (!user || !STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number])) return notFound();

  if (id === staff.id && (input.isActive === false || (input.role && input.role !== user.role))) {
    return fail("You cannot deactivate your own account or change your own role.", 400);
  }
  if (input.role && !assignableRoles(staff.role).includes(input.role as (typeof STAFF_ROLES)[number])) return fail("You cannot give that role.", 403);

  const losesSuperAdmin = user.role === "SUPER_ADMIN" && user.isActive && ((input.role && input.role !== "SUPER_ADMIN") || input.isActive === false);
  if (losesSuperAdmin) {
    const others = await prisma.user.count({ where: { department: DEPARTMENT, role: "SUPER_ADMIN", isActive: true, NOT: { id } } });
    if (!others) return fail("There must always be at least one active Super Admin.", 400);
  }

  let passwordHash: string | undefined;
  if (input.password) {
    const problem = passwordProblem(input.password);
    if (problem) return fail(problem, 400, { password: problem });
    passwordHash = await hashPassword(input.password);
  }

  const role = input.role
    ? await prisma.role.findUnique({ where: { key: `proslink-${input.role.toLowerCase().replace(/_/g, "-")}` }, select: { id: true } })
    : null;
  await prisma.user.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.role ? { role: input.role as (typeof STAFF_ROLES)[number], roleId: role?.id ?? null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  // The password itself never reaches the log.
  const { password: _password, ...after } = input;
  await audit({
    action: input.password ? "user.password_reset" : "user.updated",
    entity: "User",
    entityId: id,
    userId: staff.id,
    message: `${staff.name} updated ${user.name}'s account${input.password ? " and set a new password" : ""}.`,
    before: { name: user.name, role: user.role, isActive: user.isActive },
    after,
    extra: input.password ? { passwordReset: true } : undefined,
    req,
  });
  return ok();
}
