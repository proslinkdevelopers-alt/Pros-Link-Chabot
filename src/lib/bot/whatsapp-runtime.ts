import { absoluteUrl } from "@/lib/site";
import { sendButtons, sendList, sendText } from "@/lib/whatsapp/client";
import { createCrmRuntime, type CrmRuntime, type CrmRuntimeContext } from "./crm-runtime";
import type { Outgoing } from "./render";

/**
 * The WhatsApp runtime: the shared CRM runtime, delivering through the
 * WhatsApp Cloud API. Menus become lists, choices become reply buttons, and a
 * product photo rides on top of a button message when Meta can fetch it.
 */
export type WhatsAppRuntimeContext = Omit<CrmRuntimeContext, "channel" | "deliver"> & { waId: string };

export function createWhatsAppRuntime(ctx: WhatsAppRuntimeContext): CrmRuntime {
  return createCrmRuntime({
    ...ctx,
    channel: "WHATSAPP",
    deliver: (message: Outgoing) => {
      if (message.type === "text") return sendText(ctx.waId, message.body);
      if (message.type === "buttons") {
        return sendButtons(ctx.waId, message.body, message.buttons, message.footer, publicImage(message.header?.imageUrl));
      }
      return sendList(ctx.waId, message.body, message.button, message.rows, undefined, message.footer);
    },
  });
}

/** An image URL Meta can fetch: absolute https. Relative paths are made absolute. */
function publicImage(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const absolute = url.startsWith("/") ? absoluteUrl(url) : url;
  return /^https:\/\//i.test(absolute) ? absolute : undefined;
}
