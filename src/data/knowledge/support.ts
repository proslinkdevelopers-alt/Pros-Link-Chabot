import { BRAND } from "@/config/brand";
import type { KnowledgeSeed } from "./types";

/** Complaints, tracking and what helps the team help you. */
export const SUPPORT: KnowledgeSeed[] = [
  {
    id: "pl-support-track",
    kind: "FAQ",
    category: "Support",
    question: "How do I track my request?",
    answer: `Every quote request and service ticket gets a reference number, such as ${BRAND.referencePrefix}-TKT-7F3K2Q9A. Tap Track My Request and enter it. On WhatsApp the assistant recognises your number; on the website it also asks for the phone number you used, so only you can see the status.`,
    keywords: ["track", "status", "reference", "ticket number", "my request", "follow up", "update", "kahan tak"],
  },
  {
    id: "pl-support-complaint",
    kind: "FAQ",
    category: "Support",
    question: "How do I make a complaint?",
    answer: "Open Customer Support and choose Submit a Complaint, or simply describe what went wrong. The complaint is logged with a reference number and passed to the team as a priority, with everything you've said so you don't have to repeat it.",
    keywords: ["complaint", "complain", "unhappy", "problem with service", "shikayat", "escalate"],
  },
  {
    id: "pl-support-details",
    kind: "FAQ",
    category: "Support",
    question: "What details help with a service request?",
    answer: "The machine type, brand and model, the serial number (usually on a label on the machine), what is going wrong or the error message, your city and a time that suits you for a visit. On WhatsApp, a photo of the error or the machine's label helps too.",
    keywords: ["serial number", "model number", "details", "information needed", "what do you need"],
  },
  {
    id: "pl-support-person",
    kind: "FAQ",
    category: "Support",
    question: "Can I talk to a person?",
    answer: `Yes. Ask for a person at any time, or tap Talk to Sales or Customer Support. The conversation goes to the right ${BRAND.name} team with a summary, and they reply in the same chat.`,
    keywords: ["human", "person", "agent", "representative", "talk to someone", "insaan", "banda"],
  },
];
