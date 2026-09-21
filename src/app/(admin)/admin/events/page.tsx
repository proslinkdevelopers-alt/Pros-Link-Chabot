import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { DbNotice, EmptyState, PageHeader, StatusBadge } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { CalendarDays, MapPin } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  await requirePagePermission("settings.manage", "/admin/events");
  const now = new Date();

  const { data, error } = await safeQuery(
    async () => {
      const [upcoming, past] = await Promise.all([
        prisma.legacyEvent.findMany({
          where: { ...OWN, startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
        }),
        prisma.legacyEvent.findMany({
          where: { ...OWN, startsAt: { lt: now } },
          orderBy: { startsAt: "desc" },
          take: 20,
        }),
      ]);
      return { upcoming, past };
    },
    { upcoming: [], past: [] }
  );

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Events"
        description="Seminars, workshops and demo days. The assistant mentions upcoming events when visitors ask what's on."
      />

      {error && <DbNotice error={error} />}

      <h2 className="mb-3 text-sm font-semibold">Upcoming</h2>
      {data.upcoming.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.upcoming.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <EmptyState
          message="No upcoming events."
          hint="Run `npm run db:seed` to load the sample seminar."
        />
      )}

      {data.past.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold">Past events</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {data.past.map((event) => (
              <EventCard key={event.id} event={event} muted />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function EventCard({
  event,
  muted,
}: {
  event: {
    id: string;
    title: string;
    summary: string;
    location: string | null;
    startsAt: Date;
    isPublished: boolean;
  };
  muted?: boolean;
}) {
  return (
    <Card className={`p-5 ${muted ? "opacity-70" : ""}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{event.title}</h3>
        <StatusBadge value={event.isPublished ? "PUBLISHED" : "DRAFT"} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{event.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3.5" /> {formatDateTime(event.startsAt)}
        </span>
        {event.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {event.location}
          </span>
        )}
      </div>
    </Card>
  );
}
