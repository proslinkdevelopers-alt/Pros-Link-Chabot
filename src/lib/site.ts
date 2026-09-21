import { BRAND } from "@/config/brand";
import type { CompanyProfile } from "@/lib/company-schema";

/**
 * Public, canonical identity of this site for search engines.
 *
 * Canonical URLs, the sitemap, robots.txt and structured data need one absolute
 * origin, and it comes only from `NEXT_PUBLIC_APP_URL`. There is no hard-coded
 * production domain to fall back to — set the variable on every deployment.
 */
const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();

export const SITE_URL = (envUrl || "http://localhost:3000").replace(/\/$/, "");

export const absoluteUrl = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export const SEO = {
  homeTitle: BRAND.seo.title,
  homeDescription: BRAND.seo.description,
  ogAlt: `${BRAND.name} — ${BRAND.tagline}`,
};

/**
 * A page that sets its own `openGraph` replaces the root one, which drops the
 * generated share image, so pages spread this back in.
 */
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: SEO.ogAlt };

/** Every public, indexable route. The sitemap is generated from this list. */
export const PUBLIC_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/chat", changeFrequency: "monthly", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
] as const;

/** The organisation, with only the contact details staff have entered. */
export function organizationJsonLd(company: CompanyProfile) {
  const sameAs = Object.values(company.social).filter(Boolean);
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: BRAND.name,
    slogan: BRAND.tagline,
    description: BRAND.description,
    url: company.website || SITE_URL,
    ...(company.logoUrl || BRAND.logoUrl ? { logo: absoluteMaybe(company.logoUrl || BRAND.logoUrl!) } : {}),
    ...(company.email ? { email: company.email } : {}),
    ...(company.phone ? { telephone: company.phone } : {}),
    ...(company.address ? { address: { "@type": "PostalAddress", streetAddress: company.address, addressCountry: "PK" } } : {}),
    areaServed: { "@type": "Country", name: BRAND.serviceArea },
    knowsAbout: BRAND.businessAreas,
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: BRAND.name,
    description: SEO.homeDescription,
    inLanguage: ["en", "ur"],
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export function assistantJsonLd() {
  return {
    "@type": "WebApplication",
    "@id": `${SITE_URL}/chat#app`,
    name: BRAND.assistant.name,
    url: absoluteUrl("/chat"),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript",
    availableLanguage: ["English", "Urdu", "Roman Urdu"],
    description: `${BRAND.assistant.name} helps you explore office equipment, request a quote, arrange installation, maintenance or repair, and reach the ${BRAND.name} team.`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "PKR" },
    provider: { "@id": ORGANIZATION_ID },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

function absoluteMaybe(value: string): string {
  return /^https?:\/\//.test(value) ? value : absoluteUrl(value);
}
