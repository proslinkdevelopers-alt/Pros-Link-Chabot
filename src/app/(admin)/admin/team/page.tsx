import { Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_INFO, STAFF_ROLES, assignableRoles, can, isStaffRole } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { DbNotice, LinkTabs, PageHeader } from "@/components/admin/ui";
import { TeamManager, type TeamRow } from "@/components/admin/TeamManager";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requirePagePermission("team.manage", "/admin/team");
  const { tab } = await searchParams;
  const showRoles = tab === "roles";

  const { data, error } = await safeQuery(
    () =>
      prisma.user.findMany({
        where: { ...OWN, role: { in: [...STAFF_ROLES] } },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
      }),
    []
  );

  const rows: TeamRow[] = data
    .filter((user) => isStaffRole(user.role))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleLabel: ROLE_INFO[user.role as keyof typeof ROLE_INFO].label,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      self: user.id === staff.id,
    }));
  const roles = assignableRoles(staff.role).map((role) => ({ value: role, label: ROLE_INFO[role].label, description: ROLE_INFO[role].description }));
  const groups = [...new Set(ALL_PERMISSIONS.map((key) => PERMISSIONS[key].group))];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Team"
        description="Who can sign in to the console and what each role may do. Permissions are checked on the server for every page and every change — hiding a menu item is not the protection."
      />
      <DbNotice error={error} />
      <LinkTabs
        active={showRoles ? "roles" : "people"}
        tabs={[
          { key: "people", label: "People", href: "/admin/team", count: rows.length },
          { key: "roles", label: "Roles and permissions", href: "/admin/team?tab=roles" },
        ]}
      />
      {showRoles ? (
        <Card className="overflow-hidden p-0">
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Permission
                  </th>
                  {STAFF_ROLES.map((role) => (
                    <th key={role} scope="col" className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {ROLE_INFO[role].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group}>
                    <tr className="border-b bg-secondary/20">
                      <th colSpan={STAFF_ROLES.length + 1} scope="colgroup" className="px-4 py-2 text-left text-xs font-semibold">
                        {group}
                      </th>
                    </tr>
                    {ALL_PERMISSIONS.filter((key) => PERMISSIONS[key].group === group).map((key) => (
                      <tr key={key} className="border-b last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-normal">
                          {PERMISSIONS[key].description}
                        </th>
                        {STAFF_ROLES.map((role) => (
                          <td key={role} className="px-3 py-2 text-center">
                            {can(role, key) ? <Check className="mx-auto size-4 text-emerald-600" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="Not allowed" />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <TeamManager rows={rows} roles={roles} />
      )}
    </>
  );
}
