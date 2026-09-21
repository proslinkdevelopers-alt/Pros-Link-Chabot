import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requireApiStaff } from "@/lib/staff";
import { STAGE_LABEL, TICKET_STATUS_LABEL, QUOTE_STATUS_LABEL } from "@/lib/admin/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Hit {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

/**
 * Console-wide search for the command palette: a reference number, a name,
 * a company, a phone number or a product. Each kind of record is searched
 * only when the signed-in role may open it.
 */
export async function GET(req: NextRequest) {
  const guard = await requireApiStaff(req);
  if ("response" in guard) return guard.response;
  const { staff } = guard;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ results: [] });
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 4 ? digits.slice(-10) : null;
  const text = { contains: q, mode: "insensitive" as const };
  const own = { department: DEPARTMENT };
  const may = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(staff, permission);

  const [leads, customers, tickets, quotes, products, conversations] = await Promise.all([
    may("leads.view")
      ? prisma.lead.findMany({
          where: { ...own, OR: [{ reference: text }, { name: text }, { company: text }, { email: text }, ...(phone ? [{ phone: { contains: phone } }] : [])] },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, reference: true, name: true, company: true, stage: true },
        })
      : [],
    may("customers.view")
      ? prisma.customer.findMany({
          where: { ...own, OR: [{ reference: text }, { name: text }, { company: text }, { email: text }, ...(phone ? [{ phone: { contains: phone } }] : [])] },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, reference: true, name: true, company: true, city: true },
        })
      : [],
    may("tickets.view") || may("tickets.view_assigned")
      ? prisma.ticket.findMany({
          where: {
            ...own,
            ...(may("tickets.view") ? {} : { assigneeId: staff.id }),
            OR: [{ reference: text }, { subject: text }, { contactName: text }, { company: text }, { serialNumber: text }, ...(phone ? [{ contactPhone: { contains: phone } }] : [])],
          },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, reference: true, subject: true, status: true, contactName: true },
        })
      : [],
    may("quotes.view")
      ? prisma.quote.findMany({
          where: { ...own, OR: [{ reference: text }, { title: text }] },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, reference: true, title: true, status: true },
        })
      : [],
    may("products.view")
      ? prisma.product.findMany({
          where: { ...own, OR: [{ name: text }, { sku: text }, { model: text }] },
          orderBy: { name: "asc" },
          take: 5,
          select: { id: true, name: true, model: true, status: true },
        })
      : [],
    may("conversations.view")
      ? prisma.conversation.findMany({
          where: { ...own, OR: [{ reference: text }, { contactName: text }, ...(phone ? [{ contactPhone: { contains: phone } }] : [])] },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, reference: true, contactName: true, contactPhone: true, channel: true },
        })
      : [],
  ]);

  const results: Hit[] = [
    ...leads.map((row) => ({ kind: "Leads", id: row.id, title: `${row.name}${row.company ? ` · ${row.company}` : ""}`, subtitle: `${row.reference} · ${STAGE_LABEL[row.stage] ?? row.stage}`, href: `/admin/leads/${row.id}` })),
    ...customers.map((row) => ({ kind: "Customers", id: row.id, title: `${row.name}${row.company ? ` · ${row.company}` : ""}`, subtitle: [row.reference, row.city].filter(Boolean).join(" · "), href: `/admin/customers/${row.id}` })),
    ...tickets.map((row) => ({ kind: "Tickets", id: row.id, title: row.subject, subtitle: `${row.reference} · ${TICKET_STATUS_LABEL[row.status] ?? row.status}${row.contactName ? ` · ${row.contactName}` : ""}`, href: `/admin/tickets/${row.id}` })),
    ...quotes.map((row) => ({ kind: "Quote requests", id: row.id, title: row.title, subtitle: `${row.reference} · ${QUOTE_STATUS_LABEL[row.status] ?? row.status}`, href: `/admin/quotes/${row.id}` })),
    ...products.map((row) => ({ kind: "Products", id: row.id, title: row.name, subtitle: [row.model && `Model ${row.model}`, row.status.toLowerCase()].filter(Boolean).join(" · "), href: `/admin/products/${row.id}` })),
    ...conversations.map((row) => ({ kind: "Conversations", id: row.id, title: row.contactName || row.contactPhone || row.reference, subtitle: `${row.reference} · ${row.channel === "WHATSAPP" ? "WhatsApp" : "Website"}`, href: `/admin/conversations/${row.id}` })),
  ];

  return Response.json({ results });
}
