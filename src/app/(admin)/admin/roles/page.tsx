import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { DbNotice, EmptyState, PageHeader, StatusBadge } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Roles & Permissions" };

/**
 * Capabilities that only ever meant something to BITSOL Institute. Their rows
 * outlive the Institute in the `permissions` table — and a Super Admin seeded
 * before it was retired still holds them — so they are left out of the matrix.
 */
const RETIRED_PERMISSIONS = [
  "crm.admissions.view",
  "crm.admissions.manage",
  "students.manage",
  "courses.manage",
  "attendance.manage",
  "certificates.issue",
];

export default async function RolesPage() {
  await requirePagePermission("team.manage", "/admin/roles");

  const { data, error } = await safeQuery(
    async () => {
      const [roles, permissions] = await Promise.all([
        prisma.role.findMany({
          where: OWN,
          orderBy: { name: "asc" },
          include: {
            _count: { select: { users: true } },
            permissions: { include: { permission: true } },
          },
        }),
        prisma.permission.findMany({
          where: { key: { notIn: RETIRED_PERMISSIONS } },
          orderBy: [{ group: "asc" }, { key: "asc" }],
        }),
      ]);
      return { roles, permissions };
    },
    { roles: [], permissions: [] }
  );

  const groups = Array.from(new Set(data.permissions.map((p) => p.group)));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Roles & Permissions"
        description="Which capabilities each role grants."
      />

      {error && <DbNotice error={error} />}

      {data.roles.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.roles.map((role) => {
            const granted = new Set(
              role.permissions
                .map((p) => p.permission.key)
                .filter((key) => !RETIRED_PERMISSIONS.includes(key))
            );
            return (
              <Card key={role.id} className="p-6">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{role.name}</h3>
                    <p className="font-mono text-[11px] text-muted-foreground">{role.key}</p>
                  </div>
                  {role.isSystem && <StatusBadge value="SYSTEM" />}
                </div>

                {role.description && (
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                )}

                <p className="mt-3 text-[11px] text-muted-foreground">
                  {role._count.users} user{role._count.users === 1 ? "" : "s"} ·{" "}
                  {granted.size} of {data.permissions.length} permissions
                </p>

                <div className="mt-3 space-y-2.5 border-t pt-3">
                  {groups.map((group) => {
                    const groupGranted = data.permissions.filter(
                      (p) => p.group === group && granted.has(p.key)
                    );
                    if (!groupGranted.length) return null;
                    return (
                      <div key={group}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {group}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {groupGranted.map((permission) => (
                            <span
                              key={permission.key}
                              title={permission.description ?? permission.key}
                              className="rounded-full bg-primary/[0.07] px-2 py-0.5 font-mono text-[10px] text-primary ring-1 ring-inset ring-primary/10"
                            >
                              {permission.key}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message="No roles configured."
          hint="Run `npm run db:seed` to create the standard role matrix (Super Admin, Marketing Admin, Sales Agent)."
        />
      )}
    </>
  );
}
