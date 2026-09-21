import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { SOURCE_LABEL, STAGE_LABEL, TICKET_CATEGORY_LABEL, TICKET_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/admin/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A CSV cell, quoted, with spreadsheet formula injection neutralised. */
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(head: string[], rows: unknown[][]): string {
  return [head, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

/** Leads or tickets created in the last 7, 30 or 90 days, as CSV. The download is audited. */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("reports.view", req);
  if ("response" in guard) return guard.response;
  const type = req.nextUrl.searchParams.get("type");
  const days = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get("days"))) ? Number(req.nextUrl.searchParams.get("days")) : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const stamp = new Date().toISOString().slice(0, 10);

  let body: string;
  if (type === "leads" && hasPermission(guard.staff, "leads.view")) {
    const rows = await prisma.lead.findMany({
      where: { department: DEPARTMENT, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10_000,
      select: {
        reference: true, createdAt: true, name: true, company: true, phone: true, email: true, city: true, subService: true, quantity: true,
        budget: true, stage: true, source: true, score: true, estimatedValue: true, owner: { select: { name: true } },
      },
    });
    body = csv(
      ["Reference", "Created", "Name", "Company", "Phone", "Email", "City", "Interest", "Quantity", "Budget", "Stage", "Source", "Score", "Estimated value (PKR)", "Owner"],
      rows.map((row) => [
        row.reference, row.createdAt, row.name, row.company, row.phone, row.email, row.city, row.subService, row.quantity, row.budget,
        STAGE_LABEL[row.stage] ?? row.stage, SOURCE_LABEL[row.source] ?? row.source, row.score, row.estimatedValue?.toString(), row.owner?.name,
      ])
    );
  } else if (type === "tickets" && hasPermission(guard.staff, "tickets.view")) {
    const rows = await prisma.ticket.findMany({
      where: { department: DEPARTMENT, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10_000,
      select: {
        reference: true, createdAt: true, category: true, status: true, priority: true, subject: true, contactName: true, contactPhone: true, company: true,
        city: true, machineType: true, machineBrand: true, machineModel: true, serialNumber: true, resolvedAt: true, assignee: { select: { name: true } },
      },
    });
    body = csv(
      ["Reference", "Raised", "Type", "Status", "Priority", "Subject", "Contact", "Phone", "Company", "City", "Machine", "Brand", "Model", "Serial number", "Resolved", "Assigned to"],
      rows.map((row) => [
        row.reference, row.createdAt, TICKET_CATEGORY_LABEL[row.category] ?? row.category, TICKET_STATUS_LABEL[row.status] ?? row.status, PRIORITY_LABEL[row.priority],
        row.subject, row.contactName, row.contactPhone, row.company, row.city, row.machineType, row.machineBrand, row.machineModel, row.serialNumber, row.resolvedAt, row.assignee?.name,
      ])
    );
  } else {
    return Response.json({ error: "Choose leads or tickets you may view." }, { status: 400 });
  }

  await audit({ action: "report.exported", entity: "Report", entityId: type, userId: guard.staff.id, message: `${guard.staff.name} exported ${type} for the last ${days} days.`, extra: { days }, req });
  return new Response(`﻿${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="proslink-${type}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
