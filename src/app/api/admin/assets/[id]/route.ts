import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { fail, notFound, ok, readBody } from "@/lib/admin/http";
import { assetSchema } from "@/lib/admin/asset-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const FIELDS = { label: true, brand: true, model: true, serialNumber: true, installedAt: true, warrantyUntil: true, location: true, notes: true, productId: true, customerId: true } as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("customers.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const body = await readBody(req, assetSchema.partial());
  if ("response" in body) return body.response;

  const before = await prisma.customerAsset.findFirst({ where: { id, department: DEPARTMENT }, select: FIELDS });
  if (!before) return notFound();
  if (body.data.productId && !(await prisma.product.count({ where: { id: body.data.productId, department: DEPARTMENT } }))) {
    return fail("Choose a product from the list.", 400, { productId: "Not found." });
  }

  await prisma.customerAsset.update({ where: { id }, data: body.data });
  await audit({ action: "asset.updated", entity: "CustomerAsset", entityId: id, userId: guard.staff.id, message: `${guard.staff.name} updated “${before.label}”.`, before, after: body.data, req });
  return ok({ id });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("customers.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const before = await prisma.customerAsset.findFirst({ where: { id, department: DEPARTMENT }, select: FIELDS });
  if (!before) return notFound();
  await prisma.customerAsset.delete({ where: { id } });
  await audit({ action: "asset.deleted", entity: "CustomerAsset", entityId: id, userId: guard.staff.id, message: `${guard.staff.name} removed “${before.label}”.`, before, after: { deleted: true }, req });
  return ok();
}
