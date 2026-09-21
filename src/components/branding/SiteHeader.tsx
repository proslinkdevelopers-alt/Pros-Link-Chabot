import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "./Logo";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { chatHref } from "@/lib/chat-start";

const LINKS = [
  { label: "Products", href: "/#products" },
  { label: "Services", href: "/#services" },
  { label: "Support", href: "/#support" },
  { label: "About", href: "/about" },
];

/** Public navigation bar, shared by the landing and about pages. */
export function SiteHeader({ whatsappUrl, logoUrl }: { whatsappUrl?: string | null; logoUrl?: string | null }) {
  return (
    <header className="dark sticky top-0 z-40 border-b border-white/[0.07] bg-brand-ink/90 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo logoUrl={logoUrl} />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3.5 py-2 text-[13px] font-medium text-white/70 transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-[13px] font-medium text-white/85 transition hover:border-white/30 hover:text-white sm:inline-flex"
            >
              <WhatsAppIcon className="size-4 text-whatsapp" /> WhatsApp
            </a>
          )}
          <Link
            href={chatHref("quote")}
            className="group inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white shadow-brand transition hover:brightness-110"
          >
            Request a quote
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
