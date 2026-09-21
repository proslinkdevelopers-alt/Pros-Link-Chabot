import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { generateReference } from "@/lib/utils";
import { logEvent, notifyStaff, notifyTeam } from "@/lib/notify";
import { linkCustomer } from "@/lib/customers";
import { clientIp, created, failed, invalid, throttle } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Service and support requests — for a service form on a Pros-Link website.
 * Creates a ticket linked to the customer's profile and notifies the team.
 * Complaints and machines that have stopped are raised at high priority.
 */
const bodySchema = z.object({
  category: z.enum(["INSTALLATION", "TECHNICAL", "MAINTENANCE", "REPAIR", "SERVICE", "PARTS", "COMPLAINT", "CALLBACK", "GENERAL"]),
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((value) => /^[+\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15, "Enter a valid phone number."),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  machineType: z.string().trim().max(80).optional(),
  machineBrand: z.string().trim().max(60).optional(),
  machineModel: z.string().trim().max(80).optional(),
  serialNumber: z.string().trim().max(60).optional(),
  urgent: z.boolean().default(false),
  description: z.string().trim().min(5).max(4000),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preferredTime: z.string().trim().max(60).optional(),
});

const LABELS: Record<z.infer<typeof bodySchema>["category"], string> = {
  INSTALLATION: "Installation request",
  TECHNICAL: "Technical support",
  MAINTENANCE: "Maintenance request",
  REPAIR: "Repair request",
  SERVICE: "Service request",
  PARTS: "Parts request",
  COMPLAINT: "Complaint",
  CALLBACK: "Callback request",
  GENERAL: "Support request",
};

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "tickets", 6, 600);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const data = parsed.data;
  const reference = generateReference("TKT");
  const machine = [data.machineType, [data.machineBrand, data.machineModel].filter(Boolean).join(" "), data.serialNumber ? `SN ${data.serialNumber}` : ""]
    .filter(Boolean)
    .join(" · ");

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const customerId = await linkCustomer(tx, {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        company: data.company,
        city: data.city,
        address: data.address,
        source: "WEBSITE",
      });
      return tx.ticket.create({
        data: {
          reference,
          department: DEPARTMENT,
          category: data.category,
          status: "OPEN",
          priority: data.urgent ? "URGENT" : data.category === "COMPLAINT" ? "HIGH" : "NORMAL",
          subject: `${LABELS[data.category]}${machine ? ` — ${machine}` : ""}`.slice(0, 120),
          description: data.description,
          contactName: data.name,
          contactPhone: data.phone,
          contactEmail: data.email || null,
          company: data.company || null,
          city: data.city || null,
          address: data.address || null,
          machineType: data.machineType || null,
          machineBrand: data.machineBrand || null,
          machineModel: data.machineModel || null,
          serialNumber: data.serialNumber || null,
          preferredDate: data.preferredDate ? new Date(`${data.preferredDate}T00:00:00Z`) : null,
          preferredTime: data.preferredTime || null,
          source: "WEBSITE",
          customerId,
        },
        select: { id: true },
      });
    });

    const subject = `${LABELS[data.category]} ${reference} — ${data.name}${data.city ? `, ${data.city}` : ""}`;
    await notifyTeam({
      subject,
      body: [
        `Reference: ${reference}`,
        `From: ${data.name}${data.company ? ` (${data.company})` : ""}`,
        `Phone: ${data.phone}`,
        data.email ? `Email: ${data.email}` : null,
        machine ? `Machine: ${machine}` : null,
        "",
        data.description,
      ]
        .filter((line) => line !== null)
        .join("\n"),
      link: `/admin/tickets/${ticket.id}`,
    });
    await notifyStaff({ permission: "tickets.manage", subject, link: `/admin/tickets/${ticket.id}` });
    await logEvent({
      action: "ticket.created",
      entity: "Ticket",
      entityId: ticket.id,
      message: `Ticket ${reference} raised from the website.`,
      ipAddress: clientIp(req),
      metadata: { reference, category: data.category },
    });

    return created(reference, `Your request has been logged as ${reference}. Our team will contact you on ${data.phone}.`);
  } catch (error) {
    console.error("[tickets] create failed:", error);
    return failed();
  }
}
