import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT, SETTINGS_PREFIX } from "@/config/brand";
import { EMPTY_COMPANY_PROFILE, companyProfileSchema, type CompanyProfile } from "./company-schema";

export * from "./company-schema";

/**
 * Company profile storage — `settings` row `proslink.company`.
 *
 * Read by public pages, the web assistant and every WhatsApp message, so it is
 * cached in memory for a short while. Saving clears this instance's cache;
 * other instances pick the change up within `CACHE_MS`. A database outage
 * returns the empty profile rather than failing the page.
 */

export const COMPANY_KEY = `${SETTINGS_PREFIX}company`;
const CACHE_MS = 30_000;

let cache: { profile: CompanyProfile; at: number } | null = null;

export async function getCompanyProfile(options: { fresh?: boolean } = {}): Promise<CompanyProfile> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.profile;

  let profile = EMPTY_COMPANY_PROFILE;
  let failed = false;
  try {
    const row = await prisma.setting.findUnique({ where: { key: COMPANY_KEY }, select: { value: true, department: true } });
    if (row && row.department === DEPARTMENT) {
      const parsed = companyProfileSchema.safeParse(row.value);
      if (parsed.success) profile = parsed.data;
      else console.warn("[company] stored profile ignored:", parsed.error.issues[0]?.message);
    }
  } catch (error) {
    failed = true;
    console.warn("[company] using the empty profile:", error instanceof Error ? error.message.split("\n").find(Boolean) : error);
  }

  // A failed read is retried soon, so pages recover as soon as the database does.
  cache = { profile, at: failed ? Date.now() - CACHE_MS + 5_000 : Date.now() };
  return profile;
}

/** Validate and store the profile. Returns the previous value for the audit log. */
export async function saveCompanyProfile(
  input: unknown
): Promise<{ ok: true; before: CompanyProfile; after: CompanyProfile } | { ok: false; issues: string[] }> {
  const parsed = companyProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "profile"}: ${issue.message}`),
    };
  }

  const before = await getCompanyProfile({ fresh: true });
  await prisma.setting.upsert({
    where: { key: COMPANY_KEY },
    update: { value: parsed.data as Prisma.InputJsonValue, department: DEPARTMENT, group: "company" },
    create: {
      key: COMPANY_KEY,
      value: parsed.data as Prisma.InputJsonValue,
      department: DEPARTMENT,
      group: "company",
      description: "Company contact details, offices and links.",
    },
  });
  cache = null;
  return { ok: true, before, after: parsed.data };
}
