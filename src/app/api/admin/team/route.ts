import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { hashPassword } from "@/lib/auth";
import { passwordProblem } from "@/lib/password";
import { STAFF_ROLES, assignableRoles } from "@/lib/permissions";
import { audit } from "@/lib/notify";
import { fail, ok, readBody, uniqueViolation } from "@/lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the person's name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(160),
  role: z.enum(STAFF_ROLES as unknown as [string, ...string[]]),
  password: z.string().max(200),
});

/** Add a staff account. Only a Super Admin can, and only with roles they may assign. */
export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("team.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;
  const input = body.data;

  if (!assignableRoles(guard.staff.role).includes(input.role as (typeof STAFF_ROLES)[number])) {
    return fail("You cannot give that role.", 403, { role: "Not allowed." });
  }
  const problem = passwordProblem(input.password);
  if (problem) return fail(problem, 400, { password: problem });

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { department: true } });
  if (existing) {
    // Never reveal or touch another tenant's account.
    return fail("This email address is already in use.", 409, { email: "Already in use." });
  }

  try {
    const role = await prisma.role.findUnique({ where: { key: `proslink-${input.role.toLowerCase().replace(/_/g, "-")}` }, select: { id: true } });
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role as (typeof STAFF_ROLES)[number],
        department: DEPARTMENT,
        passwordHash: await hashPassword(input.password),
        isActive: true,
        roleId: role?.id,
      },
      select: { id: true },
    });
    await audit({
      action: "user.created",
      entity: "User",
      entityId: user.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} added ${input.name} as ${input.role}.`,
      after: { name: input.name, email: input.email, role: input.role, isActive: true },
      req,
    });
    return ok({ id: user.id }, 201);
  } catch (error) {
    if (uniqueViolation(error)) return fail("This email address is already in use.", 409, { email: "Already in use." });
    console.error("[team] create failed:", error);
    return fail("The account could not be created.", 500);
  }
}
