import { BRAND } from "@/config/brand";
import { SITE_URL, absoluteUrl } from "@/lib/site";

/**
 * llms.txt: a plain-text summary for AI assistants and AI search engines.
 * Contact details are deliberately absent — they live in the database and
 * change without a deploy; the pages linked below carry them.
 */
export const dynamic = "force-static";

export function GET() {
  const body = `# ${BRAND.name}

> ${BRAND.description}

${BRAND.name} — ${BRAND.tagline}. This site (${SITE_URL}) hosts the ${BRAND.assistant.name}, which helps customers explore products, request quotations, arrange installation, maintenance and repair, register support requests and track them, in English, Urdu and Roman Urdu.

## What ${BRAND.name} offers

${BRAND.businessAreas.map((area) => `- ${area}`).join("\n")}

## Pages

- [Home](${absoluteUrl("/")}): Products, services and how to reach the team.
- [${BRAND.assistant.name}](${absoluteUrl("/chat")}): Quotes, service requests, support and request tracking.
- [About](${absoluteUrl("/about")}): About ${BRAND.name}.

Product specifications, prices and availability are confirmed by the ${BRAND.name} team; the assistant does not quote them unless the team has published them.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
