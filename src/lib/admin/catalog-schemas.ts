import { z } from "zod";

/**
 * What the console may write to the catalogue. Shared by the API routes and
 * the forms, so both reject the same things. Everything a customer can see is
 * entered by staff; nothing here is ever filled in automatically.
 */

const https = z
  .string()
  .trim()
  .url("Enter a full URL, starting with https://")
  .max(500)
  .refine((value) => value.startsWith("https://"), "Use an https:// address.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const id = z.string().trim().min(1).max(64);

export const AVAILABILITY = ["IN_STOCK", "LIMITED_STOCK", "OUT_OF_STOCK", "ON_ORDER", "ON_REQUEST", "DISCONTINUED"] as const;

export const productSchema = z.object({
  name: z.string().trim().min(2, "Enter the product name.").max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lower-case letters, numbers and single hyphens only.")
    .max(80)
    .optional()
    .or(z.literal("")),
  sku: optionalText(60),
  model: optionalText(80),
  categoryId: id.nullable().optional(),
  brandId: id.nullable().optional(),
  summary: optionalText(300),
  description: optionalText(8000),
  images: z.array(https).max(12, "Up to 12 images.").default([]),
  features: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  specifications: z
    .array(z.object({ label: z.string().trim().min(1, "Name the specification.").max(80), value: z.string().trim().min(1, "Give its value.").max(300) }))
    .max(40)
    .default([]),
  documents: z.array(z.object({ title: z.string().trim().min(1).max(120), url: https })).max(10).default([]),
  availability: z.enum(AVAILABILITY).default("ON_REQUEST"),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  isFeatured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  relatedIds: z.array(id).max(12).default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter the category name.").max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lower-case letters, numbers and single hyphens only.")
    .max(80)
    .optional()
    .or(z.literal("")),
  description: optionalText(300),
  icon: z
    .string()
    .trim()
    .regex(/^[a-z-]{1,30}$/)
    .nullable()
    .optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({
  name: z.string().trim().min(1, "Enter the brand name.").max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lower-case letters, numbers and single hyphens only.")
    .max(80)
    .optional()
    .or(z.literal("")),
  description: optionalText(500),
  website: https.nullable().optional().or(z.literal("").transform(() => null)),
  logoUrl: https.nullable().optional().or(z.literal("").transform(() => null)),
  isVerified: z.boolean().default(false),
  isActive: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  notes: optionalText(1000),
});
export type BrandInput = z.infer<typeof brandSchema>;
