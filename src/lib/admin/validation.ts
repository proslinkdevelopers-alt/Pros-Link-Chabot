import { z } from "zod";

/** Field rules shared by the console's create and update routes. */

export const phoneField = z
  .string()
  .trim()
  .max(32)
  .refine((value) => /^[+\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15, "Enter a valid phone number.");

/** Optional text: an empty string is stored as null. */
export const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();

export const optionalPhone = z
  .union([phoneField, z.literal("")])
  .transform((value) => value || null)
  .nullable();

export const optionalEmail = z
  .union([z.string().trim().email("Enter a valid email address.").max(160), z.literal("")])
  .transform((value) => (value ? value.toLowerCase() : null))
  .nullable();

export const recordId = z.string().trim().min(1).max(64);

/** A calendar date as YYYY-MM-DD, stored at UTC midnight. */
export const dateField = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date."), z.literal("")])
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null))
  .nullable();

export const money = z.coerce.number().nonnegative().max(9_999_999_999);
