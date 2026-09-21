import type { Metadata } from "next";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { JsonLd } from "@/components/seo/JsonLd";
import { BRAND } from "@/config/brand";
import { getCompanyProfile, whatsappLink } from "@/lib/company";
import { startReplyId } from "@/lib/chat-start";
import { OG_IMAGE, assistantJsonLd, breadcrumbJsonLd } from "@/lib/site";

const TITLE = `${BRAND.assistant.name} — quotes, service and support`;
const DESCRIPTION = `Chat with the ${BRAND.assistant.name}: explore office equipment, request a quotation, arrange installation, maintenance or repair, and track your request — in English, Urdu or Roman Urdu.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/chat" },
  openGraph: { url: "/chat", title: `${TITLE} | ${BRAND.name}`, description: DESCRIPTION, images: [OG_IMAGE] },
};

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; category?: string }>;
}) {
  const [company, params] = await Promise.all([getCompanyProfile(), searchParams]);

  return (
    <div className="flex h-dvh flex-col bg-brand-surface sm:p-4 lg:p-6">
      <JsonLd
        graph={[
          assistantJsonLd(),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: BRAND.assistant.name, path: "/chat" },
          ]),
        ]}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-hidden bg-background shadow-elevated sm:rounded-2xl sm:border">
        <ChatWindow
          contact={{
            phone: company.phone,
            email: company.email,
            whatsappUrl: whatsappLink(company, `Hello ${BRAND.name}`),
          }}
          start={startReplyId(params)}
        />
      </div>
    </div>
  );
}
