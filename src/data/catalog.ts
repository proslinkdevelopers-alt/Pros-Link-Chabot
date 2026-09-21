/**
 * =============================================================================
 *  Catalogue defaults
 * =============================================================================
 *
 *  The seed loads these into the database; from then on categories and brands
 *  are managed in Admin → Categories and Admin → Brands.
 *
 *  Only what was supplied is here:
 *
 *   • CATEGORIES are the product areas Pros-Link named. Descriptions say what
 *     the category is, never what is in stock, which models exist or what
 *     anything costs.
 *   • BRANDS are the three names given as examples of brands Pros-Link may
 *     carry. Nobody has confirmed they are authorised partnerships, so they
 *     are seeded UNVERIFIED and INACTIVE: the assistant and the site do not
 *     mention a brand until a member of staff verifies and activates it.
 *   • No product is seeded. Products — with their real specifications,
 *     availability and documents — are entered in Admin → Products.
 * =============================================================================
 */

export interface CategorySeed {
  slug: string;
  name: string;
  description: string;
  /** Lucide icon name — see `components/catalog/CategoryIcon.tsx`. */
  icon: string;
  /** Words customers use for it, in English and Roman Urdu. */
  keywords: string[];
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  {
    slug: "digital-duplicators",
    name: "Digital Duplicators",
    description: "Duplicators for high-volume, repeat printing of the same page.",
    icon: "layers",
    keywords: ["duplicator", "digital duplicator", "risograph", "riso", "stencil", "master", "duplo"],
  },
  {
    slug: "photocopiers-mfps",
    name: "Photocopiers / MFPs",
    description: "Photocopiers and multifunction printers that copy, print and scan.",
    icon: "copy",
    keywords: ["photocopier", "photocopy", "copier", "copy machine", "mfp", "multifunction", "fotocopy"],
  },
  {
    slug: "printers",
    name: "Printers",
    description: "Printers for everyday and high-volume office printing.",
    icon: "printer",
    keywords: ["printer", "laser printer", "inkjet", "print machine"],
  },
  {
    slug: "office-equipment",
    name: "Office Equipment",
    description: "Machines and equipment for the working office.",
    icon: "briefcase",
    keywords: ["office equipment", "office machine", "equipment"],
  },
  {
    slug: "office-supplies",
    name: "Office Supplies",
    description: "Paper and day-to-day office supplies.",
    icon: "paperclip",
    keywords: ["office supplies", "stationery", "paper", "a4 paper", "supplies"],
  },
  {
    slug: "consumables",
    name: "Consumables",
    description: "Toner, ink, masters and other consumables for office machines.",
    icon: "droplets",
    keywords: ["toner", "ink", "cartridge", "drum", "consumables", "master roll"],
  },
  {
    slug: "parts-accessories",
    name: "Parts & Accessories",
    description: "Replacement parts and accessories for office machines.",
    icon: "cog",
    keywords: ["spare parts", "parts", "accessories", "roller", "fuser", "part"],
  },
];

export interface BrandSeed {
  slug: string;
  name: string;
  notes: string;
}

const UNVERIFIED = "Named in the migration brief as a brand Pros-Link may carry. Verify the partnership, then mark it verified and active.";

export const DEFAULT_BRANDS: BrandSeed[] = [
  { slug: "rongda", name: "Rongda", notes: UNVERIFIED },
  { slug: "sindoh", name: "Sindoh", notes: UNVERIFIED },
  { slug: "janibis", name: "Janibis", notes: UNVERIFIED },
];

/** Services Pros-Link provides, as shown on the site and offered by the assistant. */
export const SERVICES = [
  {
    key: "installation",
    name: "Installation",
    description: "Setting up new machines at your office and getting them ready to use.",
    icon: "package-check",
    start: "installation",
  },
  {
    key: "maintenance",
    name: "Maintenance",
    description: "Scheduled servicing to keep machines running reliably.",
    icon: "shield-check",
    start: "maintenance",
  },
  {
    key: "repair",
    name: "Repair",
    description: "Diagnosis and repair when a machine stops working properly.",
    icon: "wrench",
    start: "repair",
  },
  {
    key: "support",
    name: "Technical Support",
    description: "Help with errors, settings and day-to-day technical questions.",
    icon: "headset",
    start: "support",
  },
  {
    key: "parts",
    name: "Parts & Supplies",
    description: "Replacement parts, consumables and supplies for your machines.",
    icon: "package",
    start: "parts",
  },
  {
    key: "solutions",
    name: "Office Solutions",
    description: "Advice on the right equipment and setup for your business.",
    icon: "building",
    start: "sales",
  },
] as const;
