import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { BRAND } from "@/config/brand";
import { DEFAULT_CATEGORIES } from "@/data/catalog";
import { SOCIAL_LABELS, digits, hasContact, whatsappLink, type CompanyProfile } from "@/lib/company-schema";
import { categoryHref, chatHref } from "@/lib/chat-start";
import { Credit } from "./Credit";
import { Logo } from "./Logo";
import { WhatsAppIcon } from "./WhatsAppIcon";

/**
 * Site footer. Contact details come from the company profile and appear only
 * once they have been entered in Admin → Settings.
 */
export function Footer({
  company,
  categories = DEFAULT_CATEGORIES,
}: {
  company: CompanyProfile;
  categories?: Array<{ slug: string; name: string }>;
}) {
  const year = new Date().getFullYear();
  const wa = whatsappLink(company);
  const social = (Object.keys(company.social) as Array<keyof CompanyProfile["social"]>).filter((key) => company.social[key]);

  return (
    <footer className="dark border-t border-white/[0.07] bg-brand-ink text-foreground">
      <div className="container grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo logoUrl={company.logoUrl || undefined} />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/55">{BRAND.description}</p>
          {social.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/55">
              {social.map((key) => (
                <li key={key}>
                  <a href={company.social[key]} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                    {SOCIAL_LABELS[key]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FooterColumn title="Products" className="md:col-span-3">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={categoryHref(category.slug)} className="transition hover:text-white">
                {category.name}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title="Service & support" className="md:col-span-2">
          <li><Link href={chatHref("installation")} className="transition hover:text-white">Installation</Link></li>
          <li><Link href={chatHref("repair")} className="transition hover:text-white">Repair & maintenance</Link></li>
          <li><Link href={chatHref("parts")} className="transition hover:text-white">Parts & supplies</Link></li>
          <li><Link href={chatHref("track")} className="transition hover:text-white">Track my request</Link></li>
          <li><Link href="/about" className="transition hover:text-white">About {BRAND.name}</Link></li>
        </FooterColumn>

        <FooterColumn title="Contact" className="md:col-span-3">
          {company.phone && (
            <li>
              <a href={`tel:+${digits(company.phone)}`} className="inline-flex items-center gap-2 transition hover:text-white">
                <Phone className="size-3.5" /> {company.phone}
              </a>
            </li>
          )}
          {wa && (
            <li>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-white">
                <WhatsAppIcon className="size-3.5" /> {company.whatsapp}
              </a>
            </li>
          )}
          {company.email && (
            <li className="break-all">
              <a href={`mailto:${company.email}`} className="inline-flex items-center gap-2 transition hover:text-white">
                <Mail className="size-3.5 shrink-0" /> {company.email}
              </a>
            </li>
          )}
          {company.address && (
            <li className="flex gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0" /> <span>{company.address}</span>
            </li>
          )}
          {company.hours && <li className="text-white/40">{company.hours}</li>}
          {!hasContact(company) && (
            <li>
              <Link href="/chat" className="transition hover:text-white">
                Message us through the {BRAND.assistant.name}
              </Link>
            </li>
          )}
        </FooterColumn>
      </div>

      <div className="border-t border-white/[0.07]">
        <div className="container flex flex-col items-center gap-3 py-5 text-center md:flex-row md:justify-between md:text-left">
          <p className="text-[11px] text-white/40">
            © {year} {BRAND.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Credit className="text-white/40" />
            <Link href="/login" className="text-[11px] text-white/40 hover:text-white/70">
              Staff sign in
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm text-white/65">{children}</ul>
    </div>
  );
}
