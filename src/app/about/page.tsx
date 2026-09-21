import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ClipboardList, Headset, Languages, ShieldCheck, Wrench } from "lucide-react";
import { SiteHeader } from "@/components/branding/SiteHeader";
import { Footer } from "@/components/branding/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { BRAND } from "@/config/brand";
import { listCategories } from "@/lib/catalog";
import { getCompanyProfile, whatsappLink } from "@/lib/company";
import { chatHref } from "@/lib/chat-start";
import { OG_IMAGE, breadcrumbJsonLd, organizationJsonLd } from "@/lib/site";

const TITLE = `About ${BRAND.name}`;
const DESCRIPTION = `${BRAND.description} Learn what ${BRAND.name} offers and how the ${BRAND.assistant.name} helps.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { url: "/about", title: `${TITLE} | ${BRAND.name}`, description: DESCRIPTION, images: [OG_IMAGE] },
};

export const dynamic = "force-dynamic";

const ASSISTANT = [
  {
    icon: ClipboardList,
    title: "Quotes and service requests, logged",
    body: "Quote requests, service tickets and support requests are created in our system with a reference number you can track.",
  },
  {
    icon: ShieldCheck,
    title: "Only what we have confirmed",
    body: "The assistant shares specifications, prices and availability only when our team has published them. Anything else, the team confirms.",
  },
  {
    icon: Headset,
    title: "A person when you need one",
    body: "Ask for a person at any point and the conversation goes to our team with everything you have already said.",
  },
  {
    icon: Languages,
    title: "English, Urdu and Roman Urdu",
    body: "Write the way you normally would — the assistant replies in your language.",
  },
];

export default async function AboutPage() {
  const [company, categories] = await Promise.all([getCompanyProfile(), listCategories()]);

  return (
    <div className="min-h-dvh bg-background">
      <JsonLd
        graph={[
          organizationJsonLd(company),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ]),
        ]}
      />
      <SiteHeader whatsappUrl={whatsappLink(company, `Hello ${BRAND.name}`)} logoUrl={company.logoUrl || undefined} />

      <main>
        <section className="dark brand-gradient text-foreground">
          <div className="container py-16 md:py-20">
            <p className="eyebrow text-white/60">About us</p>
            <h1 className="mt-4 max-w-3xl text-balance text-4xl font-extrabold tracking-tightest text-white sm:text-5xl">
              {BRAND.name} — {BRAND.tagline.toLowerCase()}.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70">{BRAND.description}</p>
          </div>
        </section>

        <section className="py-16">
          <div className="container grid gap-12 lg:grid-cols-2">
            <div>
              <p className="eyebrow">What we offer</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight">Equipment, supplies and the service behind them</h2>
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {BRAND.businessAreas.map((area) => (
                  <li key={area} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm font-medium">
                    <Wrench className="size-3.5 shrink-0 text-primary" aria-hidden />
                    {area}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="eyebrow">The {BRAND.assistant.name}</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight">{BRAND.assistant.subtitle}</h2>
              <div className="mt-6 space-y-5">
                {ASSISTANT.map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/[0.08] text-primary">
                      <item.icon className="size-[18px]" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold">{item.title}</h3>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href={chatHref("sales")}
                className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[15px] font-semibold text-white shadow-brand hover:brightness-110"
              >
                Talk to our team <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer company={company} categories={categories} />
    </div>
  );
}
