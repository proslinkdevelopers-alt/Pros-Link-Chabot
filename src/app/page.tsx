import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  Headset,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Search,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import { SiteHeader } from "@/components/branding/SiteHeader";
import { Footer } from "@/components/branding/Footer";
import { LogoMark } from "@/components/branding/Logo";
import { WhatsAppIcon } from "@/components/branding/WhatsAppIcon";
import { CategoryIcon } from "@/components/catalog/CategoryIcon";
import { JsonLd } from "@/components/seo/JsonLd";
import { BRAND } from "@/config/brand";
import { SERVICES } from "@/data/catalog";
import { listCategories, verifiedBrands } from "@/lib/catalog";
import { getCompanyProfile, digits, hasContact, whatsappLink } from "@/lib/company";
import { categoryHref, chatHref, type ChatStart } from "@/lib/chat-start";
import { SEO, assistantJsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: SEO.homeTitle },
  description: SEO.homeDescription,
  alternates: { canonical: "/" },
  openGraph: { url: "/", title: SEO.homeTitle, description: SEO.homeDescription },
};

/** Contact details and the catalogue are read at request time, so edits in the console show at once. */
export const dynamic = "force-dynamic";

/** Only what Pros-Link has said about itself. */
const REASONS = [
  {
    icon: Truck,
    title: "Nationwide presence",
    body: `Sales and distribution across ${BRAND.serviceArea}, so equipment and supplies reach you where you work.`,
  },
  {
    icon: Wrench,
    title: "After-sales support",
    body: "Installation, maintenance, repair and technical support after the sale — not just the machine.",
  },
  {
    icon: ClipboardList,
    title: "One partner, end to end",
    body: "Equipment, consumables, parts and service from a single team that knows your setup.",
  },
  {
    icon: BadgeCheck,
    title: "Built for businesses",
    body: `Office equipment and office solutions for businesses across ${BRAND.serviceArea}.`,
  },
];

const STEPS = [
  {
    icon: MessageSquareText,
    title: "Tell us what you need",
    body: "A product, a quotation, a repair or a question — in English, Urdu or Roman Urdu.",
  },
  {
    icon: ClipboardList,
    title: "Get a reference number",
    body: "Quote requests and service tickets are logged straight into our system with a reference you can track.",
  },
  {
    icon: UserRound,
    title: "Our team follows up",
    body: "The right person — sales or a technician — picks it up with everything you've already told us.",
  },
];

