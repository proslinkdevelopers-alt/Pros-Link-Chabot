import { z } from "zod";
import { dateField, recordId, text } from "./validation";

/** A machine at a customer's site — what service tickets are raised against. */
export const assetSchema = z.object({
  label: z.string().trim().min(2, "Name the machine, e.g. “Accounts photocopier”.").max(120),
  brand: text(60).optional(),
  model: text(80).optional(),
  serialNumber: text(60).optional(),
  installedAt: dateField.optional(),
  warrantyUntil: dateField.optional(),
  location: text(160).optional(),
  notes: text(1000).optional(),
  productId: recordId.nullable().optional(),
});
