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
 * Website enquiries and quote requests — for a contact or quote form on a
 * Pros-Link website. Creates a lead (and, when a quotation is asked for, a
 * quote request) linked to the customer's profile, and notifies the team.
 *
 * Public, so it is rate-limited, validated field by field, and accepts only
 * catalogue ids that exist in this tenant.
 */
const phone = z
  .string()
  .trim()
  .max(32)
  .refine((value) => /^[+\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15, "Enter a valid phone number.");

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  phone,
  whatsapp: phone.optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional(),
  /** Category slug, e.g. "photocopiers-mfps". */
  category: z.string().trim().regex(/^[a-z0-9-]{1,80}$/).optional(),
  productId: z.string().trim().max(64).optional(),
  quantity: z.string().trim().max(60).optional(),
  budget: z.string().trim().max(80).optional(),
  preferredContact: z.enum(["Phone call", "WhatsApp", "Email"]).optional(),
  requirements: z.string().trim().min(5).max(4000),
  /** Ask for a quotation (default) or just get in touch. */
  quote: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "leads", 5, 600);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const data = parsed.data;

  try {
    const [category, product] = await Promise.all([
      data.category ? prisma.productCategory.findFirst({ where: { department: DEPARTMENT, slug: data.category }, select: { id: true, name: true } }) : null,
      data.productId
        ? prisma.product.findFirst({ where: { department: DEPARTMENT, id: data.productId, status: "PUBLISHED" }, select: { id: true, name: true } })
        : null,
    ]);
    const interest = product?.name ?? category?.name ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const customerId = await linkCustomer(tx, {
        name: data.name,
        phone: data.phone,
        whatsapp: data.whatsapp || null,
        email: data.email || null,
        company: data.company,
        city: data.city,
        source: "WEBSITE",
      });
      const leadReference = generateReference("LEAD");
      const lead = await tx.lead.create({
        data: {
          reference: leadReference,
          department: DEPARTMENT,
          name: data.name,
          company: data.company || null,
          phone: data.phone,
          whatsapp: data.whatsapp || null,
          email: data.email || null,
          city: data.city || null,
          subService: interest,
          productCategoryId: category?.id ?? null,
          productId: product?.id ?? null,
          quantity: data.quantity || null,
          budget: data.budget || null,
          preferredContact: data.preferredContact ?? null,
          requirements: data.requirements,
          source: "WEBSITE",
          stage: data.quote ? "QUOTE_REQUESTED" : "NEW",
          nextAction: data.quote ? "Prepare and send the quotation" : "Contact the customer",
          customerId,
        },
        select: { id: true },
      });
      let quoteReference: string | null = null;
      if (data.quote) {
        quoteReference = generateReference("QTE");
        await tx.quote.create({
          data: {
            reference: quoteReference,
            department: DEPARTMENT,
            title: `${interest ?? "Quotation request"} — ${data.company || data.name}`.slice(0, 180),
            status: "REQUESTED",
            requirements: data.requirements,
            quantity: data.quantity || null,
            budget: data.budget || null,
            preferredContact: data.preferredContact ?? null,
            city: data.city || null,
            source: "WEBSITE",
            productCategoryId: category?.id ?? null,
            productId: product?.id ?? null,
            leadId: lead.id,
            customerId,
          },
        });
      }
      return { leadId: lead.id, leadReference, quoteReference };
    });

    const reference = result.quoteReference ?? result.leadReference;
    const subject = `${result.quoteReference ? "Quote request" : "Website enquiry"} ${reference} — ${data.name}${data.company ? ` (${data.company})` : ""}`;
    await notifyTeam({
      subject,
      body: [
        `Reference: ${reference}`,
        `Name: ${data.name}`,
        data.company ? `Company: ${data.company}` : null,
        `Phone: ${data.phone}`,
        data.email ? `Email: ${data.email}` : null,
        data.city ? `City: ${data.city}` : null,
        interest ? `Interested in: ${interest}` : null,
        data.quantity ? `Quantity: ${data.quantity}` : null,
        "",
        data.requirements,
      ]
        .filter((line) => line !== null)
        .join("\n"),
      link: `/admin/leads/${result.leadId}`,
    });
    await notifyStaff({ permission: result.quoteReference ? "quotes.manage" : "leads.manage", subject, link: `/admin/leads/${result.leadId}` });
    await logEvent({
      action: result.quoteReference ? "quote.requested" : "lead.created",
      entity: "Lead",
      entityId: result.leadId,
      message: `${subject} submitted from the website.`,
      ipAddress: clientIp(req),
      metadata: { reference, category: data.category },
    });

    return created(reference, `Thank you. Your request has been submitted to Pros-Link. Your reference is ${reference}.`);
  } catch (error) {
    console.error("[leads] create failed:", error);
    return failed();
  }
}
