import Link from "next/link";
import { List } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { boardStage } from "@/lib/admin/labels";
import { buttonVariants } from "@/components/ui/button";
import { DbNotice, FilterBar, FilterChip, PageHeader } from "@/components/admin/ui";
import { PipelineBoard, type PipelineCard } from "@/components/admin/crm/PipelineBoard";

export const metadata = { title: "Sales Pipeline" };

/** Won and lost leads stay on the board for this long, so the columns show recent results. */
const CLOSED_DAYS = 60;

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const staff = await requirePagePermission("leads.view", "/admin/pipeline");
  const { owner } = await searchParams;
  const mine = owner === "me";
  const since = new Date(Date.now() - CLOSED_DAYS * 86_400_000);

  const { data, error } = await safeQuery(
    () =>
      prisma.lead.findMany({
        where: {
          ...OWN,
          ...(mine ? { ownerId: staff.id } : {}),
          OR: [
            { stage: { in: ["NEW", "CONTACTED", "QUALIFIED", "QUOTE_REQUESTED", "QUOTED", "NEGOTIATION", "PROPOSAL_SENT", "HOT", "FOLLOW_UP"] } },
            { stage: { in: ["WON", "LOST"] }, updatedAt: { gte: since } },
          ],
        },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 600,
        select: {
          id: true, reference: true, name: true, company: true, subService: true, stage: true, estimatedValue: true, temperature: true, createdAt: true,
          owner: { select: { name: true } },
        },
      }),
    []
  );

  const now = Date.now();
  const cards: PipelineCard[] = data.flatMap((lead) => {
    const stage = boardStage(lead.stage);
    if (!stage) return [];
    return [
      {
        id: lead.id,
        reference: lead.reference,
        name: lead.name,
        company: lead.company,
        interest: lead.subService,
        stage,
        value: lead.estimatedValue ? Number(lead.estimatedValue) : null,
        temperature: lead.temperature,
        owner: lead.owner?.name ?? null,
        ageDays: Math.floor((now - lead.createdAt.getTime()) / 86_400_000),
      },
    ];
  });

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Sales Pipeline"
        description={`Open leads by stage. Drag a card to move it, or use its “Move to” menu. Won and lost leads from the last ${CLOSED_DAYS} days are shown.`}
        actions={
          <Link href="/admin/leads" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <List /> List view
          </Link>
        }
      />
      <DbNotice error={error} />
      <FilterBar>
        <FilterChip href="/admin/pipeline" label="Everyone" active={!mine} />
        <FilterChip href="/admin/pipeline?owner=me" label="My leads" active={mine} />
      </FilterBar>
      <PipelineBoard cards={cards} canMove={hasPermission(staff, "leads.manage")} />
    </>
  );
}
