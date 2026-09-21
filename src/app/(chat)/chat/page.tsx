import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Credit } from "@/components/branding/Credit";
import { Logo } from "@/components/branding/Logo";
import { BRAND } from "@/config/brand";
import { JsonLd } from "@/components/seo/JsonLd";
import { OG_IMAGE, breadcrumbJsonLd, assistantJsonLd } from "@/lib/site";

const CHAT_TITLE = "Chat with Our AI Concierge: Free Quotes 24/7";
const CHAT_DESCRIPTION = `Ask the ${BRAND.name} AI concierge about AI chatbots, WhatsApp automation, websites and marketing. Get pricing, a quote or a free consultation in English or Urdu.`;

export const metadata: Metadata = {
  title: CHAT_TITLE,
  description: CHAT_DESCRIPTION,
  alternates: { canonical: "/chat" },
  openGraph: { url: "/chat", title: `${CHAT_TITLE} | ${BRAND.name}`, description: CHAT_DESCRIPTION, images: [OG_IMAGE] },
};

export default function ChatPage() {
  return (
    <div className="dark brand-gradient relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-0 sm:p-6">
      <JsonLd
        graph={[
          assistantJsonLd(),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "AI Concierge", path: "/chat" },
          ]),
        ]}
      />
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      {/* The widget has no visible page heading; this names the page for search engines and screen readers. */}
      <h1 className="sr-only">{BRAND.name} AI Concierge: services, pricing, quotes and consultations</h1>

      <div className="ring-gradient relative flex h-dvh w-full max-w-6xl flex-col overflow-hidden bg-brand-ink/80 shadow-glow backdrop-blur-xl sm:h-[min(92dvh,960px)] sm:rounded-[1.75rem]">
        {/* Widget header */}
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <Logo descriptor="AI Concierge" />
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-white/65 md:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
              Replies in seconds · 24/7
            </span>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white/55 transition hover:text-white"
            >
              <ArrowLeft className="size-3.5" /> Home
            </Link>
          </div>
        </header>

        {/* Chat */}
        <div className="min-h-0 flex-1">
          <ChatWindow />
        </div>

        {/* Chat widget footer — branding */}
        <div className="border-t border-white/[0.06] px-4 py-2.5">
          <Credit className="text-center" />
        </div>
      </div>
    </div>
  );
}
