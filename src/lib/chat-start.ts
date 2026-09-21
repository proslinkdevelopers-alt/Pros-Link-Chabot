/**
 * Deep links into the assistant: `/chat?start=quote`, `/chat?category=printers`.
 *
 * Each maps to the reply id of a menu, action or catalogue entry in the chatbot
 * configuration, so a button on the site opens the same flow a customer would
 * reach by tapping through the menu. Isomorphic.
 */
export const CHAT_STARTS = {
  products: { replyId: "a:explore_products", label: "Explore Products" },
  quote: { replyId: "a:get_quote", label: "Request a Quote" },
  service: { replyId: "n:service", label: "Installation & Support" },
  installation: { replyId: "a:request_installation", label: "New Installation" },
  maintenance: { replyId: "a:request_maintenance", label: "Maintenance" },
  repair: { replyId: "a:request_repair", label: "Repair / Maintenance" },
  parts: { replyId: "a:request_parts", label: "Parts Request" },
  support: { replyId: "n:support", label: "Customer Support" },
  sales: { replyId: "a:talk_to_sales", label: "Talk to Sales" },
  track: { replyId: "a:track_request", label: "Track My Request" },
} as const;

export type ChatStart = keyof typeof CHAT_STARTS;

export function chatHref(start: ChatStart): string {
  return `/chat?start=${start}`;
}

export function categoryHref(slug: string): string {
  return `/chat?category=${encodeURIComponent(slug)}`;
}

/** The reply id a deep link opens, or null for an unknown one. */
export function startReplyId(params: { start?: string | null; category?: string | null }): { replyId: string; label: string } | null {
  if (params.category && /^[a-z0-9-]{1,80}$/.test(params.category)) {
    return { replyId: `cat:${params.category}`, label: "Products" };
  }
  const start = params.start as ChatStart | undefined;
  return start && start in CHAT_STARTS ? CHAT_STARTS[start] : null;
}
