import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { DbNotice, EmptyState, PageHeader, Pagination, SearchForm } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit Log" };

const PAGE_SIZE = 50;
type Search = { q?: string; entity?: string; user?: string; days?: string; page?: string };

const ENTITIES = ["Lead", "Customer", "CustomerAsset", "Quote", "Ticket", "Meeting", "Conversation", "Product", "ProductCategory", "Brand", "KnowledgeArticle", "User", "Setting", "BotConfig", "Broadcast", "Template"];

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 160)}…` : value;
  const json = JSON.stringify(value);
  return json.length > 160 ? `${json.slice(0, 160)}…` : json;
}

/** Every change made in the console, sign-ins and failures, with before and after values. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePagePermission("audit.view", "/admin/audit");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const entity = ENTITIES.includes(params.entity ?? "") ? params.entity : undefined;
  const days = [1, 7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const user = params.user || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.SystemLogWhereInput = {
    ...OWN,
    createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
    ...(entity ? { entity } : {}),
    ...(user ? { userId: user } : {}),
    ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }, { entityId: q }] } : {}),
  };

  const { data, error } = await safeQuery(
    async () => {
      const [rows, total, users] = await Promise.all([
        prisma.systemLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: { id: true, level: true, action: true, entity: true, entityId: true, message: true, metadata: true, ipAddress: true, createdAt: true, user: { select: { name: true } } },
        }),
        prisma.systemLog.count({ where }),
        prisma.user.findMany({ where: OWN, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ]);
      return { rows, total, users };
    },
    { rows: [], total: 0, users: [] }
  );

  const href = (changes: Partial<Search>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, entity, user, days: days === 30 ? undefined : String(days), ...changes })) if (value) next.set(key, String(value));
    return `/admin/audit${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeader eyebrow="Insights" title="Audit Log" description="Who did what, and when: every change made in the console with its previous and new values, plus sign-ins and refused attempts." />
      <DbNotice error={error} />
      <SearchForm action="/admin/audit" query={q} placeholder="Search action, description or record id">
        <Select name="entity" defaultValue={entity ?? ""} className="w-auto min-w-[10rem] bg-card" aria-label="Record type">
          <option value="">All records</option>
          {ENTITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select name="user" defaultValue={user ?? ""} className="w-auto min-w-[10rem] bg-card" aria-label="Person">
          <option value="">Anyone</option>
          {data.users.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
        <Select name="days" defaultValue={String(days)} className="w-auto bg-card" aria-label="Period">
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
      </SearchForm>

      {data.rows.length ? (
        <Card className="divide-y overflow-hidden p-0">
          {data.rows.map((row) => {
            const metadata = (row.metadata ?? {}) as { changes?: Record<string, { from: unknown; to: unknown }> };
            const changes = Object.entries(metadata.changes ?? {});
            return (
              <details key={row.id} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-start gap-3">
                  <span className={row.level === "WARN" || row.level === "ERROR" ? "mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" : "mt-1.5 size-2 shrink-0 rounded-full bg-primary/60"} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{row.message ?? row.action}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      <code>{row.action}</code>
                      {row.entity ? ` · ${row.entity}` : ""}
                      {row.user ? ` · ${row.user.name}` : ""}
                      {row.ipAddress ? ` · ${row.ipAddress}` : ""}
                      {changes.length ? ` · ${changes.length} field${changes.length === 1 ? "" : "s"} changed` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                </summary>
                {changes.length > 0 && (
                  <div className="scroll-slim mt-3 overflow-x-auto pl-5">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="pb-1 pr-3 font-semibold">Field</th>
                          <th className="pb-1 pr-3 font-semibold">Before</th>
                          <th className="pb-1 font-semibold">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map(([field, change]) => (
                          <tr key={field} className="align-top">
                            <td className="py-1 pr-3 font-medium">{field}</td>
                            <td className="break-all py-1 pr-3 text-muted-foreground">{show(change.from)}</td>
                            <td className="break-all py-1">{show(change.to)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {row.entityId && <p className="mt-2 pl-5 text-[11px] text-muted-foreground">Record id {row.entityId}</p>}
              </details>
            );
          })}
        </Card>
      ) : (
        <EmptyState message="Nothing recorded for these filters." />
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(next) => href({ page: String(next) })} />
    </>
  );
}
