import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { can, ROLE_INFO, isStaffRole, type Permission } from "@/lib/permissions";

export interface Person {
  value: string;
  label: string;
}

/** Active staff whose role holds any of `permissions` — the choices for an assignee select. */
export async function peopleWith(permissions: Permission[]): Promise<Person[]> {
  const users = await prisma.user.findMany({
    where: { department: DEPARTMENT, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  return users
    .filter((user) => isStaffRole(user.role) && permissions.some((permission) => can(user.role, permission)))
    .map((user) => ({ value: user.id, label: `${user.name} · ${ROLE_INFO[user.role as keyof typeof ROLE_INFO].label}` }));
}
