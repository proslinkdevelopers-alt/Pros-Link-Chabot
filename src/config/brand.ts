/**
 * =============================================================================
 *  Brand configuration — the one place the business is named
 * =============================================================================
 *
 *  Everything that identifies the business — name, positioning, what it sells,
 *  colours, the assistant's and the console's names, the prefix on reference
 *  numbers, the tenant stamped on every database row — is read from here. To
 *  deploy the platform for another business, change this file and the default
 *  content under `src/data`; no module hard-codes the brand.
 *
 *  What is deliberately NOT here: phone numbers, WhatsApp, email, address,
 *  offices, website and social links. Nothing verified was supplied, so none is
 *  invented. They are entered in Admin → Settings → Company profile, stored in
 *  the database, and read by the site, the web assistant and WhatsApp alike
 *  (`src/lib/company.ts`). Until they are entered, every surface says that the
 *  team will get in touch instead of showing a number.
 *
 *  Isomorphic: no server-only imports, so client components can read it.
 * =============================================================================
 */

/** The tenant value stamped on every record this deployment writes. */
export const DEPARTMENT = "PROSLINK" as const;
export type Department = typeof DEPARTMENT;

/** Prefix for every settings key this deployment owns, e.g. `proslink.company`. */
export const SETTINGS_PREFIX = "proslink." as const;

export const BRAND = {
  key: "proslink",
  name: "Pros-Link",
  tagline: "Your Trusted Office Solutions Partner",
  description:
    "Pros-Link is an office-equipment and office-solutions company serving businesses across Pakistan, with a nationwide sales and distribution presence and after-sales support.",
  /** What the business does — the assistant's scope and the site's copy. */
  businessAreas: [
    "Digital Duplicators",
    "Photocopiers / MFPs",
    "Printers",
    "Office Equipment",
    "Office Supplies",
    "Consumables",
    "Parts & Accessories",
    "Installation",
    "Maintenance",
    "Repair Services",
    "Technical Support",
    "Customer Care",
    "Business / Office Solutions",
  ],
  serviceArea: "Pakistan",
  timezone: "Asia/Karachi",
  /** Prefix for every customer-facing reference: PL-LEAD-…, PL-TKT-…, PL-QTE-… */
  referencePrefix: "PL",
  assistant: {
    name: "Pros-Link Assistant",
    subtitle: "Your Office Solutions Assistant",
  },
  console: {
    name: "Pros-Link Admin",
  },
  seo: {
    title: "Pros-Link | Your Trusted Office Solutions Partner",
    description:
      "Digital duplicators, photocopiers, printers, office supplies and consumables, with installation, maintenance, repair and technical support for businesses across Pakistan. Ask the Pros-Link Assistant for a quote or a service request.",
  },
  /**
   * The palette. `ink` is the navy foundation, `blue` the one accent that
   * carries action, `sky` a lighter blue for highlights on dark surfaces.
   * Mirrored as CSS variables in globals.css and Tailwind's `brand.*`.
   */
  colors: {
    ink: "#0A1628",
    navy: "#12264A",
    slate: "#1C2B45",
    blue: "#1D5FE0",
    sky: "#5AA2FF",
    steel: "#8A9BB5",
    surface: "#F5F7FB",
  },
  /**
   * The official logo, when one has been supplied: a path under /public or a
   * full URL. Unset, the built-in Pros-Link mark is used. Admin → Settings can
   * override it at runtime too.
   */
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim() || null,
} as const;

/**
 * Optional credit line for whoever built or maintains the deployment. Empty by
 * default, and nothing is rendered unless both variables are set.
 */
export const CREDIT = {
  name: process.env.NEXT_PUBLIC_CREDIT_NAME?.trim() || "",
  url: process.env.NEXT_PUBLIC_CREDIT_URL?.trim() || "",
};
