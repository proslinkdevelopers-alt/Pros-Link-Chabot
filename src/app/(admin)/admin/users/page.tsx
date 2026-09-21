import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import {
  Callout,
  DataTable,
  DbNotice,
  PageHeader,
  StatusBadge,
} from "@/components/admin/ui";
import { formatDateTime, humanise } from "@/lib/utils";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  await requirePagePermission("team.manage", "/admin/users");

  const { data, error } = await safeQuery(
    () =>
      prisma.user.findMany({
        where: OWN,
        orderBy: [{ role: "desc" }, { name: "asc" }],
        take: 200,
        include: { rbac: { select: { name: true } } },
      }),
    []
  );

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Staff accounts and their access tier."
      />

      {error && <DbNotice error={error} />}

      <Callout title="Former BITSOL Institute accounts are not listed">
        Staff accounts that belonged to BITSOL Institute are kept in the database but hidden here,
        and they can no longer sign in to this console.
      </Callout>

      <div className="mt-6">
        <DataTable
          rows={data}
          rowKey={(row) => row.id}
          empty="No users yet. Run `npm run db:seed` to create the starting accounts."
          columns={[
            {
              header: "Name",
              cell: (row) => (
                <div className="min-w-0">
                  <p className="font-medium">{row.name}</p>
                  <p className="break-all text-xs text-muted-foreground">{row.email ?? "—"}</p>
                </div>
              ),
            },
            {
              header: "Access tier",
              cell: (row) => <StatusBadge value={row.role} />,
            },
            {
              header: "Role",
              cell: (row) => (
                <span className="text-xs text-muted-foreground">
                  {row.rbac?.name ?? "No role assigned"}
                </span>
              ),
            },
            {
              header: "Contact",
              cell: (row) => (
                <span className="text-xs text-muted-foreground">{row.phone ?? "—"}</span>
              ),
            },
            {
              header: "Status",
              cell: (row) => <StatusBadge value={row.isActive ? "ACTIVE" : "INACTIVE"} />,
            },
            {
              header: "Last sign-in",
              cell: (row) => (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "Never"}
                </span>
              ),
            },
            {
              header: "Language",
              cell: (row) => (
                <span className="text-xs text-muted-foreground">{humanise(row.language)}</span>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
