import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { fail, ok, readBody } from "@/lib/admin/http";
import { assetSchema } from "@/lib/admin/asset-schema";
import { recordId } from "@/lib/admin/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Record a machine at a customer's site. */
export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("customers.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, assetSchema.extend({ customerId: recordId }));
  if ("response" in body) return body.response;
  const { customerId, ...input } = body.data;

  const [customer, product] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, department: DEPARTMENT }, select: { id: true, name: true } }),
    input.productId ? prisma.product.findFirst({ where: { id: input.productId, department: DEPARTMENT }, select: { id: true } }) : null,
  ]);
  if (!customer) return fail("Customer not found.", 404);
  if (input.productId && !product) return fail("Choose a product from the list.", 400, { productId: "Not found." });

  const asset = await prisma.customerAsset.create({
    data: { ...input, customerId, department: DEPARTMENT },
    select: { id: true },
  });
  await audit({
    action: "asset.created",
    entity: "CustomerAsset",
    entityId: asset.id,
    userId: guard.staff.id,
    message: `${guard.staff.name} recorded “${input.label}” for ${customer.name}.`,
    after: { customerId, ...input },
    req,
  });
  return ok({ id: asset.id }, 201);
}
