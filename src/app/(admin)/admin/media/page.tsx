import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import {
  DataTable,
  DbNotice,
  PageHeader,
  StatusBadge,
} from "@/components/admin/ui";
import { formatDate, truncate } from "@/lib/utils";

export const metadata = { title: "Media & Documents" };

/** Human-readable file size for the table. */
function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default async function MediaPage() {
  await requirePagePermission("knowledge.manage", "/admin/media");

  const { data, error } = await safeQuery(
    () =>
      prisma.mediaAsset.findMany({
        where: OWN,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    []
  );

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Media & Documents"
        description="Company profiles, service brochures, case-study decks and images. Anything marked as a download is offered to visitors by the assistant."
      />

      {error && <DbNotice error={error} />}

      <DataTable
        rows={data}
        rowKey={(row) => row.id}
        empty="No documents uploaded yet."
        columns={[
          {
            header: "Title",
            cell: (row) => (
              <div className="min-w-0 max-w-sm">
                <p className="text-sm font-medium">{row.title}</p>
                {row.description && (
                  <p className="text-xs text-muted-foreground">
                    {truncate(row.description, 100)}
                  </p>
                )}
              </div>
            ),
          },
          { header: "Type", cell: (row) => <StatusBadge value={row.kind} /> },
          {
            header: "File",
            cell: (row) => (
              <div className="text-xs text-muted-foreground">
                <p>{row.mimeType ?? "—"}</p>
                <p>{formatBytes(row.sizeBytes)}</p>
              </div>
            ),
          },
          {
            header: "Public download",
            cell: (row) => (
              <StatusBadge value={row.isDownload ? "PUBLISHED" : "DRAFT"} />
            ),
          },
          {
            header: "URL",
            cell: (row) => (
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-xs text-primary hover:underline"
              >
                {truncate(row.url, 40)}
              </a>
            ),
          },
          {
            header: "Added",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDate(row.createdAt)}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
