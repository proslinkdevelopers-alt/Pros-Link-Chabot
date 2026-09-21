/** Shared domain types used by both client and server code. */

import type { Language } from "@/lib/i18n";
import type { Outgoing } from "@/lib/bot/render";

export type { Language } from "@/lib/i18n";
export type { Outgoing, Choice } from "@/lib/bot/render";

// ------------------------------------------------------------------- Chat ---

/**
 * A CRM record a conversation created — shown to the customer as a receipt
 * with its reference number.
 */
export interface CapturedRecord {
  kind: "LEAD" | "QUOTE" | "MEETING" | "TICKET";
  reference: string;
}

/** One turn from the web assistant's browser to `/api/chat`. */
export interface ChatTurnRequest {
  conversationRef: string;
  input: { kind: "text" | "reply"; text: string; replyId?: string };
}

/** The assistant's answer to one turn. */
export interface ChatTurnResponse {
  reference: string;
  language: Language;
  messages: Outgoing[];
  records: CapturedRecord[];
  /** A person from the team has the conversation; their replies arrive by polling. */
  staffHandling: boolean;
}

/** A message a staff member wrote from the console, fetched by the web assistant. */
export interface StaffReply {
  id: string;
  body: string;
  at: string;
}

// -------------------------------------------------------- Knowledge base ----

export type KnowledgeKind = "FAQ" | "ARTICLE" | "SERVICE" | "POLICY" | "DOCUMENT";

/** One entry in the knowledge base. */
export interface KnowledgeEntry {
  id: string;
  kind: KnowledgeKind;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
}

// ------------------------------------------------------------ Submissions ---

/** Uniform shape returned by the public submission endpoints. */
export interface SubmissionResult {
  ok: boolean;
  reference?: string;
  message: string;
}
