import { DEPARTMENT } from "@/config/brand";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateReference } from "@/lib/utils";
import { logEvent, notifyTeam } from "@/lib/notify";
import { clientIp, conversationIdFor, created, failed, invalid, throttle } from "@/lib/api";
import { findService } from "@/data/marketing/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lead capture.
 *
 * Collects the fields from the brief (name, company, phone, email, business,
 * budget, timeline, requirements), generates a lead reference, stores it in the
 * CRM pipeline at stage NEW and notifies the sales team.
 */
const bodySchema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional(),
  phone: z.string().min(7).max(32),
  email: z.string().email().max(160).optional().or(z.literal("")),
  businessType: z.string().max(120).optional(),
  /** Slug of the requested service, when the visitor named one. */
  service: z.string().max(80).optional(),
  budget: z.string().max(80).optional(),
  timeline: z.string().max(80).optional(),
  requirements: z.string().min(5).max(4000),
  conversationRef: z.string().max(64).optional(),
});

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "leads", 5, 600);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid();

  const data = parsed.data;
  const reference = generateReference("LEAD");
  const service = data.service ? findService(data.service) : undefined;

  try {
    const lead = await prisma.lead.create({
      data: {
        reference,
        department: DEPARTMENT,
        name: data.name,
        company: data.company || null,
        phone: data.phone,
        email: data.email || null,
        businessType: data.businessType || null,
        serviceSlug: service?.slug ?? data.service ?? null,
        budget: data.budget || null,
        timeline: data.timeline || null,
        requirements: data.requirements,
        source: "CHATBOT",
        stage: "NEW",
        conversationId: await conversationIdFor(data.conversationRef),
      },
      select: { id: true },
    });

    await notifyTeam({
      subject: `New lead ${reference} — ${data.name}${data.company ? ` (${data.company})` : ""}`,
      body: [
        `Reference: ${reference}`,
        `Name: ${data.name}`,
        data.company ? `Company: ${data.company}` : null,
        `Phone: ${data.phone}`,
        data.email ? `Email: ${data.email}` : null,
        data.businessType ? `Business: ${data.businessType}` : null,
        service ? `Service: ${service.name}` : null,
        data.budget ? `Budget: ${data.budget}` : null,
        data.timeline ? `Timeline: ${data.timeline}` : null,
        "",
        "Requirements:",
        data.requirements,
      ]
        .filter(Boolean)
        .join("\n"),
      link: `/admin/crm/leads/${lead.id}`,
    });

    await logEvent({
      action: "lead.created",
      entity: "Lead",
      entityId: lead.id,
      message: `Lead ${reference} captured from the assistant.`,
      ipAddress: clientIp(req),
      metadata: { reference, service: service?.slug },
    });

    return created(
      reference,
      `Thank you, ${data.name.split(" ")[0]}! Your request is logged as **${reference}**. Our team will contact you on ${data.phone} within one working day.`
    );
  } catch (error) {
    console.error("[leads] create failed:", error);
    return failed();
  }
}