export default async function HomePage() {
  const [company, categories, brands] = await Promise.all([getCompanyProfile(), listCategories(), verifiedBrands()]);
  const wa = whatsappLink(company, `Hello ${BRAND.name}`);

  return (
    <>
      <JsonLd graph={[organizationJsonLd(company), websiteJsonLd(), assistantJsonLd()]} />

      <div className="min-h-dvh bg-background">
        <SiteHeader whatsappUrl={wa} logoUrl={company.logoUrl || undefined} />

        <main>
          {/* ------------------------------------------------------------ Hero */}
          <section className="dark brand-gradient relative overflow-hidden text-foreground">
            <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
            <div className="container relative grid items-center gap-12 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:pb-24">
              <div>
                <p className="eyebrow text-white/60">Office equipment · Supplies · Service</p>
                <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.08] tracking-tightest text-white sm:text-5xl lg:text-[3.6rem]">
                  Your trusted <span className="text-gradient">office solutions</span> partner.
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-white/70">{BRAND.description}</p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href={chatHref("products")}
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[15px] font-semibold text-white shadow-brand transition hover:brightness-110"
                  >
                    <Search className="size-4" /> Explore products
                  </Link>
                  <Link
                    href={chatHref("quote")}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/20 bg-white/[0.04] px-5 text-[15px] font-semibold text-white transition hover:border-white/35 hover:bg-white/[0.08]"
                  >
                    Request a quote
                  </Link>
                  <Link
                    href={chatHref("service")}
                    className="inline-flex h-11 items-center gap-2 px-2 text-[15px] font-semibold text-white/80 transition hover:text-white"
                  >
                    Service &amp; repair <ArrowRight className="size-4" />
                  </Link>
                </div>

                <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.08] pt-6 text-[13px] text-white/60">
                  <li className="inline-flex items-center gap-2"><BadgeCheck className="size-4 text-brand-sky" /> Sales &amp; distribution nationwide</li>
                  <li className="inline-flex items-center gap-2"><BadgeCheck className="size-4 text-brand-sky" /> After-sales support</li>
                  <li className="inline-flex items-center gap-2"><BadgeCheck className="size-4 text-brand-sky" /> Service requests you can track</li>
                </ul>
              </div>

              <AssistantPreview />
            </div>
          </section>

          {/* -------------------------------------------------------- Products */}
          <section id="products" className="scroll-mt-20 py-20">
            <div className="container">
              <SectionHeading
                eyebrow="Products"
                title="Equipment and supplies for the working office"
                body="Choose a category to see what we carry, ask a question or request a quotation. The assistant shares the current range and specifications our team has published."
              />
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={categoryHref(category.slug)}
                    className="group flex flex-col rounded-xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated"
                  >
                    <span className="grid size-11 place-items-center rounded-lg bg-primary/[0.08] text-primary ring-1 ring-inset ring-primary/10">
                      <CategoryIcon name={category.icon} className="size-5" />
                    </span>
                    <h3 className="mt-4 text-[15px] font-semibold">{category.name}</h3>
                    {category.description && (
                      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{category.description}</p>
                    )}
                    <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                      View range <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                ))}
                <Link
                  href={chatHref("quote")}
                  className="flex flex-col justify-between rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-5 transition hover:bg-primary/[0.06]"
                >
                  <div>
                    <h3 className="text-[15px] font-semibold">Not sure what you need?</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      Tell us about your office and our team will recommend the right equipment.
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                    Ask for a recommendation <ArrowRight className="size-3.5" />
                  </span>
                </Link>
              </div>

              {brands.length > 0 && (
                <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t pt-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Brands we carry</p>
                  {brands.map((brand) => (
                    <span key={brand} className="text-base font-bold tracking-tight text-foreground/70">
                      {brand}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* -------------------------------------------------------- Services */}
          <section id="services" className="scroll-mt-20 border-y bg-card py-20">
            <div className="container">
              <SectionHeading
                eyebrow="Services"
                title="Installation, maintenance and repair"
                body="Every service request becomes a ticket with a reference number, so you always know where it stands."
              />
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {SERVICES.map((service) => (
                  <Link
                    key={service.key}
                    href={chatHref(service.start as ChatStart)}
                    className="group flex gap-4 rounded-xl border bg-background p-5 transition hover:border-primary/30 hover:bg-card hover:shadow-soft"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-ink text-white">
                      <CategoryIcon name={service.icon} className="size-[18px]" />
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold">{service.name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{service.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------- Why + how */}
          <section className="py-20">
            <div className="container grid gap-14 lg:grid-cols-2">
              <div>
                <SectionHeading eyebrow={`Why ${BRAND.name}`} title="A partner for the whole life of your equipment" />
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  {REASONS.map((reason) => (
                    <div key={reason.title}>
                      <reason.icon className="size-5 text-primary" aria-hidden />
                      <h3 className="mt-3 text-[15px] font-semibold">{reason.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{reason.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div id="support" className="scroll-mt-20 rounded-2xl border bg-card p-7 shadow-soft">
                <p className="eyebrow">How it works</p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight">From request to resolution</h2>
                <ol className="mt-6 space-y-5">
                  {STEPS.map((step, index) => (
                    <li key={step.title} className="flex gap-4">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {index + 1}
                      </span>
                      <div>
                        <h3 className="text-[15px] font-semibold">{step.title}</h3>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-7 flex flex-wrap gap-2">
                  <Link href={chatHref("repair")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-brand hover:brightness-110">
                    <Wrench className="size-4" /> Request service
                  </Link>
                  <Link href={chatHref("track")} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-secondary">
                    Track my request
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* --------------------------------------------------------- Contact */}
          <section className="dark brand-gradient text-foreground">
            <div className="container grid gap-10 py-16 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <h2 className="text-balance text-3xl font-bold tracking-tight text-white">Talk to the {BRAND.name} team</h2>
                <p className="mt-3 max-w-xl text-white/65">
                  Ask about a product, request a quotation or register a service request. The {BRAND.assistant.name} passes
                  it straight to our team with a reference number.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/chat" className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-[15px] font-semibold text-brand-ink transition hover:bg-white/90">
                    <Headset className="size-4" /> Open the {BRAND.assistant.name}
                  </Link>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg bg-whatsapp px-5 text-[15px] font-semibold text-white transition hover:brightness-105">
                      <WhatsAppIcon className="size-4" /> Chat on WhatsApp
                    </a>
                  )}
                </div>
              </div>

              {hasContact(company) || company.address || company.offices.length ? (
                <dl className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm sm:grid-cols-2">
                  {company.phone && (
                    <ContactItem icon={Phone} label="Phone">
                      <a href={`tel:+${digits(company.phone)}`} className="hover:text-brand-sky">{company.phone}</a>
                    </ContactItem>
                  )}
                  {company.email && (
                    <ContactItem icon={Mail} label="Email">
                      <a href={`mailto:${company.email}`} className="break-all hover:text-brand-sky">{company.email}</a>
                    </ContactItem>
                  )}
                  {company.address && (
                    <ContactItem icon={MapPin} label="Head office">{company.address}</ContactItem>
                  )}
                  {company.offices.map((office) => (
                    <ContactItem key={`${office.city}-${office.address}`} icon={MapPin} label={office.city}>
                      {[office.address, office.phone].filter(Boolean).join(" · ") || "—"}
                    </ContactItem>
                  ))}
                  {company.hours && <p className="text-xs text-white/45 sm:col-span-2">{company.hours}</p>}
                </dl>
              ) : null}
            </div>
          </section>
        </main>

        <Footer company={company} categories={categories} />
      </div>
    </>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight">{title}</h2>
      {body && <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{body}</p>}
    </div>
  );
}

function ContactItem({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand-sky" />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</dt>
        <dd className="mt-0.5 text-white/85">{children}</dd>
      </div>
    </div>
  );
}

/** An illustration of the assistant, labelled as an example — not a real conversation. */
function AssistantPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-md" aria-label="Example conversation with the Pros-Link Assistant">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white text-brand-ink shadow-glow">
        <div className="flex items-center gap-3 bg-brand-ink px-4 py-3 text-white">
          <LogoMark className="size-8" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{BRAND.assistant.name}</p>
            <p className="text-[11px] text-white/60">{BRAND.assistant.subtitle}</p>
          </div>
        </div>
        <div className="space-y-3 bg-brand-surface px-4 py-5 text-[13px] leading-relaxed">
          <p className="ml-auto w-fit max-w-[80%] rounded-lg rounded-tr-sm bg-brand-blue px-3 py-2 text-white">
            I need a photocopier for my office.
          </p>
          <p className="w-fit max-w-[85%] rounded-lg rounded-tl-sm border bg-white px-3 py-2">
            Happy to help. Roughly how many pages does your office copy or print in a month, and do you also need
            scanning?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["Photocopiers / MFPs", "Request a Quote", "Talk to Sales"].map((label) => (
              <span key={label} className="rounded-md border border-brand-blue/25 bg-white px-2.5 py-1 text-[12px] font-medium text-brand-blue">
                {label}
              </span>
            ))}
          </div>
          <p className="flex w-fit items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/15">
            <BadgeCheck className="size-3.5" /> Quote request logged — reference shared with you
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[11px] text-white/45">Example conversation</figcaption>
    </figure>
  );
}
