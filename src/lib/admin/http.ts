import type { z } from "zod";
import { Prisma } from "@prisma/client";

/**
 * Response helpers for the console's API routes, so every endpoint answers in
 * the same shape: `{ ok: true, ... }` on success, `{ error, fields? }` on
 * failure, where `fields` maps a form field to what is wrong with it.
 */

export function ok(data: Record<string, unknown> = {}, status = 200): Response {
  return Response.json({ ok: true, ...data }, { status });
}

export function fail(error: string, status = 400, fields?: Record<string, string>): Response {
  return Response.json({ error, ...(fields ? { fields } : {}) }, { status });
}

export const notFound = () => fail("Record not found.", 404);

/** The body parsed by `schema`, or a 400 naming each invalid field. */
export async function readBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { response: Response }> {
  const raw = await req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { data: parsed.data };
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  const first = parsed.error.issues[0];
  const where = first?.path.length ? `${first.path.join(".")}: ` : "";
  return { response: fail(`${where}${first?.message ?? "Invalid request."}`, 400, fields) };
}

/** A unique-constraint violation, with the fields involved. */
export function uniqueViolation(error: unknown): string[] | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  }
  return null;
}

/** "photocopier-a3-mono" from "Photocopier A3 (Mono)". */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
